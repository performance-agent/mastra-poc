import { REQUIRE_MEMBERSHIP_KEY } from '../access-control/require-membership.decorator';
import { EvaluationView } from './dto/evaluation-view.dto';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

describe('EvaluationsController', () => {
  it('delegates workspace, body, and response view to the service', async () => {
    const evaluate = jest.fn().mockResolvedValue({ status: 'ready' });
    const controller = new EvaluationsController({
      evaluate,
    } as unknown as EvaluationsService);
    const dto = { rules: [{ name: 'Delivery', valuation: 8 }] };

    await expect(
      controller.evaluate('workspace-1', dto, { view: EvaluationView.FULL }),
    ).resolves.toEqual({ status: 'ready' });
    expect(evaluate).toHaveBeenCalledWith(
      'workspace-1',
      dto,
      EvaluationView.FULL,
    );
  });

  it.each(['evaluate', 'findAll', 'findOne'] as const)(
    'restricts %s to workspace owners and admins',
    (method) => {
      const metadata: unknown = Reflect.getMetadata(
        REQUIRE_MEMBERSHIP_KEY,
        EvaluationsController.prototype[method],
      );
      expect(metadata).toEqual({
        resource: 'workspace',
        param: 'workspaceId',
        roles: ['OWNER', 'ADMIN'],
      });
    },
  );

  it('delegates history and detail with the workspace scope', async () => {
    const findAll = jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null });
    const findOne = jest.fn().mockResolvedValue({ id: 'evaluation-1' });
    const controller = new EvaluationsController({
      findAll,
      findOne,
    } as unknown as EvaluationsService);
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
