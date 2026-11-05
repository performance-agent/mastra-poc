import type { RunnableConfig } from '@langchain/core/runnables';
import type { EvaluationFlowState } from './types.js';

export type EvaluationProgressObserver = (
  stage: string,
  state: 'started' | 'completed',
) => Promise<void>;

/** Read the observer from this invocation, never from a shared graph instance. */
export function observeEvaluationNode(
  stage: string,
  run: (
    state: EvaluationFlowState,
  ) => Partial<EvaluationFlowState> | Promise<Partial<EvaluationFlowState>>,
) {
  return async (state: EvaluationFlowState, config: RunnableConfig) => {
    const observer = config.configurable?.onEvaluationProgress as
      EvaluationProgressObserver | undefined;
    await observer?.(stage, 'started');
    const result = await run(state);
    await observer?.(stage, 'completed');
    return result;
  };
}
