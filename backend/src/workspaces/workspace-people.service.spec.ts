jest.mock('./people-comparison.service', () => ({
  PeopleComparisonService: class {},
}));
import type { PeopleComparisonService } from './people-comparison.service';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  readPeopleSummary,
  WorkspacePeopleService,
} from './workspace-people.service';

describe('WorkspacePeopleService', () => {
  const visible = { workspaceId: 'ws', OR: [{ id: 'visible-group' }] };
  const prisma = {
    group: { findMany: jest.fn() },
    evaluator: { findMany: jest.fn() },
  };
  const access = { buildAccessibleGroupsWhere: jest.fn(() => visible) };
  const evaluator = {
    id: 'balanced',
    name: 'Balanced',
    avatar: 0,
    scope: 'WORKSPACE',
    groupId: null,
  };
  let service: WorkspacePeopleService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkspacePeopleService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      {
        read: jest.fn().mockResolvedValue({ comparison: null }),
      } as unknown as PeopleComparisonService,
    );
    prisma.group.findMany.mockResolvedValueOnce([
      { id: 'visible-group', name: 'Platform' },
    ]);
    prisma.evaluator.findMany.mockResolvedValue([evaluator]);
  });
  it('limits evaluator choices and latest reports to accessible groups', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      {
        id: 'visible-group',
        name: 'Platform',
        performanceReports: [
          {
            id: 'report',
            createdAt: new Date(),
            updatedAt: new Date(),
            data: {
              people: [
                {
                  displayName: 'Lucia',
                  metrics: [{ label: 'Reviews', value: '6' }],
                  assessment: { status: 'GOOD', summary: 'Reviewed changes.' },
                },
              ],
            },
          },
        ],
      },
    ]);
    const result = await service.list('ws', 'viewer', 'balanced');
    expect(access.buildAccessibleGroupsWhere).toHaveBeenCalledWith(
      'ws',
      'viewer',
      ['OWNER', 'ADMIN', 'VIEWER'],
    );
    expect(prisma.evaluator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws',
          OR: [
            { scope: 'WORKSPACE', groupId: null },
            { scope: 'GROUP', groupId: { in: ['visible-group'] } },
          ],
        }),
      }),
    );
    expect(prisma.group.findMany.mock.calls[1][0]).toMatchObject({
      where: visible,
      select: {
        performanceReports: {
          where: { type: 'GROUP_REPORT', evaluatorId: 'balanced' },
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    expect(result.groups[0].report?.people[0]).toMatchObject({
      displayName: 'Lucia',
      metrics: [{ label: 'Reviews', value: '6' }],
      assessment: { status: 'GOOD' },
    });
  });
  it('rejects another workspace or inaccessible group evaluator before reading reports', async () => {
    await expect(
      service.list('ws', 'viewer', 'private-evaluator'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
  });
  it('returns empty groups instead of borrowing another evaluator report', async () => {
    prisma.group.findMany.mockResolvedValueOnce([
      { id: 'visible-group', name: 'Platform', performanceReports: [] },
    ]);
    expect((await service.list('ws', 'viewer')).groups[0].report).toBeNull();
  });
  it('does not query reports when there are no evaluators', async () => {
    prisma.evaluator.findMany.mockResolvedValueOnce([]);
    expect(await service.list('ws', 'viewer')).toMatchObject({
      evaluatorId: null,
      evaluators: [],
      groups: [{ report: null }],
    });
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('saved people compatibility', () => {
  it('retains a legacy summary without inventing status, metrics or dates', () => {
    expect(
      readPeopleSummary({
        people: [{ displayName: 'A', contributionSummary: 'Saved text' }],
      }),
    ).toMatchObject({
      period: null,
      evaluator: null,
      people: [
        {
          displayName: 'A',
          contributionSummary: 'Saved text',
          metrics: [],
          assessment: { status: 'INSUFFICIENT_DATA' },
        },
      ],
    });
    expect(readPeopleSummary(null).people).toEqual([]);
  });
  it('keeps only evidence attributed to the exact person', () => {
    const evidence = (subject: string, section = 'PEOPLE') => ({
      section,
      subject,
      type: 'review',
      resource: 'repo',
      reference: null,
      title: subject,
      url: null,
      observation: 'Saved fact',
      interpretation: 'Saved interpretation',
    });
    const result = readPeopleSummary({
      people: [{ displayName: 'A' }, { displayName: 'B' }],
      evidence: [evidence('A'), evidence('B'), evidence('A', 'ENGINEERING')],
    });
    expect(result.people.map((p) => p.evidence.map((e) => e.title))).toEqual([
      ['A'],
      ['B'],
    ]);
  });
});
