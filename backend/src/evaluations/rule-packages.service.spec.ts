/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { RulePackageScope } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RulePackageWriteScope } from './dto/rule-package.dto';
import { RulePackagesService } from './rule-packages.service';

function setup() {
  const prisma = {
    rulePackage: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  return {
    prisma,
    service: new RulePackagesService(prisma as unknown as PrismaService),
  };
}

const input = {
  name: ' Delivery health ',
  evaluates: ' Flow and review ',
  scope: RulePackageWriteScope.WORKSPACE,
  rules: [
    {
      name: ' Review ',
      description: ' Meaningful review ',
      valuation: 8,
      position: 0,
    },
  ],
};

describe('RulePackagesService', () => {
  it('lists public and current-user packages available in the workspace', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.findMany.mockResolvedValue([]);

    await service.findAll('workspace-1', 'user-1');

    expect(prisma.rulePackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { scope: RulePackageScope.PUBLIC },
            {
              ownerId: 'user-1',
              OR: [
                { scope: RulePackageScope.ALL_WORKSPACES },
                {
                  scope: RulePackageScope.WORKSPACE,
                  workspaceId: 'workspace-1',
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it('creates a trimmed workspace-private package with ordered rules', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.create.mockResolvedValue({ id: 'package-1' });

    await service.create('workspace-1', 'user-1', input);

    expect(prisma.rulePackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Delivery health',
          evaluates: 'Flow and review',
          scope: RulePackageScope.WORKSPACE,
          ownerId: 'user-1',
          workspaceId: 'workspace-1',
          rules: {
            create: [
              {
                name: 'Review',
                description: 'Meaningful review',
                valuation: 8,
                position: 0,
              },
            ],
          },
        }),
      }),
    );
  });

  it('stores an all-workspaces package without a workspace relation', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.create.mockResolvedValue({ id: 'package-1' });

    await service.create('workspace-1', 'user-1', {
      ...input,
      scope: RulePackageWriteScope.ALL_WORKSPACES,
    });

    expect(prisma.rulePackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: null }),
      }),
    );
  });

  it('rejects duplicate rule positions', () => {
    const { service } = setup();
    expect(() =>
      service.create('workspace-1', 'user-1', {
        ...input,
        rules: [input.rules[0], { ...input.rules[0] }],
      }),
    ).toThrow('Rule positions must be unique');
  });

  it('replaces saved rules when the owner updates an available package', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      scope: RulePackageScope.WORKSPACE,
      workspaceId: 'workspace-1',
    });
    prisma.rulePackage.update.mockResolvedValue({ id: 'package-1' });

    await service.update('workspace-1', 'user-1', 'package-1', {
      rules: input.rules,
    });

    expect(prisma.rulePackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          rules: {
            deleteMany: {},
            create: expect.any(Array),
          },
        },
      }),
    );
  });

  it('claims a public package for the workspace when it is edited', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.findUnique.mockResolvedValue({
      ownerId: null,
      scope: RulePackageScope.PUBLIC,
      workspaceId: null,
    });
    prisma.rulePackage.update.mockResolvedValue({ id: 'public-1' });

    await service.update('workspace-1', 'user-1', 'public-1', input);

    expect(prisma.rulePackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: RulePackageScope.WORKSPACE,
          ownerId: 'user-1',
          workspaceId: 'workspace-1',
        }),
      }),
    );
  });

  it('deletes an owned private package', async () => {
    const { service, prisma } = setup();
    prisma.rulePackage.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      scope: RulePackageScope.ALL_WORKSPACES,
      workspaceId: null,
    });
    prisma.rulePackage.delete.mockResolvedValue({ id: 'package-1' });

    await service.remove('workspace-1', 'user-1', 'package-1');

    expect(prisma.rulePackage.delete).toHaveBeenCalledWith({
      where: { id: 'package-1' },
    });
  });

  it.each([
    {
      ownerId: 'other-user',
      scope: RulePackageScope.ALL_WORKSPACES,
      workspaceId: null,
    },
    {
      ownerId: 'user-1',
      scope: RulePackageScope.WORKSPACE,
      workspaceId: 'workspace-2',
    },
  ])('hides inaccessible private packages', async (record) => {
    const { service, prisma } = setup();
    prisma.rulePackage.findUnique.mockResolvedValue(record);

    await expect(
      service.remove('workspace-1', 'user-1', 'package-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rulePackage.delete).not.toHaveBeenCalled();
  });
});
