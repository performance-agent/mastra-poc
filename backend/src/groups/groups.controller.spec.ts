jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('octokit', () => ({
  Octokit: jest.fn(),
}));

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

jest.mock('../mastra', () => ({
  mastra: {
    getAgent: jest.fn(() => ({
      generate: jest.fn(),
    })),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { MembersService } from '../members/members.service';
import { ResourcesService } from '../resources/resources.service';
import { ReportsService } from '../reports/reports.service';
import { InvitationsService } from '../invitations/invitations.service';

describe('GroupsController', () => {
  let controller: GroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: {} },
        { provide: MembersService, useValue: {} },
        { provide: ResourcesService, useValue: {} },
        { provide: ReportsService, useValue: {} },
        { provide: InvitationsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<GroupsController>(GroupsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
