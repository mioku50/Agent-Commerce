/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  fetchWithSsrfProtection,
  SSRFProtectionError,
  verifyDnsSsrf,
  type SsrfFetchOptions,
} from "./ssrf.ts";
import {
  validateExternal402Challenge,
  ExternalPaymentValidationError,
  hashChallenge,
} from "./external-fulfillment.ts";
import type { ApiService } from "../services/registry.ts";

export class ExternalProxyError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "ExternalProxyError";
    this.statusCode = statusCode;
  }
}

export type ProxyExecutionInput = {
  service: ApiService;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  payerPrivateKey?: string;
};

export type ProxyExecutionResult = {
  status: number;
  data: unknown;
  paidAmountUsdc?: string;
  paymentRequiredChallenge?: unknown;
  sourceType: "external_seller";
};

/**
 * Resolves the platform buyer agent private key used for paying external sellers.
 */
export function getPlatformBuyerPrivateKey(override?: string): string | null {
  if (override?.trim()) return override.trim();
  const candidates = [
    process.env.HOSTED_AGENT_PRIVATE_KEY,
    process.env.BUYER_PRIVATE_KEY,
    process.env.AGENT_PRIVATE_KEY,
  ];
  for (const key of candidates) {
    if (key?.trim() && /^0x[a-fA-F0-9]{64}$/.test(key.trim())) {
      return key.trim();
    }
  }
  return null;
}

/**
 * Safely invokes an external seller endpoint with strict SSRF protection, 402 challenge verification,
 * and x402 payment execution via Circle Gateway.
 */
export async function executeExternalSellerProxy({
  service,
  method,
  body,
  headers,
  payerPrivateKey,
}: ProxyExecutionInput): Promise<ProxyExecutionResult> {
  if (!service.fulfillmentUrl) {
    throw new ExternalProxyError(
      `Service "${service.slug}" has no fulfillmentUrl configured.`,
      500,
    );
  }

  if (!service.sellerWallet) {
    throw new ExternalProxyError(
      `Service "${service.slug}" has no registered sellerWallet configured.`,
      500,
    );
  }

  let pinnedIps: string[] = [];
  const ssrfOptions: SsrfFetchOptions = {
    maxResponseSizeBytes: service.maxResponseSizeBytes ?? 1_048_576, // 1MB
    maxTimeoutMs: service.maxTimeoutMs ?? 15_000, // 15s
    onDnsResolved: (ips) => {
      pinnedIps = ips;
    },
  };

  // Only forward safe, sanitized headers
  const safeHeaders: Record<string, string> = {
    Accept: "application/json",
  };
  if (method === "POST") {
    safeHeaders["Content-Type"] = "application/json";
  }
  if (headers?.["x-agent-commerce-request-id"]) {
    safeHeaders["X-Agent-Commerce-Request-Id"] = headers["x-agent-commerce-request-id"];
  }

  const serializedBody =
    method === "POST" && body !== undefined
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : undefined;

  let preflightResponse: Response;
  try {
    preflightResponse = await fetchWithSsrfProtection(
      service.fulfillmentUrl,
      {
        method,
        headers: safeHeaders,
        ...(serializedBody !== undefined ? { body: serializedBody } : {}),
      },
      ssrfOptions,
    );
  } catch (err) {
    if (err instanceof SSRFProtectionError) {
      throw new ExternalProxyError(
        `External seller endpoint rejected due to security rules: ${err.message}`,
        502,
      );
    }
    throw new ExternalProxyError(
      `Failed to connect to external seller endpoint: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  // If the external seller returned 2xx directly (free endpoint or already satisfied)
  if (preflightResponse.status >= 200 && preflightResponse.status < 300) {
    let data: unknown;
    const text = await preflightResponse.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawResponse: text };
    }
    return {
      status: preflightResponse.status,
      data,
      sourceType: "external_seller",
    };
  }

  // If status is not 402, return error from upstream
  if (preflightResponse.status !== 402) {
    const errorText = await preflightResponse.text().catch(() => "");
    throw new ExternalProxyError(
      `External seller endpoint returned unexpected status ${preflightResponse.status}: ${errorText.slice(0, 300)}`,
      preflightResponse.status >= 400 && preflightResponse.status < 600
        ? preflightResponse.status
        : 502,
    );
  }

  // Handle 402 Payment Required
  const paymentRequiredHeader =
    preflightResponse.headers.get("PAYMENT-REQUIRED") ||
    preflightResponse.headers.get("payment-required");

  let challengeSummary;
  try {
    challengeSummary = validateExternal402Challenge({
      service,
      status: 402,
      paymentRequiredHeader,
      fulfillmentUrl: service.fulfillmentUrl,
    });
  } catch (err) {
    if (err instanceof ExternalPaymentValidationError) {
      throw new ExternalProxyError(
        `External seller 402 challenge failed security validation: ${err.message}`,
        502,
      );
    }
    throw err;
  }

  const initialChallengeHash = hashChallenge(paymentRequiredHeader!);

  let preflightResponse2: Response;
  try {
    preflightResponse2 = await fetchWithSsrfProtection(
      service.fulfillmentUrl,
      {
        method,
        headers: safeHeaders,
        ...(serializedBody !== undefined ? { body: serializedBody } : {}),
      },
      {
        ...ssrfOptions,
        pinnedResolvedIps: pinnedIps,
      },
    );
  } catch (err) {
    if (err instanceof SSRFProtectionError) {
      throw new ExternalProxyError(
        `External seller endpoint rejected due to security rules: ${err.message}`,
        502,
      );
    }
    throw new ExternalProxyError(
      `Failed to connect to external seller endpoint on challenge re-validation: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  if (preflightResponse2.status !== 402) {
    throw new ExternalProxyError(
      `External seller endpoint returned status ${preflightResponse2.status} instead of 402 during challenge re-validation.`,
      502,
    );
  }

  const paymentRequiredHeader2 =
    preflightResponse2.headers.get("PAYMENT-REQUIRED") ||
    preflightResponse2.headers.get("payment-required");

  if (!paymentRequiredHeader2 || hashChallenge(paymentRequiredHeader2) !== initialChallengeHash) {
    throw new ExternalProxyError(
      "Payment-Required challenge changed between attempts — aborting",
      422,
    );
  }

  const resolvedPrivateKey = getPlatformBuyerPrivateKey(payerPrivateKey);
  if (!resolvedPrivateKey) {
    throw new ExternalProxyError(
      "Platform buyer agent private key (HOSTED_AGENT_PRIVATE_KEY or BUYER_PRIVATE_KEY) is not configured to pay external sellers.",
      500,
    );
  }

  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: resolvedPrivateKey as `0x${string}`,
  });

  try {
    const targetUrlObj = new URL(service.fulfillmentUrl);
    await verifyDnsSsrf(targetUrlObj.hostname, {
      allowLocalhost:
        ssrfOptions.allowLocalhostForTesting ??
        (process.env.ALLOW_LOCAL_SSRF === "true" || process.env.NODE_ENV === "test"),
      pinnedResolvedIps: pinnedIps,
    });

    const payResult = await gateway.pay(service.fulfillmentUrl, {
      method,
      body: method === "POST" ? body : undefined,
      headers: safeHeaders,
    });

    return {
      status: 200,
      data: payResult.data,
      paidAmountUsdc: payResult.formattedAmount,
      paymentRequiredChallenge: challengeSummary,
      sourceType: "external_seller",
    };
  } catch (err) {
    if (err instanceof SSRFProtectionError) {
      throw new ExternalProxyError(
        `External seller payment request rejected due to SSRF rules: ${err.message}`,
        502,
      );
    }
    throw new ExternalProxyError(
      `Failed to execute x402 payment to external seller: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }
}
