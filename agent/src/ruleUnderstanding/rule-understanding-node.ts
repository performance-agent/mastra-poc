import type { PreparedRuleInput } from '../ruleInput/types.js';
import type { ResourceCatalogNodeResult } from '../resourceCatalog/types.js';
import { ZodError } from 'zod';
import {
  ruleUnderstandingAiOutputSchema,
  type RuleUnderstandingAiOutput,
} from './schemas.js';
import type {
  FailedRuleUnderstanding,
  FailedRuleUnderstandingCode,
  RuleClarificationRequest,
  RuleInterpreter,
  RuleUnderstandingNode,
  RuleUnderstandingNodeOptions,
  RuleUnderstandingNodeResult,
  RuleUnderstandingNodeStatus,
  UnderstoodRule,
} from './types.js';

const DEFAULT_MAX_CONCURRENCY = 3;

type RuleOutcome =
  | { kind: 'understood'; value: UnderstoodRule }
  | { kind: 'clarification'; value: RuleClarificationRequest }
  | { kind: 'failed'; value: FailedRuleUnderstanding };

export function createRuleUnderstandingNode(
  options: RuleUnderstandingNodeOptions,
): RuleUnderstandingNode {
  const maxConcurrency = normalizeConcurrency(options.maxConcurrency);

  return {
    async run(input) {
      const outcomes = await mapWithConcurrency(
        input.runnableRules,
        maxConcurrency,
        (rule) =>
          interpretRule(rule, input.resourceCatalog, options.interpreter),
      );

      return toResult(outcomes);
    },
  };
}

async function interpretRule(
  preparedRule: PreparedRuleInput,
  resourceCatalog: ResourceCatalogNodeResult,
  interpreter: RuleInterpreter,
): Promise<RuleOutcome> {
  let rawOutput: unknown;
  try {
    rawOutput = await interpreter.interpret({ preparedRule, resourceCatalog });
  } catch (error) {
    if (error instanceof ZodError) {
      return failedOutcome(
        preparedRule,
        'invalid_ai_output',
        `The AI model returned an invalid rule interpretation: ${formatZodIssues(error)}`,
      );
    }
    return failedOutcome(
      preparedRule,
      'ai_generation_failed',
      'The AI model could not interpret this rule.',
    );
  }

  const parsedOutput = ruleUnderstandingAiOutputSchema.safeParse(rawOutput);
  if (!parsedOutput.success) {
    return failedOutcome(
      preparedRule,
      'invalid_ai_output',
      `The AI model returned an invalid rule interpretation: ${formatZodIssues(parsedOutput.error)}`,
    );
  }

  return successfulOutcome(preparedRule, parsedOutput.data);
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.length > 0 ? issue.path.join('.') : 'output'}: ${issue.message}`,
    )
    .join('; ');
}

function successfulOutcome(
  preparedRule: PreparedRuleInput,
  output: RuleUnderstandingAiOutput,
): RuleOutcome {
  if (output.ambiguityDetected) {
    return {
      kind: 'clarification',
      value: {
        ...preparedRule,
        ambiguityReason: output.ambiguityReason,
        clarificationQuestion: output.clarificationQuestion,
      },
    };
  }

  return {
    kind: 'understood',
    value: {
      ...preparedRule,
      interpretedGoal: output.interpretedGoal,
      evaluationQuestions: output.evaluationQuestions,
      expectedSignals: output.expectedSignals,
    },
  };
}

function failedOutcome(
  preparedRule: PreparedRuleInput,
  code: FailedRuleUnderstandingCode,
  message: string,
): RuleOutcome {
  return { kind: 'failed', value: { ...preparedRule, code, message } };
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

function toResult(
  outcomes: readonly RuleOutcome[],
): RuleUnderstandingNodeResult {
  const understoodRules: UnderstoodRule[] = [];
  const clarificationRequests: RuleClarificationRequest[] = [];
  const failedRules: FailedRuleUnderstanding[] = [];

  for (const outcome of outcomes) {
    if (outcome.kind === 'understood') understoodRules.push(outcome.value);
    else if (outcome.kind === 'clarification')
      clarificationRequests.push(outcome.value);
    else failedRules.push(outcome.value);
  }

  return {
    status: resolveStatus(
      outcomes.length,
      clarificationRequests.length,
      failedRules.length,
    ),
    understoodRules,
    clarificationRequests,
    failedRules,
  };
}

function resolveStatus(
  total: number,
  clarificationCount: number,
  failureCount: number,
): RuleUnderstandingNodeStatus {
  if (total === 0 || failureCount === total) return 'failed';
  if (failureCount > 0) return 'partial';
  if (clarificationCount > 0) return 'needs_clarification';
  return 'ready';
}
