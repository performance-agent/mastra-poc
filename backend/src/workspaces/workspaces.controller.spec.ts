jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { GroupsService } from '../groups/groups.service';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';
import { InvitationsService } from '../invitations/invitations.service';

describe('WorkspacesController', () => {
  let controller: WorkspacesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [
        { provide: WorkspacesService, useValue: {} },
        { provide: GroupsService, useValue: {} },
        { provide: MembersService, useValue: {} },
        { provide: ResourcesService, useValue: {} },
        { provide: InvitationsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<WorkspacesController>(WorkspacesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
