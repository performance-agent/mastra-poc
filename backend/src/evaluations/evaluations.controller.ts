import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationViewDto } from './dto/evaluation-view.dto';
import { EvaluationsService } from './evaluations.service';
import { ListEvaluationsDto } from './dto/list-evaluations.dto';

@Controller('workspaces/:workspaceId/evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get()
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListEvaluationsDto,
  ) {
    return this.evaluations.findAll(workspaceId, query);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get(':evaluationId')
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    return this.evaluations.findOne(workspaceId, evaluationId);
  }

  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Post()
  evaluate(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateEvaluationDto,
    @Query() query: EvaluationViewDto,
  ) {
    return this.evaluations.evaluate(workspaceId, dto, query.view);
  }
}
