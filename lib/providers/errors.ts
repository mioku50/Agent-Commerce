export type ProviderErrorCode =
  | "missing_api_key"
  | "unsupported_symbol"
  | "timeout"
  | "rate_limited"
  | "malformed_response"
  | "stale_data"
  | "upstream_error";

const SAFE_MESSAGES: Record<ProviderErrorCode, string> = {
  missing_api_key: "The Pyth provider is not configured.",
  unsupported_symbol: "The requested market symbol is not supported.",
  timeout: "The Pyth provider timed out.",
  rate_limited: "The Pyth provider is temporarily rate limited.",
  malformed_response: "The Pyth provider returned an invalid response.",
  stale_data: "The latest Pyth price is stale.",
  upstream_error: "The Pyth provider is temporarily unavailable.",
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly upstreamStatus: number | null;
  readonly upstreamMessage: string | null;

  constructor(
    code: ProviderErrorCode,
    options: {
      retryable?: boolean;
      httpStatus?: number;
      upstreamStatus?: number | null;
      upstreamMessage?: string | null;
    } = {},
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? 503;
    this.upstreamStatus = options.upstreamStatus ?? null;
    this.upstreamMessage = options.upstreamMessage ?? null;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
