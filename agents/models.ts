export type GeminiModelConfig = {
  provider: 'gemini';
  modelName: string;
};

function env(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export const geminiFastModel: GeminiModelConfig = {
  provider: 'gemini',
  modelName: env('GEMINI_FAST_MODEL', 'gemini-1.5-flash'),
};

export const models = {
  githubPreprocessor: geminiFastModel,
} as const;
