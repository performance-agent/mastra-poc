import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/enums';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';
import {
  CreateEvaluatorDto,
  PersonalityDto,
  UpdateEvaluatorDto,
} from './dto/evaluator.dto';
import { EvaluatorsService } from './evaluators.service';

@Controller()
export class EvaluatorsController {
  constructor(private readonly evaluators: EvaluatorsService) {}

  @Get('workspaces/:id/evaluators')
  @RequireMembership({
    param: 'id',
    resource: 'workspace',
    mode: 'context',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  listWorkspace(@Param('id') workspaceId: string) {
    return this.evaluators.listForWorkspace(workspaceId);
  }

  @Post('workspaces/:id/evaluators')
  @RequireMembership({
    param: 'id',
    resource: 'workspace',
    roles: ['OWNER', 'ADMIN'],
  })
  createWorkspace(
    @Param('id') workspaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateEvaluatorDto,
  ) {
    return this.evaluators.createForWorkspace(workspaceId, user.id, dto);
  }

  @Get('workspaces/:id/personalities')
  @RequireMembership({
    param: 'id',
    resource: 'workspace',
    mode: 'context',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  listWorkspacePersonalities(@Param('id') workspaceId: string) {
    return this.evaluators.listWorkspacePersonalities(workspaceId);
  }

  @Post('workspaces/:id/personalities')
  @RequireMembership({
    param: 'id',
    resource: 'workspace',
    roles: ['OWNER', 'ADMIN'],
  })
  createWorkspacePersonality(
    @Param('id') workspaceId: string,
    @CurrentUser() user: User,
    @Body() dto: PersonalityDto,
  ) {
    return this.evaluators.createWorkspacePersonality(
      workspaceId,
      user.id,
      dto,
    );
  }

  @Get('groups/:id/evaluators')
  @RequireMembership({
    param: 'id',
    resource: 'group',
    roles: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.VIEWER],
  })
  list(@Param('id') groupId: string) {
    return this.evaluators.listForGroup(groupId);
  }

  @Get('groups/:id/personalities')
  @RequireMembership({
    param: 'id',
    resource: 'group',
    roles: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.VIEWER],
  })
  listPersonalities(@Param('id') groupId: string) {
    return this.evaluators.listPersonalities(groupId);
  }

  @Post('groups/:id/personalities')
  @RequireMembership({
    param: 'id',
    resource: 'group',
    roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
  })
  createPersonality(
    @Param('id') groupId: string,
    @CurrentUser() user: User,
    @Body() dto: PersonalityDto,
  ) {
    return this.evaluators.createPersonality(groupId, user.id, dto);
  }

  @Patch('personalities/:id')
  updatePersonality(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: PersonalityDto,
  ) {
    return this.evaluators.updatePersonality(id, user.id, dto);
  }

  @Delete('personalities/:id')
  removePersonality(@Param('id') id: string, @CurrentUser() user: User) {
    return this.evaluators.removePersonality(id, user.id);
  }

  @Post('groups/:id/evaluators')
  @RequireMembership({
    param: 'id',
    resource: 'group',
    roles: [MembershipRole.OWNER, MembershipRole.ADMIN],
  })
  create(
    @Param('id') groupId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateEvaluatorDto,
  ) {
    return this.evaluators.create(groupId, user.id, dto);
  }

  @Patch('evaluators/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateEvaluatorDto,
  ) {
    return this.evaluators.update(id, user.id, dto);
  }

  @Delete('evaluators/:id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.evaluators.remove(id, user.id);
  }
}
