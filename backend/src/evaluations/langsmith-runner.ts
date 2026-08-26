const LANGSMITH_RUNNER_ID = 'LANGSMITH_RUNNER_ID';

export function resolveLangSmithRunnerId(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const runnerId = environment[LANGSMITH_RUNNER_ID]?.trim();
  if (!runnerId) throw new Error(`${LANGSMITH_RUNNER_ID} is required`);
  return runnerId;
}

export function langSmithRunnerTag(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return `runner:${resolveLangSmithRunnerId(environment)}`;
}

export function validateLangSmithRunnerConfiguration(): void {
  resolveLangSmithRunnerId();
}
