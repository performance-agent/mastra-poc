import { PrismaService } from '../prisma/prisma.service';
import { TaskAnalysisService } from './task-analysis.service';
import { REQUIRE_MEMBERSHIP_KEY } from '../access-control/require-membership.decorator';
import { EvaluationView } from './dto/evaluation-view.dto';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

describe('EvaluationsController', () => {
  it('requires a group for recovery and delegates scoped progress lookups', async () => {
    const latestJob = jest.fn().mockResolvedValue(null);
    const jobStatus = jest.fn().mockResolvedValue({ status: 'running' });
    const controller = new EvaluationsController(
      { latestJob, jobStatus } as unknown as EvaluationsService,
      {} as PrismaService,
      {} as TaskAnalysisService,
    );
    expect(() => controller.latestJob('workspace', '')).toThrow(
      'groupId is required',
    );
    expect(latestJob).not.toHaveBeenCalled();
    await controller.latestJob('workspace', 'group');
    await controller.jobStatus('workspace', 'job');
    expect(latestJob).toHaveBeenCalledWith('workspace', 'group');
    expect(jobStatus).toHaveBeenCalledWith('workspace', 'job');
  });
  it('delegates workspace, body, and response view to the service', async () => {
    const enqueue = jest.fn().mockResolvedValue({ status: 'ready' });
    const controller = new EvaluationsController(
      {
        enqueue,
      } as unknown as EvaluationsService,
      {} as PrismaService,
      {} as TaskAnalysisService,
    );
    const dto = { rules: [{ name: 'Delivery', valuation: 8 }] };

    await expect(
      controller.evaluate('workspace-1', dto, { view: EvaluationView.FULL }),
    ).resolves.toEqual({ status: 'ready' });
    expect(enqueue).toHaveBeenCalledWith(
      'workspace-1',
      dto,
      EvaluationView.FULL,
    );
  });

  it.each([
    'evaluate',
    'findAll',
    'findOne',
    'jobStatus',
    'latestJob',
  ] as const)('restricts %s to workspace owners and admins', (method) => {
    const metadata: unknown = Reflect.getMetadata(
      REQUIRE_MEMBERSHIP_KEY,
      EvaluationsController.prototype[method],
    );
    expect(metadata).toEqual({
      resource: 'workspace',
      param: 'workspaceId',
      roles: ['OWNER', 'ADMIN'],
    });
  });

  it('delegates history and detail with the workspace scope', async () => {
    const findAll = jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null });
    const findOne = jest.fn().mockResolvedValue({ id: 'evaluation-1' });
    const controller = new EvaluationsController(
      {
        findAll,
        findOne,
      } as unknown as EvaluationsService,
      {} as PrismaService,
      {} as TaskAnalysisService,
    );
    await controller.findAll('workspace-1', {
      groupId: 'group-1',
      cursor: 'cursor-1',
    });
    await controller.findOne('workspace-1', 'evaluation-1');
    expect(findAll).toHaveBeenCalledWith('workspace-1', {
      groupId: 'group-1',
      cursor: 'cursor-1',
    });
    expect(findOne).toHaveBeenCalledWith('workspace-1', 'evaluation-1');
  });
});
