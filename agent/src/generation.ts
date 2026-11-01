import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { initChatModel } from 'langchain/chat_models/universal';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { RunnableLambda } from '@langchain/core/runnables';

/** Runnable context propagates callbacks to nested graphs and model calls. */
export function generationStage<T>(
  name: string,
  input: unknown,
  run: () => Promise<T>,
  metadata: Record<string, unknown> = {},
): Promise<T> {
  return RunnableLambda.from<unknown, T>(run).invoke(input, {
    runName: name,
    metadata,
  });
}

export type ModelRequestOptions = {
  maxRetries?: number;
  /** When set, this request may exceed the model default. The caller already bounded the payload to this size. */
  inputBytes?: number;
  /** When set, this request may wait longer than the model default. */
  timeoutMs?: number;
  beforeAttempt?: () => void;
  metadata?: () => Record<string, unknown>;
};
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
  const models = [...new Set([id, ...fallbacks])];
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

function allowedInputBytes(fallback: number, override?: number) {
  if (
    override === undefined ||
    !Number.isSafeInteger(override) ||
    override <= 0
  )
    return fallback;
  return override;
}

let tail: Promise<unknown> = Promise.resolve();
export function modelRequest<T>(
  model: string,
  stage: string,
  payload: unknown,
  run: (signal: AbortSignal) => Promise<T>,
  options: ModelRequestOptions = {},
): Promise<T> {
  const task = tail.then(async () => {
    const budget = modelBudget(model);
    const inputBytes = allowedInputBytes(budget.inputBytes, options.inputBytes);
    const timeoutMs = allowedInputBytes(budget.timeoutMs, options.timeoutMs);
    const enforced = { ...budget, inputBytes, timeoutMs };
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    if (bytes > enforced.inputBytes) {
      console.warn(
        JSON.stringify({
          ...options.metadata?.(),
          model,
          stage,
          bytes,
          durationMs: 0,
          code: 'context_overflow',
          budget: enforced,
        }),
      );
      throw new Error(
        'context_overflow: input payload exceeds configured budget',
      );
    }
    for (let attempt = 0; ; attempt++) {
      // Local size checks do not spend an invocation; every provider attempt does.
      options.beforeAttempt?.();
      const metadata = {
        ...options.metadata?.(),
        ...(attempt ? { reason: 'transient_retry' } : {}),
      };
      const start = Date.now();
      try {
        const result = await generationStage(
          stage,
          payload,
          () => run(AbortSignal.timeout(enforced.timeoutMs)),
          { ...metadata, model, stage, bytes, attempt },
        );
        console.info(
          JSON.stringify({
            model,
            ...metadata,
            stage,
            bytes,
            durationMs: Date.now() - start,
            attempt,
            status: 'succeeded',
            budget: enforced,
            effectiveModel: record(result).response_metadata
              ? (record(record(result).response_metadata).model_name ??
                record(record(result).response_metadata).model ??
                model)
              : (record(record(record(result).raw).response_metadata)
                  .model_name ?? model),
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
          attempt < (options.maxRetries ?? 2) &&
          ['rate_limited', 'timeout', 'transient'].includes(code) &&
          delay <= 60000;
        console.warn(
          JSON.stringify({
            model,
            ...metadata,
            stage,
            bytes,
            durationMs: Date.now() - start,
            attempt,
            code,
            budget: enforced,
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

const NESTED_SAMPLE_CAP = 8;
const DEFAULT_TEXT_CAP = 1200;
const AGGREGATE_PEOPLE_CAP = 24;
const OPEN_PARENT_CAP = 12;
const TEXT_FIELDS = new Set(['body', 'description', 'message']);
const COMMENT_LISTS = new Set([
  'issueComments',
  'reviewCommentsData',
  'comments',
]);
const REVIEW_LISTS = new Set(['reviews']);
const FILE_LISTS = new Set(['files']);
const NAMED_LISTS = new Set([
  ...COMMENT_LISTS,
  ...REVIEW_LISTS,
  ...FILE_LISTS,
]);
const TIME_KEYS = [
  'createdAt',
  'authoredAt',
  'committedAt',
  'submittedAt',
  'updatedAt',
] as const;

type ProjectCaps = {
  sample: number;
  textCap: number;
  listCap: number;
};

/** Projection keeps source identity, text, metrics and nested evidence, with explicit omissions. */
export function projectEvidence(value: unknown, sample = 12): unknown {
  return projectNode(value, defaultCaps(sample), true);
}

function defaultCaps(sample: number): ProjectCaps {
  return {
    sample,
    textCap: DEFAULT_TEXT_CAP,
    listCap: Math.min(Math.max(sample, 1), NESTED_SAMPLE_CAP),
  };
}

function projectNode(
  value: unknown,
  caps: ProjectCaps,
  wide: boolean,
  key?: string,
): unknown {
  if (Array.isArray(value)) {
    const named = !wide && key !== undefined && NAMED_LISTS.has(key);
    const take = wide
      ? caps.sample
      : named
        ? caps.listCap
        : Math.min(caps.sample, NESTED_SAMPLE_CAP);
    const picked = spreadAcross(orderByTime(value), take);
    return {
      total: value.length,
      omitted: Math.max(0, value.length - picked.length),
      sample: picked.map((item) => projectNode(item, caps, wide)),
    };
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    const cap =
      key !== undefined && TEXT_FIELDS.has(key) ? caps.textCap : DEFAULT_TEXT_CAP;
    return value.length > cap ? `${value.slice(0, cap)} [text omitted]` : value;
  }
  const excluded = new Set([
    'patch',
    'avatar_url',
    'avatarUrl',
    'node_id',
    'configuration',
  ]);
  const record = value as Record<string, unknown>;
  const nextWide = wide && !isEvidenceRecord(record);
  const result: Record<string, unknown> = {};
  for (const [childKey, item] of Object.entries(record))
    if (!excluded.has(childKey))
      result[childKey] = projectNode(item, caps, nextWide, childKey);
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
      entries.slice(0, Math.max(12, caps.sample * 4)),
    );
    result.omittedActorCounts = Math.max(
      0,
      entries.length - Math.max(12, caps.sample * 4),
    );
    const aggregates = summarizeStoredRecords(record.records);
    if (aggregates) result.aggregates = aggregates;
  }
  return result;
}

export type EvidenceTrimAction = 'shorten_text' | 'reduce_list' | 'drop_records';

export type EvidenceReceipt = {
  budgetBytes: number;
  bytes: number;
  counts: Array<{
    type: string;
    stored: number;
    initial: number;
    final: number;
  }>;
  includedIds: Array<{ type: string; ids: string[] }>;
  nested: {
    comments: { kept: number; omitted: number };
    reviews: { kept: number; omitted: number };
    files: { kept: number; omitted: number };
  };
  operations: Array<{ action: EvidenceTrimAction; reason: string }>;
  tokens: { input: number | null; output: number | null } | null;
};

export function packEvidence(
  value: unknown,
  sample: number,
  options: {
    budgetBytes: number;
    prefix: string;
    /** Starting cap for body, description and message. The trim ladder still shortens these if the package exceeds the budget. */
    textCap?: number;
    /** Starting cap for comments, reviews and files. Defaults to the nested sample cap. */
    listCap?: number;
  },
): { evidence: unknown; receipt: EvidenceReceipt } {
  const linkById = linkIndex(value);
  const stored = longestRecords(value);
  let take = Math.max(1, Math.min(Math.max(sample, 1), stored || sample));
  let textCap = options.textCap ?? DEFAULT_TEXT_CAP;
  let listCap =
    options.listCap ?? Math.min(Math.max(sample, 1), NESTED_SAMPLE_CAP);
  const operations: EvidenceReceipt['operations'] = [];
  let evidence = projectPacked(value, take, textCap, listCap, linkById);
  const initial = datasetSnapshot(evidence);
  const textLadder = [1200, 400, 160].filter((cap) => cap < textCap);
  const listLadder = [8, 4, 2, 1].filter((cap) => cap < listCap);
  let textStep = 0;
  let listStep = 0;
  let dropFrom: number | null = null;

  while (packageBytes(options.prefix, evidence) > options.budgetBytes) {
    if (textStep < textLadder.length) {
      const next = textLadder[textStep] ?? textCap;
      textStep += 1;
      const before = packageBytes(options.prefix, evidence);
      textCap = next;
      evidence = projectPacked(value, take, textCap, listCap, linkById);
      if (packageBytes(options.prefix, evidence) < before) {
        operations.push({
          action: 'shorten_text',
          reason: `Shortened body, description and message fields to ${next} characters so other records can stay.`,
        });
      }
      continue;
    }
    if (listStep < listLadder.length) {
      const next = listLadder[listStep] ?? listCap;
      listStep += 1;
      const before = packageBytes(options.prefix, evidence);
      listCap = next;
      evidence = projectPacked(value, take, textCap, listCap, linkById);
      if (packageBytes(options.prefix, evidence) < before) {
        operations.push({
          action: 'reduce_list',
          reason: `Reduced comments, reviews and files to ${next} item${next === 1 ? '' : 's'}, keeping at least one while the record stays.`,
        });
      }
      continue;
    }
    if (take > 1) {
      if (dropFrom === null) dropFrom = take;
      take -= 1;
      evidence = projectPacked(value, take, textCap, listCap, linkById);
      continue;
    }
    break;
  }
  if (dropFrom !== null) {
    operations.push({
      action: 'drop_records',
      reason: `Removed records from ${dropFrom} to ${take} after shortening text and nested lists. The remaining records stay spread across the period.`,
    });
  }

  const final = datasetSnapshot(evidence);
  const types = [...new Set([...initial.keys(), ...final.keys()])].sort();
  return {
    evidence,
    receipt: {
      budgetBytes: options.budgetBytes,
      bytes: packageBytes(options.prefix, evidence),
      counts: types.map((type) => ({
        type,
        stored: initial.get(type)?.stored ?? final.get(type)?.stored ?? 0,
        initial: initial.get(type)?.selected ?? 0,
        final: final.get(type)?.selected ?? 0,
      })),
      includedIds: types.map((type) => ({
        type,
        ids: final.get(type)?.ids ?? [],
      })),
      nested: tallyNested(evidence),
      operations,
      tokens: null,
    },
  };
}

function projectPacked(
  value: unknown,
  sample: number,
  textCap: number,
  listCap: number,
  linkById: Map<string, string[]>,
) {
  const projected = projectNode(
    value,
    { sample, textCap, listCap: Math.max(1, listCap) },
    true,
  );
  annotateLinks(projected, linkById);
  return projected;
}

function packageBytes(prefix: string, evidence: unknown) {
  return Buffer.byteLength(JSON.stringify(prefix + JSON.stringify(evidence)));
}

function longestRecords(value: unknown): number {
  let longest = 0;
  const visit = (node: unknown, key?: string) => {
    if (Array.isArray(node)) {
      if (key === 'records') longest = Math.max(longest, node.length);
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
  };
  visit(value);
  return longest;
}

type DatasetSnap = { stored: number; selected: number; ids: string[] };

function datasetSnapshot(value: unknown) {
  const counts = new Map<string, DatasetSnap>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const records = record.records;
    if (
      records &&
      typeof records === 'object' &&
      !Array.isArray(records) &&
      Array.isArray((records as { sample?: unknown }).sample) &&
      typeof (records as { total?: unknown }).total === 'number'
    ) {
      const wrapped = records as { total: number; sample: unknown[] };
      const type =
        typeof record.dataType === 'string' ? record.dataType : 'records';
      const current = counts.get(type) ?? { stored: 0, selected: 0, ids: [] };
      current.stored += wrapped.total;
      current.selected += wrapped.sample.length;
      for (const item of wrapped.sample) {
        const id = recordId(item);
        if (id) current.ids.push(id);
      }
      counts.set(type, current);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return counts;
}

function recordId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.key === 'string') return record.key;
  if (typeof record.sha === 'string') return record.sha;
  if (typeof record.number === 'number') return String(record.number);
  if (typeof record.id === 'string') return record.id;
  return null;
}

function tallyNested(value: unknown) {
  const nested = {
    comments: { kept: 0, omitted: 0 },
    reviews: { kept: 0, omitted: 0 },
    files: { kept: 0, omitted: 0 },
  };
  const visit = (node: unknown, key?: string) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (
      key &&
      typeof record.total === 'number' &&
      Array.isArray(record.sample)
    ) {
      const bucket = COMMENT_LISTS.has(key)
        ? nested.comments
        : REVIEW_LISTS.has(key)
          ? nested.reviews
          : FILE_LISTS.has(key)
            ? nested.files
            : null;
      if (bucket) {
        bucket.kept += record.sample.length;
        bucket.omitted += Math.max(0, record.total - record.sample.length);
      }
    }
    for (const [childKey, child] of Object.entries(record))
      visit(child, childKey);
  };
  visit(value);
  return nested;
}

function linkIndex(value: unknown) {
  const ticketKeys = new Set<string>();
  const records: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (isTicket(record) && typeof record.key === 'string')
      ticketKeys.add(record.key);
    if (isPullRequest(record) || isCommit(record) || isTicket(record))
      records.push(record);
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  const index = new Map<string, string[]>();
  for (const record of records) {
    const id = recordIdentity(record);
    if (!id) continue;
    index.set(id, linksFor(record, ticketKeys));
  }
  return index;
}

function linksFor(record: Record<string, unknown>, ticketKeys: Set<string>) {
  const links: string[] = [];
  if (typeof record.parentKey === 'string' && record.parentKey.length > 0)
    links.push(`parent:${record.parentKey}`);
  const seen = new Set<string>();
  for (const blob of textBlobs(record)) {
    for (const match of blob.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []) {
      if (!ticketKeys.has(match) || match === record.key || seen.has(match))
        continue;
      seen.add(match);
      links.push(`ticket:${match}`);
    }
  }
  return links;
}

function textBlobs(record: Record<string, unknown>) {
  const blobs: string[] = [];
  for (const key of ['title', 'summary', 'message', 'body', 'description'])
    if (typeof record[key] === 'string') blobs.push(record[key]);
  for (const key of ['issueComments', 'reviewCommentsData', 'reviews', 'comments']) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const body = (item as Record<string, unknown>).body;
      if (typeof body === 'string') blobs.push(body);
    }
  }
  return blobs;
}

function recordIdentity(record: Record<string, unknown>): string | null {
  if (isTicket(record) && typeof record.key === 'string')
    return `ticket:${record.key}`;
  if (isCommit(record) && typeof record.sha === 'string')
    return `commit:${record.sha}`;
  if (isPullRequest(record) && typeof record.number === 'number') {
    const repository =
      typeof record.repository === 'string' ? record.repository : '';
    return `pr:${repository}:${record.number}`;
  }
  return null;
}

function annotateLinks(value: unknown, linkById: Map<string, string[]>) {
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const id = recordIdentity(record);
    if (id && linkById.has(id)) {
      const links = linkById.get(id) ?? [];
      record.links =
        links.length > 0 ? links : ['sin vínculo identificado'];
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
}

function orderByTime(items: unknown[]): unknown[] {
  const times = items.map(timeOf);
  const dated = times.filter((time) => time !== null).length;
  if (dated === 0 || dated * 2 < items.length) return items;
  return items
    .map((item, index) => ({
      item,
      index,
      time: times[index] ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map((entry) => entry.item);
}

function spreadAcross(items: unknown[], take: number): unknown[] {
  if (take <= 0 || items.length === 0) return [];
  if (items.length <= take) return items;
  if (take === 1) return [items[Math.floor((items.length - 1) / 2)]];
  const picked: unknown[] = [];
  const seen = new Set<number>();
  for (let slot = 0; slot < take; slot += 1) {
    const index = Math.round((slot * (items.length - 1)) / (take - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    picked.push(items[index]);
  }
  return picked;
}

function timeOf(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of TIME_KEYS) {
    if (typeof record[key] !== 'string') continue;
    const time = Date.parse(record[key]);
    if (!Number.isNaN(time)) return time;
  }
  return null;
}

function isEvidenceRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.sha === 'string' ||
    typeof record.number === 'number' ||
    typeof record.issueType === 'string' ||
    typeof record.filename === 'string' ||
    typeof record.parentKey === 'string' ||
    typeof record.additions === 'number'
  );
}

function summarizeStoredRecords(
  records: unknown[],
): Record<string, unknown> | undefined {
  const objects = records.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  );
  const pullRequests = objects.filter(isPullRequest);
  const commits = objects.filter(isCommit);
  const tickets = objects.filter(isTicket);
  const summary: Record<string, unknown> = {};
  if (pullRequests.length > 0)
    summary.pullRequests = summarizePullRequests(pullRequests);
  if (commits.length > 0) summary.commits = summarizeCommits(commits);
  if (tickets.length > 0) summary.tickets = summarizeTickets(tickets);
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function isPullRequest(record: Record<string, unknown>): boolean {
  return (
    typeof record.number === 'number' &&
    ('mergedAt' in record ||
      'reviews' in record ||
      'additions' in record ||
      'changedFiles' in record ||
      'baseBranch' in record)
  );
}

function isCommit(record: Record<string, unknown>): boolean {
  return typeof record.sha === 'string' && typeof record.message === 'string';
}

function isTicket(record: Record<string, unknown>): boolean {
  return typeof record.key === 'string' && typeof record.status === 'string';
}

function summarizePullRequests(pullRequests: Record<string, unknown>[]) {
  let merged = 0;
  let closedUnmerged = 0;
  let open = 0;
  let mergedWithApproval = 0;
  const byAuthor: Record<string, number> = {};
  const reviewsByAuthor: Record<string, number> = {};
  for (const pullRequest of pullRequests) {
    const mergedAt =
      typeof pullRequest.mergedAt === 'string' ? pullRequest.mergedAt : null;
    const state =
      typeof pullRequest.state === 'string' ? pullRequest.state : '';
    const didMerge = state === 'merged' || Boolean(mergedAt);
    if (didMerge) merged += 1;
    else if (state === 'closed') closedUnmerged += 1;
    else open += 1;
    if (didMerge && approvedBeforeMerge(pullRequest, mergedAt))
      mergedWithApproval += 1;
    addCount(byAuthor, pullRequest.author);
    if (!Array.isArray(pullRequest.reviews)) continue;
    for (const review of pullRequest.reviews) {
      if (!review || typeof review !== 'object' || Array.isArray(review))
        continue;
      addCount(reviewsByAuthor, (review as Record<string, unknown>).author);
    }
  }
  return {
    total: pullRequests.length,
    merged,
    closedUnmerged,
    open,
    mergedWithApprovalBeforeMerge: mergedWithApproval,
    mergedWithoutApproval: merged - mergedWithApproval,
    byAuthor: topCounts(byAuthor),
    reviewsByAuthor: topCounts(reviewsByAuthor),
  };
}

function approvedBeforeMerge(
  pullRequest: Record<string, unknown>,
  mergedAt: string | null,
): boolean {
  if (!Array.isArray(pullRequest.reviews)) return false;
  const mergedTime = mergedAt ? Date.parse(mergedAt) : Number.NaN;
  return pullRequest.reviews.some((review) => {
    if (!review || typeof review !== 'object' || Array.isArray(review))
      return false;
    const state = (review as Record<string, unknown>).state;
    if (typeof state !== 'string' || state.toUpperCase() !== 'APPROVED')
      return false;
    const submittedAt = (review as Record<string, unknown>).submittedAt;
    if (typeof submittedAt !== 'string' || Number.isNaN(mergedTime))
      return true;
    const submittedTime = Date.parse(submittedAt);
    return Number.isNaN(submittedTime) || submittedTime <= mergedTime;
  });
}

function summarizeCommits(commits: Record<string, unknown>[]) {
  const byAuthor: Record<string, number> = {};
  for (const commit of commits) addCount(byAuthor, commit.author);
  return { total: commits.length, byAuthor: topCounts(byAuthor) };
}

function summarizeTickets(tickets: Record<string, unknown>[]) {
  const byKey = new Map<string, Record<string, unknown>>();
  const children = new Map<string, Record<string, unknown>[]>();
  let done = 0;
  for (const ticket of tickets) {
    if (isDoneTicket(ticket)) done += 1;
    if (typeof ticket.key === 'string') byKey.set(ticket.key, ticket);
    if (typeof ticket.parentKey !== 'string') continue;
    const group = children.get(ticket.parentKey) ?? [];
    group.push(ticket);
    children.set(ticket.parentKey, group);
  }
  const parentsOpenWithDoneChildren = [...children.entries()]
    .map(([parentKey, kids]) => {
      const parent = byKey.get(parentKey);
      const doneChildren = kids.filter(isDoneTicket).length;
      if (!parent || isDoneTicket(parent) || doneChildren === 0) return null;
      return {
        parent: parentKey,
        parentStatus: typeof parent.status === 'string' ? parent.status : '',
        doneChildren,
        childCount: kids.length,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        b.doneChildren - a.doneChildren || a.parent.localeCompare(b.parent),
    )
    .slice(0, OPEN_PARENT_CAP);
  return {
    total: tickets.length,
    done,
    notDone: tickets.length - done,
    parentsOpenWithDoneChildren,
  };
}

function isDoneTicket(ticket: Record<string, unknown>): boolean {
  if (typeof ticket.resolvedAt === 'string' && ticket.resolvedAt.length > 0)
    return true;
  const label = `${ticket.statusCategory ?? ''} ${ticket.status ?? ''}`;
  return /done|listo|hecho|closed|resolved|complete|finaliz/i.test(label);
}

function addCount(counts: Record<string, number>, name: unknown) {
  if (typeof name !== 'string' || name.length === 0) return;
  counts[name] = (counts[name] ?? 0) + 1;
}

function topCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, AGGREGATE_PEOPLE_CAP),
  );
}
