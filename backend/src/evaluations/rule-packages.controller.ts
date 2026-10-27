import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { type User } from '../auth/types/user.type';
import { RequireMembership } from '../access-control/require-membership.decorator';
import {
  CreateRulePackageDto,
  UpdateRulePackageDto,
} from './dto/rule-package.dto';
import { RulePackagesService } from './rule-packages.service';

@Controller('workspaces/:workspaceId/rule-packages')
export class RulePackagesController {
  constructor(private readonly rulePackages: RulePackagesService) {}

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get()
  findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.rulePackages.findAll(workspaceId, user.id);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateRulePackageDto,
  ) {
    return this.rulePackages.create(workspaceId, user.id, dto);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':packageId')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateRulePackageDto,
  ) {
    return this.rulePackages.update(workspaceId, user.id, packageId, dto);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':packageId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: User,
  ) {
    return this.rulePackages.remove(workspaceId, user.id, packageId);
  }
}
