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
import { InvitationsService } from '../invitations/invitations.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: {} },
        { provide: WorkspacesService, useValue: {} },
        { provide: MembersService, useValue: {} },
        { provide: ResourcesService, useValue: {} },
        { provide: PluginInstallationsService, useValue: {} },
        { provide: DataTypesService, useValue: {} },
        { provide: InvitationsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
