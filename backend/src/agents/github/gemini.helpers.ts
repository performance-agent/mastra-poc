import { createHash } from 'crypto';
import {
  GeminiAnalysisInput,
  GeminiAnalysisOutput,
  GeminiCall,
} from './github.types';

const GEMINI_INTENTS = new Set([
  'repo_activity',
  'project_docs',
  'tickets_status',
  'ticket_evidence',
  'pull_request_search',
  'developer_activity',
  'unknown',
]);

const GEMINI_METHODS = new Set([
  'resolveGroupToRepos',
  'resolveRepoResourceId',
  'getRepositoryActivity',
  'listCommits',
  'getCommitDetails',
  'listPullRequests',
  'getPullRequestDetails',
  'listPullRequestFiles',
  'listIssues',
  'getRepoContents',
  'searchCode',
]);

const EXECUTABLE_METHODS = new Set([
  'getRepositoryActivity',
  'listCommits',
  'getCommitDetails',
  'listPullRequests',
  'getPullRequestDetails',
  'listPullRequestFiles',
]);

export function validateGeminiOutput(output: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isRecord(output)) {
    return { valid: false, errors: ['Output must be an object.'] };
  }

  if (!GEMINI_INTENTS.has(String(output.intent))) {
    errors.push('Invalid intent.');
  }
  if (!isRecord(output.filters)) {
    errors.push('filters must be an object.');
  }
  if (!Array.isArray(output.calls) || output.calls.length > 20) {
    errors.push('calls must be an array with max 20 items.');
  } else {
    output.calls.forEach((call, index) => {
      if (!isRecord(call)) {
        errors.push(`calls.${index} must be an object.`);
        return;
      }
      if (!GEMINI_METHODS.has(String(call.method))) {
        errors.push(`calls.${index}.method is invalid.`);
      }
      if (!isRecord(call.params)) {
        errors.push(`calls.${index}.params must be an object.`);
      }
      const priority = Number(call.priority);
      if (!Number.isFinite(priority) || priority < 1 || priority > 100) {
        errors.push(`calls.${index}.priority must be between 1 and 100.`);
      }
    });
  }
  if (!Array.isArray(output.ticketKeys)) {
    errors.push('ticketKeys must be an array.');
  }
  const confidence = Number(output.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push('confidence must be between 0 and 1.');
  }
  if (!Array.isArray(output.suggestedQuestions)) {
    errors.push('suggestedQuestions must be an array.');
  }
  if (typeof output.explanation !== 'string') {
    errors.push('explanation must be a string.');
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizeGeminiParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, sanitizeGeminiValue(value)]),
  );
}

export function mapGeminiMethodToGithubService(method: string): string | null {
  return EXECUTABLE_METHODS.has(method) ? method : null;
}

export function estimateCallsSaved(
  planBefore: number,
  planAfter: number,
  confidence: number,
) {
  return Math.max(0, Math.round((planBefore - planAfter) * confidence));
}

export function hashGeminiInput(input: GeminiAnalysisInput) {
  return createHash('sha256')
    .update(input.request)
    .update(JSON.stringify(input.inputContext ?? {}))
    .digest('hex');
}

export function coerceGeminiOutput(output: unknown): GeminiAnalysisOutput {
  const record = output as Record<string, unknown>;
  return {
    intent: String(record.intent),
    filters: isRecord(record.filters) ? record.filters : {},
    calls: Array.isArray(record.calls)
      ? record.calls.map((call) => coerceGeminiCall(call))
      : [],
    ticketKeys: Array.isArray(record.ticketKeys)
      ? record.ticketKeys.map(String)
      : [],
    confidence: Number(record.confidence),
    suggestedQuestions: Array.isArray(record.suggestedQuestions)
      ? record.suggestedQuestions.map(String)
      : [],
    explanation: String(record.explanation ?? ''),
  };
}

function coerceGeminiCall(call: unknown): GeminiCall {
  const record = call as Record<string, unknown>;
  return {
    method: String(record.method) as GeminiCall['method'],
    params: sanitizeGeminiParams(isRecord(record.params) ? record.params : {}),
    priority: Number(record.priority),
    note: record.note ? String(record.note) : undefined,
  };
}

function sanitizeGeminiValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .slice(0, 500)
      .replace(/[^\w\s./:@-]/g, '')
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiValue).slice(0, 100);
  }
  if (isRecord(value)) {
    return sanitizeGeminiParams(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
