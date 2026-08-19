import type { MastraModelConfig } from '@mastra/core/llm';

export const MODEL_ENVIRONMENT_VARIABLES = [
  'GROUP_REPORT_MODEL',
  'WEATHER_AGENT_MODEL',
] as const;

export type ModelEnvironmentVariable =
  (typeof MODEL_ENVIRONMENT_VARIABLES)[number];

const PROVIDER_CREDENTIALS: Readonly<Record<string, string>> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[^\s/]+(?:\/[^\s/]+)*$/;

export function modelFromEnvironment(
  variable: ModelEnvironmentVariable,
): () => MastraModelConfig {
  return () => resolveModelFromEnvironment(variable);
}

export function resolveModelFromEnvironment(
  variable: ModelEnvironmentVariable,
): MastraModelConfig {
  const model = requiredEnvironmentValue(variable);
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new Error(`${variable} must use the provider/model format`);
  }

  const provider = model.slice(0, model.indexOf('/'));
  const credentialVariable = PROVIDER_CREDENTIALS[provider];
  if (credentialVariable) requiredEnvironmentValue(credentialVariable);

  return model;
}

export function validateModelConfiguration(): void {
  for (const variable of MODEL_ENVIRONMENT_VARIABLES) {
    resolveModelFromEnvironment(variable);
  }
}

function requiredEnvironmentValue(variable: string): string {
  const value = process.env[variable]?.trim();
  if (!value) throw new Error(`${variable} is required`);
  return value;
}
