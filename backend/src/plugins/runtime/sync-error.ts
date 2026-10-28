/** Allowlisted diagnostics only: provider errors may contain credentials and payloads. */
export function syncError(error: unknown) {
  const e = (error && typeof error === 'object' ? error : {}) as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    cause?: { name?: unknown; code?: unknown };
    response?: { headers?: Record<string, string> };
  };
  const status = typeof e.status === 'number' ? e.status : undefined;
  const headers = e.response?.headers;
  const limited =
    status === 429 ||
    (status === 403 &&
      (headers?.['x-ratelimit-remaining'] === '0' ||
        Boolean(headers?.['retry-after'])));
  const retry = headers?.['retry-after'];
  const retryAt =
    retry === undefined
      ? 0
      : /^\d+(\.\d+)?$/.test(retry.trim())
        ? Date.now() + Number(retry) * 1000
        : Date.parse(retry);
  const reset = Number(headers?.['x-ratelimit-reset']) * 1000;
  const nextRetryAt = limited
    ? new Date(
        Math.max(
          Date.now() + 60000,
          Number.isFinite(retryAt) ? retryAt : 0,
          Number.isFinite(reset) ? reset : 0,
        ),
      )
    : undefined;
  const code = [e.code, e.cause?.code].find(
    (value) =>
      typeof value === 'string' &&
      /^(P\d{4}|E(?:CONNRESET|CONNREFUSED|TIMEDOUT|NOTFOUND|AI_AGAIN)|UND_ERR_[A-Z_]+)$/.test(
        value,
      ),
  );
  const timeout = [e.name, e.cause?.name].some(
    (name) => name === 'TimeoutError' || name === 'AbortError',
  );
  const category = limited
    ? 'rate_limit'
    : status === 401
      ? 'authentication'
      : status === 403
        ? 'permission'
        : timeout
          ? 'timeout'
          : typeof code === 'string' && /^P\d{4}$/.test(code)
            ? 'database'
            : 'provider_or_sync';
  const message = limited
    ? `Provider rate limited; retry after ${nextRetryAt!.toISOString()}`
    : category === 'authentication'
      ? 'Provider authentication failed'
      : category === 'permission'
        ? 'Provider access denied; check installation permissions'
        : timeout
          ? 'Provider request timed out or was cancelled'
          : category === 'database'
            ? 'Could not persist synchronization data'
            : 'Synchronization failed; check backend sync diagnostics';
  return { category, status, code, message, nextRetryAt };
}
