export type RetryOptions = {
  retries?: number;
  timeoutMs?: number;
  initialDelayMs?: number;
  label?: string;
  retryStatuses?: number[];
  logger?: Pick<Console, "warn">;
};

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_RETRY_STATUSES = [502, 503, 504];

class RetryableHttpStatusError extends Error {
  constructor(readonly status: number, readonly statusText: string) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "RetryableHttpStatusError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorTokens(error: unknown, tokens: string[] = []): string[] {
  if (!error || tokens.length > 20) return tokens;

  if (error instanceof Error) {
    tokens.push(error.name, error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) getErrorTokens(cause, tokens);
  } else if (typeof error === "object") {
    const maybeError = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (maybeError.code) tokens.push(String(maybeError.code));
    if (maybeError.message) tokens.push(String(maybeError.message));
    if (maybeError.cause) getErrorTokens(maybeError.cause, tokens);
  } else {
    tokens.push(String(error));
  }

  return tokens;
}

export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof RetryableHttpStatusError) return true;

  const haystack = getErrorTokens(error).join(" ").toLowerCase();
  return [
    "etimedout",
    "econnreset",
    "terminated",
    "fetch failed",
    "socket hang up",
    "headers timeout",
    "body timeout",
    "timed out",
    "timeout",
    "aborted",
  ].some((token) => haystack.includes(token));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, initialDelayMs: number) {
  return initialDelayMs * 2 ** attempt;
}

function mergeAbortSignals(signals: AbortSignal[]) {
  const controller = new AbortController();
  const listeners: Array<() => void> = [];

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    listeners.push(() => signal.removeEventListener("abort", onAbort));
  }

  return {
    signal: controller.signal,
    cleanup() {
      for (const listener of listeners) listener();
    },
  };
}

export async function withRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const label = options.label ?? "network request";
  const logger = options.logger ?? console;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      const canRetry = attempt < retries && isTransientNetworkError(error);
      if (!canRetry) throw error;

      const delayMs = retryDelay(attempt, initialDelayMs);
      logger.warn(
        `[retry] ${label} failed on attempt ${attempt + 1}/${retries + 1}: ${toErrorMessage(error)}. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${label} failed after ${retries + 1} attempts`);
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RetryOptions = {},
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Response> {
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  return withRetry(
    async (timeoutSignal) => {
      const signals = init.signal ? [timeoutSignal, init.signal] : [timeoutSignal];
      const merged = mergeAbortSignals(signals);

      try {
        const response = await fetchImpl(input, {
          ...init,
          signal: merged.signal,
        });

        if (retryStatuses.includes(response.status)) {
          await response.body?.cancel();
          throw new RetryableHttpStatusError(response.status, response.statusText);
        }

        return response;
      } finally {
        merged.cleanup();
      }
    },
    options,
  );
}

export function installFetchWithRetry(options: RetryOptions = {}) {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithRetry(input, init, options, originalFetch)) as typeof fetch;

  return function restoreFetch() {
    globalThis.fetch = originalFetch as typeof fetch;
  };
}
