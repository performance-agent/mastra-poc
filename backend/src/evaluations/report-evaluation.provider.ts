import type {
  BatchLimits,
  ConfiguredEvaluationOptions,
  ReportBatchModel,
} from '@pa/agent';
export const REPORT_BATCH_FACTORY = Symbol('REPORT_BATCH_FACTORY');
export const REPORT_ANALYSIS_ENGINE = Symbol('REPORT_ANALYSIS_ENGINE');
export type ReportAnalysisEngine = Pick<
  typeof import('@pa/agent'),
  | 'DEFAULT_REPORT_BATCH_LIMITS'
  | 'createBackendResourceCatalogAdapter'
  | 'planReportBatches'
  | 'analyzeReportBatches'
  | 'isQuotaError'
  | 'QUOTA_MESSAGE'
>;
export type ReportBatchFactory = (
  model: string,
  options: ConfiguredEvaluationOptions,
  limits: BatchLimits,
) => Promise<ReportBatchModel>;
export const createReportBatchFactory: ReportBatchFactory = async (
  model,
  options,
  limits,
) => {
  const agent = await import('@pa/agent');
  return agent.createReportBatchModelFromEnv(model, options, limits);
};
