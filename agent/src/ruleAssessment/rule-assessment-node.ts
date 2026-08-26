import { ruleAssessmentAiOutputSchema } from './schemas.js';
import type {
  RuleAssessment,
  RuleAssessmentError,
  RuleAssessmentNode,
  RuleAssessmentNodeOptions,
  RuleAssessmentNodeResult,
  RuleAssessmentNodeStatus,
  RuleAssessmentRequest,
} from './types.js';

const DEFAULT_MAX_CONCURRENCY = 3;

type AssessmentOutcome =
  | { kind: 'assessed'; ruleId: string; value: RuleAssessment }
  | { kind: 'failed'; value: RuleAssessmentError };

export function createRuleAssessmentNode(
  options: RuleAssessmentNodeOptions,
): RuleAssessmentNode {
  const maxConcurrency = normalizeConcurrency(options.maxConcurrency);

  return {
    async run({ plan, executionResult }) {
      const outcomes = await mapWithConcurrency(
        plan.rules,
        maxConcurrency,
        (rule) =>
          assessRule(
            {
              rule,
              context: plan.context,
              expectedEvidence: plan.expectedEvidence.filter(
                (evidence) => evidence.ruleId === rule.id,
              ),
              resourceCalls: executionResult.calls.filter((call) =>
                call.ruleIds.includes(rule.id),
              ),
              planLimitations: [...plan.limitations],
            },
            options.assessor,
          ),
      );
      return toResult(outcomes);
    },
  };
}

async function assessRule(
  request: RuleAssessmentRequest,
  assessor: RuleAssessmentNodeOptions['assessor'],
): Promise<AssessmentOutcome> {
  let rawOutput: unknown;
  try {
    rawOutput = await assessor.assess(request);
  } catch {
    return failed(
      request.rule.id,
      'ai_generation_failed',
      'The AI model could not assess this rule.',
    );
  }

  const parsed = ruleAssessmentAiOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    return failed(
      request.rule.id,
      'invalid_ai_output',
      'The AI model returned an invalid rule assessment.',
    );
  }

  return {
    kind: 'assessed',
    ruleId: request.rule.id,
    value: {
      ruleName: request.rule.rule.name,
      ...parsed.data,
    },
  };
}

function failed(
  ruleId: string,
  code: RuleAssessmentError['code'],
  message: string,
): AssessmentOutcome {
  return { kind: 'failed', value: { ruleId, code, message } };
}

function toResult(
  outcomes: readonly AssessmentOutcome[],
): RuleAssessmentNodeResult {
  const assessments: Record<string, RuleAssessment> = {};
  const errors: RuleAssessmentError[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'assessed')
      assessments[outcome.ruleId] = outcome.value;
    else errors.push(outcome.value);
  }
  const successful = Object.keys(assessments).length;
  return {
    status: resolveStatus(outcomes.length, successful, errors.length),
    assessments,
    errors,
  };
}

function resolveStatus(
  total: number,
  successful: number,
  failedCount: number,
): RuleAssessmentNodeStatus {
  if (total === 0 || failedCount === total) return 'failed';
  if (successful > 0 && failedCount > 0) return 'partial';
  return 'completed';
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_CONCURRENCY;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('maxConcurrency must be a positive safe integer.');
  }
  return value;
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  maxConcurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const outputs = new Array<TOutput>(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      const input = inputs[index];
      if (input !== undefined) outputs[index] = await mapper(input);
    }
  }

  const workerCount = Math.min(maxConcurrency, inputs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outputs;
}
