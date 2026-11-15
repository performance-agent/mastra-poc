/** Queue HTTP requests only: auth hooks may themselves need to make requests. */
export function createSerializedFetch(): typeof fetch {
  let tail: Promise<unknown> = Promise.resolve();
  let blockedUntil = 0;
  return (input, init) => {
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const pending = tail.then(async () => {
      callerSignal?.throwIfAborted();
      if (Date.now() < blockedUntil) {
        // Return an HTTP response so Octokit preserves status and retry headers.
        return new Response(
          JSON.stringify({ message: "GitHub rate limit cooldown" }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": String(
                Math.ceil((blockedUntil - Date.now()) / 1000),
              ),
            },
          },
        );
      }
      const timeout = AbortSignal.timeout(60000);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, timeout])
        : timeout;
      const response = await globalThis.fetch(input, { ...init, signal });
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      ) {
        const retry = response.headers.get("retry-after");
        const retryAt =
          retry === null
            ? 0
            : /^\d+(\.\d+)?$/.test(retry.trim())
              ? Date.now() + Number(retry) * 1000
              : Date.parse(retry);
        const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
        blockedUntil = Math.max(
          Date.now() + 60000,
          Number.isFinite(retryAt) ? retryAt : 0,
          Number.isFinite(reset) ? reset : 0,
        );
      }
      // Consume the body under the timeout before releasing the next request.
      // Returning the buffered response also prevents Octokit swallowing body read errors.
      const body = await response.arrayBuffer();
      const buffered = new Response(
        [204, 205, 304].includes(response.status) || init?.method === "HEAD"
          ? null
          : body,
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      );
      Object.defineProperty(buffered, "url", { value: response.url });
      return buffered;
    });
    tail = pending.catch(() => undefined);
    return pending;
  };
}
