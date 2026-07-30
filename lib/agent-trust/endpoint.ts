import {
  fetchWithSsrfProtection,
  ResponseSizeLimitExceededError,
  SSRFProtectionError,
} from "../seller/ssrf.ts";
import type { EndpointAvailabilitySnapshot } from "./types.ts";

export type EndpointSnapshotFetcher = typeof fetchWithSsrfProtection;

function statusCategory(status: number) {
  if (status >= 200 && status < 300) return "2xx_success";
  if (status >= 300 && status < 400) return "3xx_redirect";
  if (status >= 400 && status < 500) return "4xx_client_error";
  if (status >= 500) return "5xx_server_error";
  return "unknown";
}
export async function snapshotEndpointAvailability(
  endpoint: string | undefined,
  fetcher: EndpointSnapshotFetcher = fetchWithSsrfProtection,
  now = new Date(),
): Promise<EndpointAvailabilitySnapshot> {
  const checkedAt = now.toISOString();
  if (!endpoint) {
    return {
      status: "not_provided",
      endpoint: null,
      reachable: null,
      httpStatusCategory: null,
      responseTimeMs: null,
      contentType: null,
      checkedAt,
      redirectCount: 0,
      errorCategory: null,
    };
  }
  const startedAt = Date.now();
  try {
    const response = await fetcher(
      endpoint,
      {
        method: "HEAD",
        headers: { Accept: "application/json" },
      },
      {
        allowLocalhostForTesting: false,
        maxTimeoutMs: 8_000,
        maxResponseSizeBytes: 65_536,
        label: "agent trust endpoint availability snapshot",
      },
    );
    return {
      status: "available",
      endpoint,
      reachable: true,
      httpStatusCategory: statusCategory(response.status),
      responseTimeMs: Math.max(0, Date.now() - startedAt),
      contentType:
        response.headers.get("content-type")?.split(";", 1)[0] ?? null,
      checkedAt,
      redirectCount: 0,
      errorCategory: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const errorCategory =
      error instanceof ResponseSizeLimitExceededError
        ? "endpoint_response_too_large"
        : error instanceof SSRFProtectionError
          ? /restricted|internal|forbidden|private|rebind/.test(message)
            ? "endpoint_private_network_blocked"
            : "endpoint_invalid"
          : /timed out|timeout|abort/.test(message)
            ? "endpoint_timeout"
            : "endpoint_unreachable";
    return {
      status:
        errorCategory === "endpoint_private_network_blocked"
          ? "blocked"
          : errorCategory === "endpoint_invalid"
            ? "invalid"
            : "unreachable",
      endpoint,
      reachable: false,
      httpStatusCategory: null,
      responseTimeMs: Math.max(0, Date.now() - startedAt),
      contentType: null,
      checkedAt,
      redirectCount: 0,
      errorCategory,
    };
  }
}
