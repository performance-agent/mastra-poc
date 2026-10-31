export type GenerationProgress = {
  stage: string;
  completed: string[];
  total: number;
  updatedAt: string;
};

export type ReportProgress = (
  stage: string,
  state?: 'started' | 'completed',
) => Promise<void>;

export const evaluationStages = [
  'preparing',
  'rule_input',
  'resource_catalog',
  'rule_understanding',
  'resource_selection',
  'resource_operation_deduplication',
  'evaluation_plan',
  'resource_execution',
  'rule_assessment',
  'saving',
] as const;

export const synthesisStages = [
  'preparing',
  'generating',
  'validating',
  'finalizing',
] as const;
