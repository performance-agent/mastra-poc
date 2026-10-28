import { REQUIRE_MEMBERSHIP_KEY } from '../access-control/require-membership.decorator';
import { RulePackageWriteScope } from './dto/rule-package.dto';
import { RulePackagesController } from './rule-packages.controller';
import { RulePackagesService } from './rule-packages.service';

describe('RulePackagesController', () => {
  it('delegates creation with workspace and authenticated user IDs', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'package-1' });
    const controller = new RulePackagesController({
      create,
    } as unknown as RulePackagesService);
    const dto = {
      name: 'Delivery',
      evaluates: 'Delivery flow',
      scope: RulePackageWriteScope.WORKSPACE,
      rules: [{ name: 'Flow', valuation: 8, position: 0 }],
    };

    await expect(
      controller.create('workspace-1', { id: 'user-1' } as never, dto),
    ).resolves.toEqual({ id: 'package-1' });
    expect(create).toHaveBeenCalledWith('workspace-1', 'user-1', dto);
  });

  it.each(['findAll', 'create', 'update', 'remove'] as const)(
    'restricts %s to workspace owners and admins',
    (method) => {
      expect(
        Reflect.getMetadata(
          REQUIRE_MEMBERSHIP_KEY,
          RulePackagesController.prototype[method],
        ),
      ).toEqual({
        resource: 'workspace',
        param: 'workspaceId',
        roles: ['OWNER', 'ADMIN'],
      });
    },
  );
});
