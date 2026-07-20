/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as dns } from "node:dns";
import { isTransientNetworkError, toErrorMessage } from "../agent/fetch-with-retry.ts";

export class SSRFProtectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFProtectionError";
  }
}

export class ResponseSizeLimitExceededError extends Error {
  constructor(readonly maxBytes: number) {
    super(`SSRF protection: response size exceeded the limit of ${maxBytes} bytes`);
    this.name = "ResponseSizeLimitExceededError";
  }
}

export type SsrfFetchOptions = {
  maxTimeoutMs?: number;
  maxResponseSizeBytes?: number;
  allowLocalhostForTesting?: boolean;
  allowedHeaders?: string[];
  label?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SIZE_BYTES = 1_048_576; // 1 MB
const ALLOWED_OUTGOING_HEADERS = new Set([
  "content-type",
  "accept",
  "user-agent",
  "payment-signature",
  "x-agent-commerce-request-id",
  "x-agent-commerce-verify-nonce",
]);

/**
 * Checks if an IP address is inside restricted ranges:
 * - Loopback / localhost (127.0.0.0/8, ::1)
 * - Link-local (169.254.0.0/16, fe80::/10)
 * - Cloud metadata (169.254.169.254, 100.100.100.200, fd00:ec2::254)
 * - Private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 0.0.0.0/8)
 * - Private IPv6 (fc00::/7)
 */
export function isRestrictedIpAddress(ip: string, allowLocalhost = false): boolean {
  const normalized = ip.toLowerCase().trim();

  // Strip IPv4-mapped IPv6 prefix ::ffff: if present
  const cleanIp = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;

  if (allowLocalhost) {
    if (
      cleanIp === "127.0.0.1" ||
      cleanIp === "localhost" ||
      cleanIp === "::1" ||
      cleanIp.startsWith("127.")
    ) {
      return false;
    }
  }

  // Loopback / 0.0.0.0 / localhost
  if (cleanIp === "localhost" || cleanIp === "0.0.0.0" || cleanIp.startsWith("0.") || cleanIp.startsWith("127.") || cleanIp === "::1") {
    return true;
  }

  // Metadata endpoints
  if (
    cleanIp === "169.254.169.254" ||
    cleanIp === "100.100.100.200" ||
    cleanIp === "fd00:ec2::254"
  ) {
    return true;
  }

  // Link-local
  if (cleanIp.startsWith("169.254.") || cleanIp.startsWith("fe80:")) {
    return true;
  }

  // Private IPv4: 10.0.0.0/8
  if (cleanIp.startsWith("10.")) {
    return true;
  }

  // Private IPv4: 192.168.0.0/16
  if (cleanIp.startsWith("192.168.")) {
    return true;
  }

  // Private IPv4: 172.16.0.0/12
  if (cleanIp.startsWith("172.")) {
    const parts = cleanIp.split(".");
    if (parts.length >= 2) {
      const second = Number(parts[1]);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }
  }

  // Private IPv6: Unique Local Address (ULA) fc00::/7 (fc00 - fdff)
  if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) {
    return true;
  }

  return false;
}

/**
 * Validates target URL against strict SSRF rules before connection or DNS lookup.
 */
export function validateUrlSsrf(
  inputUrl: string,
  options: { allowLocalhost?: boolean } = {},
): URL {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new SSRFProtectionError(`SSRF protection: invalid target URL "${inputUrl}"`);
  }

  const allowLocal =
    options.allowLocalhost ??
    (process.env.ALLOW_LOCAL_SSRF === "true" || process.env.NODE_ENV === "test");

  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    throw new SSRFProtectionError(
      `SSRF protection: only HTTPS URLs are allowed. Got protocol "${url.protocol}" for host "${url.hostname}"`,
    );
  }

  const hostname = url.hostname.toLowerCase();

  // Block obvious metadata domains
  if (
    hostname === "metadata.google.internal" ||
    hostname.includes("169.254.169.254") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new SSRFProtectionError(
      `SSRF protection: forbidden metadata or internal hostname "${hostname}"`,
    );
  }

  // Check if hostname itself is a restricted literal IP
  if (isRestrictedIpAddress(hostname, allowLocal)) {
    throw new SSRFProtectionError(
      `SSRF protection: target hostname "${hostname}" resolves or matches a restricted IP range`,
    );
  }

  return url;
}

/**
 * Resolves all DNS records for a hostname and verifies none point to restricted IP ranges.
 * This prevents DNS rebinding attacks and domain names pointing to private IPs.
 */
export async function verifyDnsSsrf(
  hostname: string,
  options: { allowLocalhost?: boolean } = {},
): Promise<void> {
  const allowLocal =
    options.allowLocalhost ??
    (process.env.ALLOW_LOCAL_SSRF === "true" || process.env.NODE_ENV === "test");

  // If hostname is already an IP, we already checked it in validateUrlSsrf
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      throw new SSRFProtectionError(`SSRF protection: DNS resolution returned no records for "${hostname}"`);
    }

    for (const record of records) {
      if (isRestrictedIpAddress(record.address, allowLocal)) {
        throw new SSRFProtectionError(
          `SSRF protection: hostname "${hostname}" resolved to restricted IP address "${record.address}" (${record.family === 6 ? "IPv6" : "IPv4"})`,
        );
      }
    }
  } catch (error) {
    if (error instanceof SSRFProtectionError) {
      throw error;
    }
    const msg = toErrorMessage(error);
    throw new SSRFProtectionError(`SSRF protection: DNS lookup failed for "${hostname}": ${msg}`);
  }
}

/**
 * Filters incoming headers to only allow safe request headers.
 */
export function filterSafeHeaders(
  headers?: HeadersInit,
  customAllowed?: string[],
): Record<string, string> {
  if (!headers) return {};

  const allowedSet = customAllowed
    ? new Set([...ALLOWED_OUTGOING_HEADERS, ...customAllowed.map((h) => h.toLowerCase())])
    : ALLOWED_OUTGOING_HEADERS;

  const result: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      if (allowedSet.has(key.toLowerCase())) {
        result[key] = value;
      }
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (allowedSet.has(key.toLowerCase())) {
        result[key] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (allowedSet.has(key.toLowerCase()) && value !== undefined) {
        result[key] = String(value);
      }
    }
  }

  return result;
}

/**
 * Executes an HTTP fetch request with comprehensive SSRF protection, strict timeout,
 * forbidden redirects, and response size limiting.
 */
export async function fetchWithSsrfProtection(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: SsrfFetchOptions = {},
): Promise<Response> {
  const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const allowLocal =
    options.allowLocalhostForTesting ??
    (process.env.ALLOW_LOCAL_SSRF === "true" || process.env.NODE_ENV === "test");

  // Step 1: Validate URL protocol, hostname rules, and literal IP restrictions
  const validatedUrl = validateUrlSsrf(inputUrl, { allowLocalhost: allowLocal });

  // Step 2: Verify DNS resolution against private / restricted IPs
  await verifyDnsSsrf(validatedUrl.hostname, { allowLocalhost: allowLocal });

  // Step 3: Filter headers to safe allowlist
  const safeHeaders = filterSafeHeaders(init.headers, options.allowedHeaders);

  const timeoutMs = options.maxTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxSizeBytes = options.maxResponseSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`SSRF protection: request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const signals = init.signal ? [controller.signal, init.signal] : [controller.signal];

  // Merge signals if needed
  let combinedSignal = controller.signal;
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error(toErrorMessage(init.signal.reason));
    }
    const abortListener = () => controller.abort(init.signal?.reason);
    init.signal.addEventListener("abort", abortListener, { once: true });
  }

  try {
    const response = await fetch(validatedUrl.toString(), {
      ...init,
      headers: safeHeaders,
      signal: combinedSignal,
      // Strictly disallow automatic following of redirects to prevent redirecting to internal/metadata IPs
      redirect: "manual",
    });

    // Check for redirects
    if (
      response.type === "opaqueredirect" ||
      (response.status >= 300 && response.status < 400 && response.headers.has("location"))
    ) {
      const location = response.headers.get("location") ?? "unknown";
      throw new SSRFProtectionError(
        `SSRF protection: redirects are strictly forbidden for external seller fulfillment. Endpoint attempted redirect to "${location}"`,
      );
    }

    // Step 4: Wrap response body to enforce maximum response size limiting
    if (response.body) {
      let bytesRead = 0;
      const reader = response.body.getReader();

      const limitedStream = new ReadableStream({
        async pull(controllerStream) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controllerStream.close();
              return;
            }
            if (value) {
              bytesRead += value.byteLength;
              if (bytesRead > maxSizeBytes) {
                await reader.cancel();
                controllerStream.error(new ResponseSizeLimitExceededError(maxSizeBytes));
                return;
              }
              controllerStream.enqueue(value);
            }
          } catch (err) {
            controllerStream.error(err);
          }
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      });

      return new Response(limitedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof SSRFProtectionError || error instanceof ResponseSizeLimitExceededError) {
      throw error;
    }
    const message = toErrorMessage(error);
    if (message.includes("redirect")) {
      throw new SSRFProtectionError(`SSRF protection: redirect forbidden or fetch failed: ${message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
