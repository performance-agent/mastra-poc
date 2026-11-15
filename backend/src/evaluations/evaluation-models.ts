import { BadRequestException } from '@nestjs/common';

const definitions = [
  {
    key: 'economical',
    label: 'Gemini 3.1 Flash-Lite',
    variable: 'EVALUATION_MODEL_ECONOMICAL',
    model: 'google-genai:gemini-3.1-flash-lite',
    recommended: false,
  },
  {
    key: 'balanced',
    label: 'Gemini 3.5 Flash-Lite',
    variable: 'EVALUATION_MODEL_BALANCED',
    model: 'google-genai:gemini-3.5-flash-lite',
    recommended: true,
  },
  {
    key: 'advanced',
    label: 'Gemini 3.8 Flash',
    variable: 'EVALUATION_MODEL_ADVANCED',
    model: 'google-genai:gemini-3.8-flash',
    recommended: false,
  },
] as const;

export function evaluationModels() {
  return definitions.map(({ variable, model, ...definition }) => ({
    ...definition,
    model: process.env[variable]?.trim() || model,
  }));
}

export function resolveEvaluationModel(key = 'balanced') {
  const model = evaluationModels().find((option) => option.key === key);
  if (!model) throw new BadRequestException('Unknown evaluation model');
  return model;
}
