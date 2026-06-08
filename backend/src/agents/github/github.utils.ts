export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseJsonResponse(text: string): unknown {
  const cleanedText = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleanedText);
}

export function getMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text);
        }

        return '';
      })
      .join('');
  }

  return String(content ?? '');
}

export function getNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getStringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing string arg: ${key}`);
  }

  return value;
}

export function getNullableStringArg(
  args: Record<string, unknown>,
  key: string,
) {
  return getNullableString(args[key]);
}

export function getNumberArg(args: Record<string, unknown>, key: string) {
  const value = args[key];

  if (typeof value !== 'number') {
    throw new Error(`Missing number arg: ${key}`);
  }

  return value;
}
