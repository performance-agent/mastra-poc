import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkspacePeopleService } from '../workspaces/workspace-people.service';
import { PeopleComparisonService } from '../workspaces/people-comparison.service';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';
import { MembershipRole } from '../../generated/prisma/enums';
import { AccessControlService } from '../access-control/access-control.service';
import { GROUP_REPORT_INSTRUCTIONS } from '../mastra/group-report-instructions';
import { EvaluatorsService } from '../evaluators/evaluators.service';
import { groupReportContentSchema } from '../mastra/schemas/group-report.schema';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

const readSecurity = [{ type: 'oauth2', scopes: ['reports:read'] }];
const writeSecurity = [
  { type: 'oauth2', scopes: ['reports:read', 'reports:write'] },
];
const periodSchema = z.object({ from: z.string(), to: z.string() }).optional();
const knowledgeSelectionSchema = z
  .object({
    sourceIds: z.array(z.string()).max(200).optional(),
    folderIds: z.array(z.string()).max(200).optional(),
  })
  .optional();

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  organization: z.object({ id: z.string(), name: z.string() }),
  canCreateReport: z.boolean(),
});

@Injectable()
export class PerformanceMcpService {
  readonly server: MCPServer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly reports: ReportsService,
    private readonly evaluators: EvaluatorsService,
    private readonly people: WorkspacePeopleService,
    private readonly comparisons: PeopleComparisonService,
  ) {
    const listGroups = createTool({
      id: 'list_groups',
      description:
        'Lista los proyectos de Performance Platform que el usuario autenticado puede consultar.',
      inputSchema: z.object({}),
      outputSchema: z.object({ groups: z.array(groupSchema) }),
      mcp: {
        annotations: {
          title: 'List accessible projects',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async (_input, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        const groups = await this.prisma.group.findMany({
          where: this.accessControl.buildAllAccessibleGroupsWhere(
            identity.userId,
            [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.VIEWER],
          ),
          include: {
            workspace: { include: { organization: true } },
          },
          orderBy: { name: 'asc' },
        });

        return {
          groups: await Promise.all(
            groups.map(async (group) => ({
              id: group.id,
              name: group.name,
              workspace: {
                id: group.workspace.id,
                name: group.workspace.name,
              },
              organization: {
                id: group.workspace.organization.id,
                name: group.workspace.organization.name,
              },
              canCreateReport: await this.accessControl.canAccessResource({
                userId: identity.userId,
                resource: 'group',
                resourceId: group.id,
                roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
              }),
            })),
          ),
        };
      },
    });

    const listEvaluators = createTool({
      id: 'list_evaluators',
      description:
        'Lista los evaluadores disponibles para un proyecto accesible. Pide al usuario que elija uno antes de analizar.',
      inputSchema: z.object({ groupId: z.string().min(1) }),
      outputSchema: z.object({
        evaluators: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            scope: z.enum(['WORKSPACE', 'GROUP']),
            effort: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            personality: z.string(),
          }),
        ),
      }),
      mcp: {
        annotations: {
          title: 'List project evaluators',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async ({ groupId }, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
          MembershipRole.VIEWER,
        ]);
        const rows = await this.evaluators.listForGroup(groupId);
        return {
          evaluators: rows.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            scope: e.scope,
            effort: e.effort,
            personality: e.personality.name,
          })),
        };
      },
    });

    const listKnowledgeSources = createTool({
      id: 'list_knowledge_sources',
      description:
        'Lista documentos y carpetas disponibles para el reporte. Por defecto se seleccionan todos los documentos listos; el usuario puede deseleccionar fuentes.',
      inputSchema: z.object({ groupId: z.string() }),
      outputSchema: z.object({
        canManage: z.boolean(),
        nodes: z.array(z.unknown()),
      }),
      mcp: {
        annotations: {
          title: 'List knowledge sources',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async ({ groupId }, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
          MembershipRole.VIEWER,
        ]);
        return this.reports.listKnowledgeSources(groupId, identity.userId);
      },
    });
    const getGroupReportContext = createTool({
      id: 'get_group_report_context',
      description:
        'Obtiene las instrucciones, el schema y todo el historial disponible de los recursos asignados a un proyecto accesible.',
      inputSchema: z.object({
        groupId: z.string().describe('ID obtenido desde list_groups.'),
        evaluatorId: z
          .string()
          .min(1)
          .describe('ID elegido desde list_evaluators.'),
        period: periodSchema,
        knowledgeSelection: knowledgeSelectionSchema,
      }),
      outputSchema: z.object({
        groupId: z.string(),
        evaluatorId: z.string(),
        knowledgeContextId: z.string(),
        evaluator: z.unknown(),
        period: z.object({ from: z.string(), to: z.string() }).nullable(),
        instructions: z.string(),
        generationPrompt: z.string(),
        schema: z.record(z.string(), z.unknown()),
        input: z.unknown(),
        nextStep: z.string(),
      }),
      mcp: {
        annotations: {
          title: 'Get group report context',
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async (
        { groupId, evaluatorId, period, knowledgeSelection },
        context,
      ) => {
        const identity = mcpIdentity(context, 'reports:read');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
          MembershipRole.VIEWER,
        ]);
        const external = await this.reports.prepareExternalGroupReport(
          groupId,
          evaluatorId,
          period,
          knowledgeSelection,
          identity.userId,
        );
        return {
          groupId,
          evaluatorId,
          knowledgeContextId: external.knowledgeContextId ?? '',
          evaluator: external.source.snapshot,
          period: external.period ?? null,
          instructions: GROUP_REPORT_INSTRUCTIONS,
          generationPrompt: external.generationPrompt,
          schema: z.toJSONSchema(groupReportContentSchema),
          input: external.prepared.reportInput,
          nextStep:
            'Genera únicamente el objeto report que cumple el schema y envíalo con el mismo groupId, evaluatorId, period y knowledgeContextId a create_group_report. No cambies de evaluador ni de fuentes.',
        };
      },
    });

    const createGroupReport = createTool({
      id: 'create_group_report',
      description:
        'Valida y guarda un Project Report generado con get_group_report_context. Sólo OWNER y ADMIN pueden usarla.',
      inputSchema: z.object({
        groupId: z.string().describe('ID obtenido desde list_groups.'),
        evaluatorId: z
          .string()
          .min(1)
          .describe('Mismo evaluador usado para obtener el contexto.'),
        period: periodSchema,
        knowledgeContextId: z
          .string()
          .min(1)
          .describe(
            'Contexto devuelto por get_group_report_context. Conserva las versiones exactas de las fuentes.',
          ),
        report: groupReportContentSchema,
      }),
      outputSchema: z.object({
        id: z.string(),
        groupId: z.string(),
        evaluatorId: z.string(),
        type: z.literal('GROUP_REPORT'),
        createdAt: z.string(),
      }),
      mcp: {
        annotations: {
          title: 'Create group report',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes: writeSecurity },
      },
      execute: async (
        { groupId, evaluatorId, period, knowledgeContextId, report },
        context,
      ) => {
        const identity = mcpIdentity(context, 'reports:write');
        await this.requireGroupRole(groupId, identity.userId, [
          MembershipRole.OWNER,
          MembershipRole.ADMIN,
        ]);
        const created = await this.reports.createGroupReportFromContent(
          groupId,
          report,
          { evaluatorId, period, knowledgeContextId, userId: identity.userId },
        );
        return {
          id: created.id,
          groupId,
          evaluatorId,
          type: 'GROUP_REPORT' as const,
          createdAt: created.createdAt.toISOString(),
        };
      },
    });

    const getWorkspacePeople = createTool({
      id: 'get_workspace_people',
      description:
        'Consulta People y la comparación guardada para un evaluador de workspace. No genera contenido.',
      inputSchema: z.object({
        workspaceId: z.string().min(1),
        evaluatorId: z.string().min(1),
      }),
      outputSchema: z.object({ data: z.unknown() }),
      mcp: {
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async ({ workspaceId, evaluatorId }, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        if (
          !(await this.accessControl.canViewResourceContext({
            resource: 'workspace',
            resourceId: workspaceId,
            userId: identity.userId,
            roles: ['OWNER', 'ADMIN', 'VIEWER'],
          }))
        )
          throw new ForbiddenException('Workspace access required');
        return {
          data: await this.people.list(
            workspaceId,
            identity.userId,
            evaluatorId,
          ),
        };
      },
    });
    const generateWorkspacePeopleComparison = createTool({
      id: 'generate_workspace_people_comparison',
      description:
        'Regenera la comparación de equipos y personas con los reportes guardados. Requiere OWNER/ADMIN del workspace. Devuelve un trabajo para consultar su progreso.',
      inputSchema: z.object({
        workspaceId: z.string().min(1),
        evaluatorId: z.string().min(1),
      }),
      outputSchema: z.object({
        jobId: z.string().nullable(),
        status: z.string(),
      }),
      mcp: {
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes: writeSecurity },
      },
      execute: async ({ workspaceId, evaluatorId }, context) => {
        const identity = mcpIdentity(context, 'reports:write');
        mcpIdentity(context, 'reports:read');
        return this.comparisons.generate(
          workspaceId,
          evaluatorId,
          identity.userId,
        );
      },
    });
    const getWorkspacePeopleComparisonJob = createTool({
      id: 'get_workspace_people_comparison_job',
      description:
        'Consulta el progreso del trabajo de comparación del workspace.',
      inputSchema: z.object({
        workspaceId: z.string().min(1),
        evaluatorId: z.string().min(1),
        jobId: z.string().min(1),
      }),
      outputSchema: z.object({ data: z.unknown() }),
      mcp: {
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: { securitySchemes: readSecurity },
      },
      execute: async ({ workspaceId, evaluatorId, jobId }, context) => {
        const identity = mcpIdentity(context, 'reports:read');
        return {
          data: await this.comparisons.jobStatus(
            workspaceId,
            evaluatorId,
            jobId,
            identity.userId,
          ),
        };
      },
    });

    this.server = new MCPServer({
      id: 'performance-platform',
      name: 'Performance Platform',
      version: '3.0.0',
      description:
        'Genera y persiste evaluaciones Project Report con los datos conectados a Performance Platform.',
      instructions:
        'Primero llama list_groups y list_evaluators para el proyecto elegido. Pide al usuario que elija evaluador. list_knowledge_sources permite consultar los documentos disponibles: todos los preparados se incluyen por defecto; knowledgeSelection permite deseleccionarlos, incluso todos con sourceIds vacío. Usa get_group_report_context con groupId, evaluatorId, período y selección opcionales. Aplica sus instrucciones y genera un reporte neutral en español sin inventar evidencia. Guarda con create_group_report usando el mismo proyecto, evaluador, período y knowledgeContextId devuelto; ese contexto conserva las versiones y fragmentos originales durante una hora. Sólo OWNER y ADMIN pueden guardar; VIEWER sólo puede consultar.',
      tools: {
        get_workspace_people: getWorkspacePeople,
        generate_workspace_people_comparison: generateWorkspacePeopleComparison,
        get_workspace_people_comparison_job: getWorkspacePeopleComparisonJob,
        list_knowledge_sources: listKnowledgeSources,
        list_groups: listGroups,
        list_evaluators: listEvaluators,
        get_group_report_context: getGroupReportContext,
        create_group_report: createGroupReport,
      },
    });
  }

  private async requireGroupRole(
    groupId: string,
    userId: string,
    roles: MembershipRole[],
  ) {
    const allowed = await this.accessControl.canAccessResource({
      userId,
      resource: 'group',
      resourceId: groupId,
      roles,
    });
    if (!allowed) {
      throw new ForbiddenException('You cannot access this project');
    }
  }
}

function mcpIdentity(
  context: {
    mcp?: {
      extra?: {
        authInfo?: unknown;
      };
    };
  },
  requiredScope: 'reports:read' | 'reports:write',
) {
  const authInfo = context.mcp?.extra?.authInfo as
    | {
        scopes?: string[];
        extra?: { userId?: string };
      }
    | undefined;
  const userId = authInfo?.extra?.userId;
  if (!userId || !authInfo?.scopes?.includes(requiredScope)) {
    throw new UnauthorizedException(`Missing ${requiredScope} authorization`);
  }
  return { userId, scopes: authInfo.scopes };
}
