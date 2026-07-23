export type ProviderErrorCode =
  | "missing_api_key"
  | "unsupported_symbol"
  | "timeout"
  | "rate_limited"
  | "malformed_response"
  | "stale_data"
  | "upstream_error"
  | "invalid_github_repository"
  | "github_repository_not_found"
  | "github_repository_inaccessible"
  | "github_rate_limited"
  | "github_provider_timeout"
  | "github_repository_empty";

const SAFE_MESSAGES: Record<ProviderErrorCode, string> = {
  missing_api_key: "The Pyth provider is not configured.",
  unsupported_symbol: "The requested market symbol is not supported.",
  timeout: "The Pyth provider timed out.",
  rate_limited: "The Pyth provider is temporarily rate limited.",
  malformed_response: "The Pyth provider returned an invalid response.",
  stale_data: "The latest Pyth price is stale.",
  upstream_error: "The provider is temporarily unavailable.",
  invalid_github_repository: "Enter a public repository in the format owner/repository.",
  github_repository_not_found: "Check the repository URL or confirm that the repository is public.",
  github_repository_inaccessible: "This report currently supports public GitHub repositories only.",
  github_rate_limited: "The GitHub data limit has been reached. Try again later.",
  github_provider_timeout: "GitHub took too long to respond.",
  github_repository_empty: "The repository exists, but no commits were found on its default branch.",
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
