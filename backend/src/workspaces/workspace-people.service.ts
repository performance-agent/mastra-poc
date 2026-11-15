import { Injectable, NotFoundException } from '@nestjs/common';
import { PeopleComparisonService } from './people-comparison.service';
import { reportFields } from './people-comparison.schema';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { groupReportContentSchema } from '../mastra/schemas/group-report.schema';

const strings = z.array(z.string()).catch([]).default([]);
const emptyAssessment = {
  status: 'INSUFFICIENT_DATA' as const,
  confidence: 'INSUFFICIENT' as const,
  summary: '',
  positiveSignals: [],
  concerns: [],
  limitations: [],
};
const assessment = z
  .object({
    status: z
      .enum(['GOOD', 'WATCH', 'RISK', 'INSUFFICIENT_DATA'])
      .catch('INSUFFICIENT_DATA')
      .default('INSUFFICIENT_DATA'),
    confidence: z
      .enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'])
      .catch('INSUFFICIENT')
      .default('INSUFFICIENT'),
    summary: z.string().catch('').default(''),
    positiveSignals: strings,
    concerns: strings,
    limitations: strings,
  })
  .catch(emptyAssessment)
  .default(emptyAssessment);
const person = z.object({
  displayName: z.string().min(1),
  assessment,
  contributionSummary: z.string().catch('').default(''),
  metrics: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .catch([])
    .default([]),
  consistency: z
    .object({ summary: z.string(), limitations: strings })
    .nullable()
    .catch(null)
    .default(null),
  improvementAreas: strings,
  suggestions: strings,
});
const envelope = z.object({
  people: z.array(z.unknown()).catch([]).default([]),
  evidence: z.array(z.unknown()).catch([]).default([]),
  period: z
    .object({ from: z.string(), to: z.string() })
    .nullable()
    .catch(null)
    .default(null),
  evaluator: z
    .object({ id: z.string(), name: z.string(), avatar: z.number() })
    .nullable()
    .catch(null)
    .default(null),
});

/** Read adapter: older reports remain readable without generating or rewriting them. */
export function readPeopleSummary(data: unknown) {
  const parsed = envelope.safeParse(reportFields(data));
  if (!parsed.success) return { people: [], period: null, evaluator: null };
  const evidence = parsed.data.evidence.flatMap((entry) => {
    const item =
      groupReportContentSchema.shape.evidence.element.safeParse(entry);
    return item.success && item.data.section === 'PEOPLE' ? [item.data] : [];
  });
  return {
    period: parsed.data.period,
    evaluator: parsed.data.evaluator,
    people: parsed.data.people.flatMap((entry, sourceIndex) => {
      const item = person.safeParse(entry);
      return item.success
        ? [
            {
              ...item.data,
              sourceIndex,
              evidence: evidence.filter(
                (e) => e.subject === item.data.displayName,
              ),
            },
          ]
        : [];
    }),
  };
}

@Injectable()
export class WorkspacePeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly comparison: PeopleComparisonService,
  ) {}

  async list(
    workspaceId: string,
    userId: string,
    requestedEvaluatorId?: string,
  ) {
    const where = this.access.buildAccessibleGroupsWhere(workspaceId, userId, [
      'OWNER',
      'ADMIN',
      'VIEWER',
    ]);
    const groups = await this.prisma.group.findMany({
      where,
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const evaluators = await this.prisma.evaluator.findMany({
      where: {
        workspaceId,
        OR: [
          { scope: 'WORKSPACE', groupId: null },
          { scope: 'GROUP', groupId: { in: groups.map((g) => g.id) } },
        ],
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        scope: true,
        groupId: true,
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    const selected = requestedEvaluatorId
      ? evaluators.find((e) => e.id === requestedEvaluatorId)
      : evaluators[0];
    if (requestedEvaluatorId && !selected)
      throw new NotFoundException('Evaluator not found for this workspace');
    if (!selected)
      return {
        evaluators,
        evaluatorId: null,
        groups: groups.map((g) => ({ ...g, available: false, report: null })),
      };
    const rows = await this.prisma.group.findMany({
      where,
      select: {
        id: true,
        name: true,
        performanceReports: {
          where: { type: 'GROUP_REPORT', evaluatorId: selected.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, createdAt: true, updatedAt: true, data: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return {
      evaluators,
      evaluatorId: selected.id,
      ...(selected.scope === 'WORKSPACE'
        ? await this.comparison.read(workspaceId, selected.id, userId)
        : {
            capabilities: { canRead: false, canGenerate: false },
            comparison: null,
            comparisonJob: null,
          }),
      groups: rows.map(({ performanceReports, ...group }) => {
        const saved = performanceReports[0];
        return {
          ...group,
          available:
            selected.scope === 'WORKSPACE' || selected.groupId === group.id,
          report: saved
            ? {
                id: saved.id,
                createdAt: saved.createdAt,
                updatedAt: saved.updatedAt,
                ...readPeopleSummary(saved.data),
                people: readPeopleSummary(saved.data).people.map(
                  ({ sourceIndex, ...person }) => ({
                    ...person,
                    personId: `${saved.id}:${sourceIndex}`,
                  }),
                ),
              }
            : null,
        };
      }),
    };
  }
}
