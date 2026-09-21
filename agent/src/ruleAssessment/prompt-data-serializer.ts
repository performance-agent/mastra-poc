import { encode } from '@toon-format/toon';

export type PromptDataFormat = 'json' | 'toon' | 'auto';

export type SerializedPromptData = {
  format: 'json' | 'toon';
  content: string;
};

export function parsePromptDataFormat(
  value: string | undefined,
): PromptDataFormat {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'auto';
  if (normalized === 'json' || normalized === 'toon' || normalized === 'auto')
    return normalized;
  throw new Error('PROMPT_DATA_FORMAT must be json, toon, or auto.');
}

export function serializePromptData(
  value: unknown,
  mode: PromptDataFormat,
): SerializedPromptData {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError('Prompt data must be JSON-serializable.');
  }
  if (mode === 'json') return { format: 'json', content: json };

  try {
    const toon = encode(value, { indentSize: 2, delimiter: '\t' });
    if (mode === 'toon' || toon.length < json.length) {
      return { format: 'toon', content: toon };
    }
  } catch {
    // Prompt optimization must never prevent an assessment.
  }

  return { format: 'json', content: json };
}
