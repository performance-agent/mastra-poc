jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EvaluatorsService } from './evaluators.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateEvaluatorDto } from './dto/evaluator.dto';

describe('Evaluator contexts', () => {
  const prisma = {
    workspace: { findUnique: jest.fn() },
    group: { findUnique: jest.fn() },
    evaluator: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    evaluatorVoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const access = { canAccessResource: jest.fn() };
  let service: EvaluatorsService;
  const body: CreateEvaluatorDto = {
    name: ' Ada ',
    scope: 'WORKSPACE',
    rules: [{ name: 'Ownership', valuation: 5 }],
    questions: [{ text: 'How is ownership shared?' }],
    disabledKnowledgeNodeIds: ['legacy-project-document'],
    disabledResourceIds: ['legacy-project-resource'],
  };
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.workspace.findUnique.mockResolvedValue({ id: 'ws' });
    prisma.group.findUnique.mockResolvedValue({
      id: 'project',
      workspaceId: 'ws',
    });
    prisma.evaluator.count.mockResolvedValue(0);
    prisma.evaluator.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'new', ...data }),
    );
    prisma.evaluatorVoice.findFirst.mockResolvedValue({ id: 'voice' });
    prisma.evaluatorVoice.findMany.mockResolvedValue([
      { id: 'voice', position: 0 },
    ]);
    prisma.evaluatorVoice.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'voice-new', ...data }),
    );
    prisma.$transaction.mockImplementation(
      (action: (tx: typeof prisma) => Promise<unknown>) => action(prisma),
    );
    access.canAccessResource.mockResolvedValue(true);
    service = new EvaluatorsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
    );
  });

  it('creates a shared evaluator without a project and preserves its configuration', async () => {
    const saved = await service.createForWorkspace('ws', 'owner', body);
    expect(saved).toMatchObject({
      id: 'new',
      name: 'Ada',
      scope: 'WORKSPACE',
      workspaceId: 'ws',
      groupId: null,
      ownerId: 'owner',
      personalityId: 'voice',
      disabledKnowledgeNodeIds: ['legacy-project-document'],
      disabledResourceIds: ['legacy-project-resource'],
      rules: { create: [{ name: 'Ownership', valuation: 5, position: 0 }] },
      questions: {
        create: [{ text: 'How is ownership shared?', position: 0 }],
      },
    });
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
    expect(access.canAccessResource).toHaveBeenCalledWith({
      userId: 'owner',
      resource: 'workspace',
      resourceId: 'ws',
      roles: ['OWNER', 'ADMIN'],
    });
  });

  it('rejects project scope on the workspace creation route', async () => {
    await expect(
      service.createForWorkspace('ws', 'owner', { ...body, scope: 'GROUP' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.evaluator.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);
    await expect(service.listForWorkspace('missing')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.createForWorkspace('missing', 'owner', body),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists only workspace evaluators and retains project inheritance without copies', async () => {
    await service.listForWorkspace('ws');
    expect(prisma.evaluator.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws', scope: 'WORKSPACE', groupId: null },
      }),
    );
    await service.listForGroup('project');
    expect(prisma.evaluator.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws',
          OR: [
            { scope: 'GROUP', groupId: 'project' },
            { scope: 'WORKSPACE', groupId: null },
          ],
        },
      }),
    );
    expect(prisma.evaluator.create).not.toHaveBeenCalled();
  });

  it.each(['project-admin', 'workspace-viewer'])(
    'denies shared writes to %s',
    async (userId) => {
      access.canAccessResource.mockResolvedValue(false);
      prisma.evaluator.findUnique.mockResolvedValue({
        id: 'shared',
        scope: 'WORKSPACE',
        workspaceId: 'ws',
        groupId: null,
      });
      await expect(
        service.createForWorkspace('ws', userId, body),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update('shared', userId, { name: 'Changed' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.remove('shared', userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.createWorkspacePersonality('ws', userId, {
          name: 'Tone',
          instruction: 'Be clear',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.evaluator.create).not.toHaveBeenCalled();
      expect(prisma.evaluator.delete).not.toHaveBeenCalled();
      expect(prisma.evaluatorVoice.create).not.toHaveBeenCalled();
    },
  );

  it.each(['workspace-admin', 'organization-admin'])(
    'uses inherited workspace authority for %s',
    async (userId) => {
      access.canAccessResource.mockResolvedValue(true);
      prisma.evaluator.findUnique.mockResolvedValue({
        id: 'shared',
        scope: 'WORKSPACE',
        workspaceId: 'ws',
        groupId: null,
        evaluationEmphasis: [],
        evaluationNotes: null,
      });
      await service.update('shared', userId, { name: 'Updated' });
      expect(prisma.evaluator.update.mock.calls).toMatchObject([
        [
          {
            where: { id: 'shared' },
            data: {
              name: 'Updated',
              scope: 'WORKSPACE',
              groupId: null,
            },
          },
        ],
      ]);
      await service.remove('shared', userId);
      expect(prisma.evaluator.delete).toHaveBeenCalledWith({
        where: { id: 'shared' },
      });
    },
  );

  it('creates a project evaluator through the existing endpoint with group authority', async () => {
    await service.create('project', 'project-admin', {
      ...body,
      scope: 'GROUP',
    });
    expect(access.canAccessResource).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'group', resourceId: 'project' }),
    );
    expect(prisma.evaluator.create.mock.calls).toMatchObject([
      [
        {
          data: {
            workspaceId: 'ws',
            groupId: 'project',
            scope: 'GROUP',
          },
        },
      ],
    ]);
  });

  it('rejects a personality owned by another workspace', async () => {
    prisma.evaluatorVoice.findFirst.mockResolvedValue(null);
    await expect(
      service.createForWorkspace('ws', 'owner', {
        ...body,
        personalityId: 'foreign',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.evaluatorVoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', workspaceId: 'ws' },
    });
  });

  it('reads and creates workspace personalities without a project', async () => {
    await service.listWorkspacePersonalities('ws');
    expect(prisma.evaluatorVoice.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws' },
      orderBy: { position: 'asc' },
    });
    await service.createWorkspacePersonality('ws', 'owner', {
      name: ' Calm ',
      instruction: ' Be clear ',
    });
    expect(prisma.evaluatorVoice.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws',
        name: 'Calm',
        instruction: 'Be clear',
        position: 1,
      },
    });
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
  });
});
