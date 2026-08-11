import { REQUIRE_MEMBERSHIP_KEY } from '../access-control/require-membership.decorator';
import { EvaluationView } from './dto/evaluation-view.dto';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

describe('EvaluationsController', () => {
  it('delegates workspace, body, and response view to the service', async () => {
    const evaluate = jest.fn().mockResolvedValue({ status: 'ready' });
    const controller = new EvaluationsController({ evaluate } as unknown as EvaluationsService);
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

  it('restricts evaluation generation to workspace owners and admins', () => {
    const metadata = Reflect.getMetadata(
      REQUIRE_MEMBERSHIP_KEY,
      EvaluationsController.prototype.evaluate,
    );
    expect(metadata).toEqual({
      resource: 'workspace',
      param: 'workspaceId',
      roles: ['OWNER', 'ADMIN'],
    });
  });
});
