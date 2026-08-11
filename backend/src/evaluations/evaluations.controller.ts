import { Body, Controller, Param, Post, Query } from '@nestjs/common';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationViewDto } from './dto/evaluation-view.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('workspaces/:workspaceId/evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

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
