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
import { CreateEvaluatorDto, UpdateEvaluatorDto } from './dto/evaluator.dto';
import { EvaluatorsService } from './evaluators.service';

@Controller()
export class EvaluatorsController {
  constructor(private readonly evaluators: EvaluatorsService) {}

  @Get('groups/:id/evaluators')
  @RequireMembership({
    param: 'id',
    resource: 'group',
    roles: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.VIEWER],
  })
  list(@Param('id') groupId: string) {
    return this.evaluators.listForGroup(groupId);
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
