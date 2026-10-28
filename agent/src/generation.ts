import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { initChatModel } from 'langchain/chat_models/universal';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
const modelIds = new WeakMap<BaseChatModel, string>();
export const modelIdentifier = (model: BaseChatModel) =>
  modelIds.get(model) ?? 'configured';
function identified<T extends BaseChatModel>(model: T, id: string): T {
  modelIds.set(model, id);
  return model;
}

export function modelBudget(
  model: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const key = model.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const number = (name: string, fallback: number) => {
    const value = Number(
      env[`${key}_${name}`] ?? env[`GENERATION_${name}`] ?? fallback,
    );
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Invalid ${name}`);
    return value;
  };
  return {
    inputBytes: number('INPUT_BYTES', 48000),
    outputTokens: number('OUTPUT_TOKENS', 4096),
    timeoutMs: number('TIMEOUT_MS', 90000),
  };
}

export async function configuredModel(
  id: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<BaseChatModel> {
  const budget = modelBudget(id, env);
  if (/^(groq|openrouter)[:/]/.test(id)) {
    const openRouter = id.startsWith('openrouter');
    const key = openRouter ? 'OPENROUTER_API_KEY' : 'GROQ_API_KEY';
    if (!env[key]) throw new Error(`${key} is required`);
    return identified(
      new ChatOpenAI({
        model: id.replace(/^[^:/]+[:/]/, ''),
        apiKey: env[key],
        configuration: {
          baseURL: openRouter
            ? 'https://openrouter.ai/api/v1'
            : 'https://api.groq.com/openai/v1',
        },
        maxTokens: budget.outputTokens,
        timeout: budget.timeoutMs,
        maxRetries: 0,
      }),
      id,
    );
  }
  if (/^(google|google-genai)[:/]/.test(id)) {
    const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required');
    return identified(
      new ChatGoogleGenerativeAI({
        model: id.replace(/^[^:/]+[:/]/, ''),
        apiKey,
        maxOutputTokens: budget.outputTokens,
        maxRetries: 0,
      }),
      id,
    );
  }
  return identified(
    await initChatModel(id, {
      maxTokens: budget.outputTokens,
      timeout: budget.timeoutMs,
      maxRetries: 0,
    }),
    id,
  );
}

export async function withConfiguredFallback<T>(
  id: string,
  env: Readonly<Record<string, string | undefined>>,
  run: (model: BaseChatModel) => Promise<T>,
): Promise<T> {
  const fallbacks = (env.FREE_TIER_FALLBACK_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fallbacks.some((s) => !/^(groq|google|google-genai)[:/]/.test(s)))
    throw new Error(
      'Fallbacks must explicitly name configured Gemini or Groq free-tier models',
    );
  const models = [id, ...fallbacks.filter((s) => s !== id)];
  let failure: unknown;
  for (const candidate of models) {
    try {
      return await run(await configuredModel(candidate, env));
    } catch (error) {
      failure = error;
      if (generationError(error) === 'authentication') throw error;
    }
  }
  throw failure;
}

type ErrorRecord = Record<string, unknown>;
const record = (value: unknown): ErrorRecord =>
  value && typeof value === 'object' ? (value as ErrorRecord) : {};

function errorChain(error: unknown): ErrorRecord[] {
  const chain: ErrorRecord[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const item = record(value);
    if (chain.includes(item) || chain.length >= 12) return;
    chain.push(item);
    visit(item.cause);
    visit(item.error);
    visit(item.response);
  };
  visit(error);
  return chain;
}

function headerValue(headers: unknown, name: string): string | undefined {
  const h = record(headers);
  if (typeof h.get === 'function') {
    const value: unknown = h.get.call(headers, name);
    return value == null ? undefined : String(value);
  }
  const key = Object.keys(h).find((key) => key.toLowerCase() === name);
  return key && h[key] != null ? String(h[key]) : undefined;
}

/** Metadata is safe to log; message and cause can contain provider request data. */
export function generationErrorDetails(error: unknown) {
  const chain = errorChain(error);
  const statusValue = chain
    .flatMap((e) => [e.status, e.statusCode, e.code])
    .find(
      (v) =>
        Number.isInteger(Number(v)) && Number(v) >= 400 && Number(v) <= 599,
    );
  const status = statusValue == null ? undefined : Number(statusValue);
  const providerCode = chain
    .map((e) => e.providerCode ?? e.code)
    .find((v) => typeof v === 'string' || typeof v === 'number');
  const message = chain
    .map((e) => String(e.message ?? ''))
    .join(' ')
    .toLowerCase();
  const header = chain
    .map((e) => headerValue(e.headers, 'retry-after'))
    .find((v) => v !== undefined);
  let retryAfterMs =
    header === undefined
      ? NaN
      : Number.isFinite(Number(header))
        ? Number(header) * 1000
        : Date.parse(header) - Date.now();
  if (!Number.isFinite(retryAfterMs)) {
    const explicit = chain
      .map((e) => e.retryAfterMs)
      .find((v) => typeof v === 'number' && Number.isFinite(v));
    const details = chain.flatMap((e) =>
      Array.isArray(e.errorDetails) ? e.errorDetails : [],
    );
    const delay = details
      .map((d: unknown) => record(d).retryDelay)
      .find((v) => typeof v === 'string');
    const match = message.match(
      /(?:retry|try again)\s+(?:after|in)\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?)\b/,
    );
    retryAfterMs =
      typeof explicit === 'number'
        ? explicit
        : typeof delay === 'string'
          ? Number.parseFloat(delay) * 1000
          : match
            ? Number(match[1]) *
              (/^m(?!s|illi)/.test(match[2] ?? '')
                ? 60000
                : /^s/.test(match[2] ?? '')
                  ? 1000
                  : 1)
            : NaN;
  }
  const limits = Object.fromEntries(
    [
      'x-ratelimit-limit-requests',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-limit-tokens',
      'x-ratelimit-remaining-tokens',
    ].flatMap((name) => {
      const value = chain
        .map((e) => headerValue(e.headers, name))
        .find((v) => v !== undefined);
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return {
    status,
    providerCode,
    retryAfterMs: Number.isFinite(retryAfterMs)
      ? Math.max(0, retryAfterMs)
      : undefined,
    limits,
    message,
  };
}

export function generationError(error: unknown) {
  const { status, providerCode, message } = generationErrorDetails(error);
  if (status === 413) return 'context_overflow';
  if (status === 401 || status === 403) return 'authentication';
  if (
    /insufficient_quota|quota[_ ]exhausted|quota.*(?:exhausted|depleted)|insufficient (?:credits|balance)/.test(
      `${providerCode ?? ''} ${message}`,
    )
  )
    return 'quota_exhausted';
  if (status === 429) return 'rate_limited';
  if (/api.?key|unauth/.test(message)) return 'authentication';
  for (const code of [
    'authentication',
    'quota_exhausted',
    'context_overflow',
    'invalid_structured_output',
    'rate_limited',
    'timeout',
    'transient',
  ])
    if (message.startsWith(code)) return code;
  if (/context|too many tokens|token limit|payload/.test(message))
    return 'context_overflow';
  if (/schema|parse|structured|json/.test(message))
    return 'invalid_structured_output';
  if (/resource_exhausted|rate.limit/.test(message)) return 'rate_limited';
  if (
    errorChain(error).some((e) => e.name === 'TimeoutError') ||
    /timeout|timed out|abort/.test(message)
  )
    return 'timeout';
  if (status && status >= 500) return 'transient';
  return 'generation_failed';
}

class GenerationFailure extends Error {
  readonly status: number | undefined;
  readonly providerCode?: unknown;
  readonly retryAfterMs: number | undefined;
  constructor(error: unknown) {
    super(generationError(error), { cause: error });
    const details = generationErrorDetails(error);
    this.status = details.status;
    this.providerCode = details.providerCode;
    this.retryAfterMs = details.retryAfterMs;
  }
}

let tail: Promise<unknown> = Promise.resolve();
export function modelRequest<T>(
  model: string,
  stage: string,
  payload: unknown,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const task = tail.then(async () => {
    const budget = modelBudget(model);
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    if (bytes > budget.inputBytes) {
      console.warn(
        JSON.stringify({
          model,
          stage,
          bytes,
          durationMs: 0,
          code: 'context_overflow',
        }),
      );
      throw new Error(
        'context_overflow: input payload exceeds configured budget',
      );
    }
    for (let attempt = 0; ; attempt++) {
      const start = Date.now();
      try {
        const result = await run(AbortSignal.timeout(budget.timeoutMs));
        console.info(
          JSON.stringify({
            model,
            stage,
            bytes,
            durationMs: Date.now() - start,
            attempt,
            status: 'succeeded',
            budget,
            usage:
              record(result).usage_metadata ??
              record(record(result).raw).usage_metadata,
          }),
        );
        return result;
      } catch (error) {
        const code = generationError(error);
        const { message: _message, ...details } = generationErrorDetails(error);
        const delay = details.retryAfterMs ?? 1000 * 2 ** attempt;
        const retry =
          attempt < 2 &&
          ['rate_limited', 'timeout', 'transient'].includes(code) &&
          delay <= 60000;
        console.warn(
          JSON.stringify({
            model,
            stage,
            bytes,
            durationMs: Date.now() - start,
            attempt,
            code,
            budget,
            ...details,
            waitMs: retry ? delay : undefined,
            retry,
          }),
        );
        if (!retry) throw new GenerationFailure(error);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
      }
    }
  });
  tail = task.catch(() => undefined);
  return task;
}

/** Projection keeps source identity, text, metrics and nested evidence, with explicit omissions. */
export function projectEvidence(value: unknown, sample = 12): unknown {
  if (Array.isArray(value))
    return {
      total: value.length,
      omitted: Math.max(0, value.length - sample),
      sample: value.slice(0, sample).map((v) => projectEvidence(v, sample)),
    };
  if (!value || typeof value !== 'object')
    return typeof value === 'string' && value.length > 1200
      ? `${value.slice(0, 1200)} [text omitted]`
      : value;
  const excluded = new Set([
    'patch',
    'avatar_url',
    'avatarUrl',
    'node_id',
    'configuration',
  ]);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record))
    if (!excluded.has(key)) result[key] = projectEvidence(item, sample);
  if (Array.isArray(record.records)) {
    const actors: Record<string, number> = {};
    for (const item of record.records as Array<Record<string, unknown>>) {
      for (const key of ['author', 'assignee', 'reporter'])
        if (typeof item[key] === 'string') {
          const actor = `${key}:${item[key]}`;
          actors[actor] = (actors[actor] ?? 0) + 1;
        }
    }
    const entries = Object.entries(actors).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    result.actorRecordCounts = Object.fromEntries(
      entries.slice(0, Math.max(12, sample * 4)),
    );
    result.omittedActorCounts = Math.max(
      0,
      entries.length - Math.max(12, sample * 4),
    );
  }
  return result;
}
