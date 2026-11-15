import { Controller, Get } from '@nestjs/common';
import { RequireMembership } from '../access-control/require-membership.decorator';
import { evaluationModels } from './evaluation-models';

@Controller('workspaces/:workspaceId/evaluation-models')
export class EvaluationModelsController {
  @RequireMembership({
    resource: 'workspace',
    param: 'workspaceId',
    roles: ['OWNER', 'ADMIN'],
  })
  @Get()
  models(this: void) {
    return evaluationModels();
  }
}
