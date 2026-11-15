import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationModelsController } from './evaluation-models.controller';
import { REQUIRE_MEMBERSHIP_KEY } from '../access-control/require-membership.decorator';

describe('rule-based analysis requests', () => {
  const request = {
    groupId: 'g',
    sourceReportIds: ['r1', 'r2'],
    rules: [{ name: 'Revisión colaborativa', valuation: 8 }],
    modelKey: 'balanced',
    reportLength: 'medium',
  };

  it('accepts rules directly without a saved evaluator', async () => {
    expect(
      await validate(plainToInstance(CreateEvaluationDto, request)),
    ).toEqual([]);
  });

  it.each([
    { rules: undefined },
    { rules: [] },
    { rules: [{ name: ' ', valuation: 8 }] },
    { rules: [{ name: 'Revisión', valuation: 11 }] },
    { modelKey: 'arbitrary' },
    { reportLength: 'tiny' },
    { sourceReportIds: ['r1', 'r1'] },
  ])('rejects invalid analysis input %j', async (patch) => {
    expect(
      await validate(
        plainToInstance(CreateEvaluationDto, { ...request, ...patch }),
      ),
    ).not.toEqual([]);
  });

  it('requires request rules even when an old client sends evaluator IDs', async () => {
    const errors = await validate(
      plainToInstance(CreateEvaluationDto, {
        groupId: request.groupId,
        sourceReportIds: request.sourceReportIds,
        agentIds: ['old-evaluator'],
      }),
    );
    expect(errors.some((error) => error.property === 'rules')).toBe(true);
  });

  it('restricts model discovery to workspace owners and admins', () => {
    expect(
      Reflect.getMetadata(
        REQUIRE_MEMBERSHIP_KEY,
        EvaluationModelsController.prototype.models,
      ),
    ).toEqual({
      resource: 'workspace',
      param: 'workspaceId',
      roles: ['OWNER', 'ADMIN'],
    });
  });
});
