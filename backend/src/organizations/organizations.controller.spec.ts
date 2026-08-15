jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('octokit', () => ({
  Octokit: jest.fn(),
}));

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';
import { PluginInstallationsService } from '../plugin-installations/plugin-installations.service';
import { DataTypesService } from '../data-types/data-types.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  const pluginInstallations = { setupPlugin: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: {} },
        { provide: WorkspacesService, useValue: {} },
        { provide: MembersService, useValue: {} },
        { provide: ResourcesService, useValue: {} },
        { provide: PluginInstallationsService, useValue: pluginInstallations },
        { provide: DataTypesService, useValue: {} },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates generic plugin setup for an organization', async () => {
    const dto = {
      name: 'Salesforce',
      configuration: {
        loginUrl: 'https://acme.my.salesforce.com',
        clientId: 'client-id',
        clientSecret: 'secret',
      },
    };
    pluginInstallations.setupPlugin.mockResolvedValue({ id: 'installation' });

    await expect(
      controller.setupPlugin('org', 'salesforce', dto),
    ).resolves.toEqual({ id: 'installation' });
    expect(pluginInstallations.setupPlugin).toHaveBeenCalledWith(
      'org',
      'salesforce',
      dto,
    );
  });
});
