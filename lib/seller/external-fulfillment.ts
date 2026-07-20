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

import { parseUnits } from "viem";
import {
  fetchWithSsrfProtection,
  SSRFProtectionError,
  type SsrfFetchOptions,
} from "./ssrf.ts";
import type { ApiService } from "../services/registry.ts";

const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ALLOWED_SCHEMES = new Set(["exact"]);

export class ExternalPaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalPaymentValidationError";
  }
}

export type ExternalChallengeSummary = {
  x402Version?: unknown;
  resource?: { url?: string };
  acceptsCount: number;
  firstAccept?: {
    scheme?: string;
    network?: string;
    asset?: string;
    amount?: string;
    payTo?: string;
    extra?: Record<string, unknown>;
  };
};

function decodeBase64Json(value: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

export function parsePaymentRequiredChallenge(
  headerValue: string | null | undefined,
): ExternalChallengeSummary | null {
  if (!headerValue) return null;
  const decoded = decodeBase64Json(headerValue);
  if (!decoded || typeof decoded !== "object") return null;

  const challenge = decoded as {
    x402Version?: unknown;
    resource?: { url?: string };
    accepts?: Array<{
      scheme?: string;
      network?: string;
      asset?: string;
      amount?: string;
      payTo?: string;
      extra?: Record<string, unknown>;
    }>;
  };

  const firstAccept = challenge.accepts?.[0];
  if (!firstAccept) {
    return {
      x402Version: challenge.x402Version,
      resource: challenge.resource,
      acceptsCount: 0,
    };
  }

  return {
    x402Version: challenge.x402Version,
    resource: challenge.resource,
    acceptsCount: challenge.accepts?.length ?? 0,
    firstAccept: {
      scheme: firstAccept.scheme,
      network: firstAccept.network,
      asset: firstAccept.asset,
      amount: firstAccept.amount,
      payTo: firstAccept.payTo,
      extra: firstAccept.extra,
    },
  };
}

export type ValidateChallengeInput = {
  service: ApiService;
  status: number;
  paymentRequiredHeader?: string | null;
  fulfillmentUrl: string;
};

/**
 * Validates external HTTP 402 challenge against immutable listing parameters.
 * Prohibits unauthorized networks, schemes, wallets, price increases, or redirects.
 */
export function validateExternal402Challenge({
  service,
  status,
  paymentRequiredHeader,
  fulfillmentUrl,
}: ValidateChallengeInput): ExternalChallengeSummary {
  if (status !== 402) {
    throw new ExternalPaymentValidationError(
      `Expected HTTP 402 Payment Required from external seller endpoint "${fulfillmentUrl}", but received status ${status}.`,
    );
  }

  if (!paymentRequiredHeader) {
    throw new ExternalPaymentValidationError(
      `External seller endpoint "${fulfillmentUrl}" returned HTTP 402 without a valid PAYMENT-REQUIRED challenge header.`,
    );
  }

  const summary = parsePaymentRequiredChallenge(paymentRequiredHeader);
  if (!summary || !summary.firstAccept) {
    throw new ExternalPaymentValidationError(
      `Could not decode a valid x402 PAYMENT-REQUIRED challenge from external seller endpoint "${fulfillmentUrl}".`,
    );
  }

  const { scheme, network, asset, amount, payTo } = summary.firstAccept;

  // 1. Network check
  if (network !== ARC_TESTNET_NETWORK) {
    throw new ExternalPaymentValidationError(
      `Unauthorized network in x402 challenge: expected "${ARC_TESTNET_NETWORK}", got "${String(network)}".`,
    );
  }

  // 2. Scheme check
  if (typeof scheme !== "string" || !ALLOWED_SCHEMES.has(scheme.toLowerCase())) {
    throw new ExternalPaymentValidationError(
      `Unauthorized x402 scheme: expected "exact", got "${String(scheme)}".`,
    );
  }

  // 3. payTo wallet check
  const registeredWallet = service.sellerWallet || "";
  if (!registeredWallet || typeof payTo !== "string" || payTo.toLowerCase() !== registeredWallet.toLowerCase()) {
    throw new ExternalPaymentValidationError(
      `Unauthorized payTo wallet in x402 challenge: expected registered seller wallet "${registeredWallet}", got "${String(payTo)}".`,
    );
  }

  // 4. Amount quote check (must not exceed immutable listing price)
  const quoteAtomic = parseUnits(String(service.priceUsd || 0), 6);
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) {
    throw new ExternalPaymentValidationError(
      `Invalid amount format in x402 challenge: "${String(amount)}".`,
    );
  }

  if (BigInt(amount) > quoteAtomic) {
    throw new ExternalPaymentValidationError(
      `Price quote violation: x402 challenge requests ${amount} atomic units, exceeding registered service listing price of ${quoteAtomic} (${service.priceUsd} USDC).`,
    );
  }

  // 5. Asset check
  if (typeof asset !== "string" || asset.toLowerCase() !== ARC_TESTNET_USDC.toLowerCase()) {
    throw new ExternalPaymentValidationError(
      `Unauthorized asset in x402 challenge: expected Arc Testnet USDC "${ARC_TESTNET_USDC}", got "${String(asset)}".`,
    );
  }

  // 6. Resource URL check
  if (summary.resource?.url) {
    let challengeHost = "";
    let targetHost = "";
    try {
      challengeHost = new URL(summary.resource.url).host.toLowerCase();
      targetHost = new URL(fulfillmentUrl).host.toLowerCase();
    } catch {
      throw new ExternalPaymentValidationError(
        `Invalid resource URL format in x402 challenge: "${summary.resource.url}".`,
      );
    }
    if (challengeHost !== targetHost) {
      throw new ExternalPaymentValidationError(
        `Domain mismatch: challenge resource URL host "${challengeHost}" does not match registered fulfillment host "${targetHost}".`,
      );
    }
  }

  return summary;
}

/**
 * Executes a function while temporarily intercepting globalThis.fetch with fetchWithSsrfProtection.
 * Guarantees that third-party SDK calls (like GatewayClient.pay) obey SSRF, redirect, and size limits.
 */
export async function withSsrfProtectedFetch<T>(
  fn: () => Promise<T>,
  options?: SsrfFetchOptions,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      fetchWithSsrfProtection(input, init, options);
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
