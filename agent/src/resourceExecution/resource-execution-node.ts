import type {
  EvaluationContext,
  PlannedResourceUsage,
} from '../evaluationPlan/types.js';
import type {
  FailedResourceCall,
  ResourceCallResult,
  ResourceExecutionNode,
  ResourceExecutionNodeOptions,
  ResourceExecutionNodeResult,
  ResourceExecutionNodeStatus,
  ResourceExecutor,
  SuccessfulResourceCall,
} from './types.js';

const DEFAULT_MAX_CONCURRENCY = 3;

export function createResourceExecutionNode(
  options: ResourceExecutionNodeOptions,
): ResourceExecutionNode {
  const maxConcurrency = normalizeConcurrency(options.maxConcurrency);

  return {
    async run({ plan }) {
      const calls = await mapWithConcurrency(
        plan.resourcePlan,
        maxConcurrency,
        (usage) => executeUsage(usage, plan.context, options.executor),
      );
      return toResult(calls);
    },
  };
}

async function executeUsage(
  usage: PlannedResourceUsage,
  context: EvaluationContext,
  executor: ResourceExecutor,
): Promise<ResourceCallResult> {
  const trace = {
    resourceUsageId: usage.id,
    resourceId: usage.resourceId,
    operationName: usage.operationName,
    ruleIds: [...usage.ruleIds],
    expectedEvidenceIds: [...usage.expectedEvidenceIds],
  };

  try {
    const rawData = await executor.execute({
      context,
      resourceId: usage.resourceId,
      operationName: usage.operationName,
      ...(usage.parameters === undefined
        ? {}
        : { parameters: usage.parameters }),
    });
    const result: SuccessfulResourceCall = {
      ...trace,
      status: 'succeeded',
      rawData,
    };
    return result;
  } catch (error) {
    const result: FailedResourceCall = {
      ...trace,
      status: 'failed',
      error: {
        code: 'resource_execution_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return result;
  }
}

function toResult(calls: ResourceCallResult[]): ResourceExecutionNodeResult {
  const successful = calls.filter((call) => call.status === 'succeeded').length;
  const failed = calls.length - successful;
  return {
    status: resolveStatus(calls.length, successful, failed),
    calls,
    callCounts: { total: calls.length, successful, failed },
  };
}

function resolveStatus(
  total: number,
  successful: number,
  failed: number,
): ResourceExecutionNodeStatus {
  if (total > 0 && failed === total) return 'failed';
  if (successful > 0 && failed > 0) return 'partial';
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
