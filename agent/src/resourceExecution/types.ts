import type {
  EvaluationContext,
  EvaluationPlan,
  SelectedOperationParameters,
} from '../evaluationPlan/types.js';

export type ResourceExecutionRequest = {
  context: EvaluationContext;
  resourceId: string;
  operationName: string;
  parameters?: SelectedOperationParameters | undefined;
};

export type ResourceExecutor = {
  execute(input: ResourceExecutionRequest): Promise<unknown>;
};

export type ResourceExecutionDataset = {
  dataType: string;
  records: readonly unknown[];
  count: number;
  truncated: boolean;
  limitations: string[];
};

export type ResourceExecutionNodeOptions = {
  executor: ResourceExecutor;
  maxConcurrency?: number;
};

type ResourceCallTrace = {
  resourceUsageId: string;
  resourceId: string;
  operationName: string;
  ruleIds: string[];
  expectedEvidenceIds: string[];
};

export type SuccessfulResourceCall = ResourceCallTrace & {
  status: 'succeeded';
  rawData: unknown;
};

export type FailedResourceCall = ResourceCallTrace & {
  status: 'failed';
  error: {
    code: 'resource_execution_failed';
    message: string;
  };
};

export type ResourceCallResult = SuccessfulResourceCall | FailedResourceCall;

export type ResourceExecutionNodeStatus = 'completed' | 'partial' | 'failed';

export type ResourceExecutionNodeResult = {
  status: ResourceExecutionNodeStatus;
  calls: ResourceCallResult[];
  callCounts: {
    total: number;
    successful: number;
    failed: number;
  };
};

export type ResourceExecutionNode = {
  run(input: { plan: EvaluationPlan }): Promise<ResourceExecutionNodeResult>;
};
