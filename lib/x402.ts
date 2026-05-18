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

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// Arc Testnet contract addresses (from @circle-fin/x402-batching SDK)
const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

export const sellerAddress = process.env.SELLER_ADDRESS as `0x${string}`;

const facilitator = new BatchFacilitatorClient();

let supabase: SupabaseClient | null = null;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase environment variables are required to record payment events.",
    );
  }

  supabase ??= createClient(supabaseUrl, serviceRoleKey);
  return supabase;
}

interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: {
    authorization?: {
      from?: string;
      to?: string;
      value?: string;
      validAfter?: string;
      validBefore?: string;
    };
    signature?: string;
  } & Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

type DiagnosticContext = {
  requestId: string;
  timestamp: string;
  endpoint: string;
  expected: {
    payTo: string;
    amount: string;
    network: string;
    asset: string;
    gatewayWallet: string;
  };
};

function createDiagnosticContext(endpoint: string, requirements: ReturnType<typeof buildPaymentRequirements>): DiagnosticContext {
  return {
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    endpoint,
    expected: {
      payTo: requirements.payTo,
      amount: requirements.amount,
      network: requirements.network,
      asset: requirements.asset,
      gatewayWallet: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

function safePaymentPayloadSummary(paymentPayload: PaymentPayload) {
  const authorization = paymentPayload.payload.authorization;

  return {
    x402Version: paymentPayload.x402Version,
    resourceUrl: paymentPayload.resource?.url,
    acceptedNetwork: typeof paymentPayload.accepted?.network === "string"
      ? paymentPayload.accepted.network
      : undefined,
    acceptedAmount: typeof paymentPayload.accepted?.amount === "string"
      ? paymentPayload.accepted.amount
      : undefined,
    acceptedPayTo: typeof paymentPayload.accepted?.payTo === "string"
      ? paymentPayload.accepted.payTo
      : undefined,
    payer: authorization?.from,
    authorizationTo: authorization?.to,
    authorizationValue: authorization?.value,
    validAfter: authorization?.validAfter,
    validBefore: authorization?.validBefore,
    hasSignature: typeof paymentPayload.payload.signature === "string",
  };
}

function sanitizeDiagnosticText(text: string) {
  return text
    .replace(/"signature"\s*:\s*"[^"]+"/gi, '"signature":"[redacted]"')
    .replace(/payment-signature:\s*[^\s]+/gi, "payment-signature: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]")
    .slice(0, 1200);
}

function gatewayErrorDetails(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Circle Gateway verify failed \((\d+)\):\s*([\s\S]*)/);

  return {
    name,
    message: sanitizeDiagnosticText(message),
    upstreamStatus: match?.[1],
    upstreamBody: match?.[2] ? sanitizeDiagnosticText(match[2]) : undefined,
  };
}

function logVerificationFailure(
  context: DiagnosticContext,
  details: Record<string, unknown>,
) {
  console.error(
    "[x402] Payment verification diagnostics",
    JSON.stringify({ ...context, ...details }),
  );
}

function buildPaymentRequirements(price: string) {
  // Parse dollar amount to USDC atomic units (6 decimals)
  const amount = Math.round(parseFloat(price.replace("$", "")) * 1_000_000);

  return {
    scheme: "exact" as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: amount.toString(),
    payTo: sellerAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

/**
 * Wraps a Next.js route handler with Circle Gateway payment verification.
 *
 * Follows fred-mvp's approach: manually constructs payment requirements with
 * the Gateway batching `extra` field and calls BatchFacilitatorClient directly.
 */
export function withGateway(
  handler: (req: NextRequest) => Promise<NextResponse>,
  price: string,
  endpoint: string,
) {
  const requirements = buildPaymentRequirements(price);

  return async (req: NextRequest) => {
    const diagnostics = createDiagnosticContext(endpoint, requirements);
    const paymentSignature = req.headers.get("payment-signature");

    // No payment — return 402 with Gateway batching payment requirements
    if (!paymentSignature) {
      console.log(
        `[x402] 402 Payment Required: ${endpoint} requestId=${diagnostics.requestId}`,
      );

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: endpoint,
          description: `Paid resource (${price} USDC)`,
          mimeType: "application/json",
        },
        accepts: [requirements],
      };

      return new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Commerce-Request-Id": diagnostics.requestId,
          "PAYMENT-REQUIRED": Buffer.from(
            JSON.stringify(paymentRequired),
          ).toString("base64"),
        },
      });
    }

    // Payment present — verify and settle via Circle Gateway
    try {
      const paymentPayload: PaymentPayload = JSON.parse(
        Buffer.from(paymentSignature, "base64").toString("utf-8"),
      );
      const paymentSummary = safePaymentPayloadSummary(paymentPayload);

      let verifyResult;
      try {
        verifyResult = await facilitator.verify(
          paymentPayload,
          requirements,
        );
      } catch (error) {
        logVerificationFailure(diagnostics, {
          stage: "verify threw",
          payment: paymentSummary,
          error: gatewayErrorDetails(error),
        });
        throw error;
      }

      if (!verifyResult.isValid) {
        logVerificationFailure(diagnostics, {
          stage: "verify invalid",
          payer: verifyResult.payer ?? paymentSummary.payer,
          invalidReason: verifyResult.invalidReason,
          payment: paymentSummary,
        });
        return NextResponse.json(
          {
            error: "Payment verification failed",
            reason: verifyResult.invalidReason,
            requestId: diagnostics.requestId,
          },
          {
            status: 402,
            headers: {
              "X-Agent-Commerce-Request-Id": diagnostics.requestId,
            },
          },
        );
      }

      const settleResult = await facilitator.settle(
        paymentPayload,
        requirements,
      );

      if (!settleResult.success) {
        console.error(
          `[x402] Settlement failed for ${endpoint} requestId=${diagnostics.requestId}: ${settleResult.errorReason}`,
        );
        return NextResponse.json(
          {
            error: "Payment settlement failed",
            reason: settleResult.errorReason,
            requestId: diagnostics.requestId,
          },
          {
            status: 402,
            headers: {
              "X-Agent-Commerce-Request-Id": diagnostics.requestId,
            },
          },
        );
      }

      // Record payment event in Supabase
      const amountUsdc = (
        Number(requirements.amount) / 1e6
      ).toString();
      const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";

      const { error } = await getSupabase().from("payment_events").insert({
        endpoint,
        payer,
        amount_usdc: amountUsdc,
        network: requirements.network,
        gateway_tx: settleResult.transaction ?? null,
        raw: { requirements, settleResult },
      });

      if (error) {
        console.error("Failed to record payment event:", error.message);
      }

      console.log(
        `[x402] Payment settled: ${endpoint} — ${amountUsdc} USDC from ${payer} requestId=${diagnostics.requestId}`,
      );

      // Call the actual route handler
      const response = await handler(req);

      // Forward settlement info to the client
      const settleResponseHeader = Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settleResult.transaction,
          network: requirements.network,
          payer,
        }),
      ).toString("base64");

      response.headers.set("PAYMENT-RESPONSE", settleResponseHeader);
      response.headers.set("X-Agent-Commerce-Request-Id", diagnostics.requestId);
      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[x402] Payment processing error:",
        JSON.stringify({
          ...diagnostics,
          error: gatewayErrorDetails(error),
        }),
      );
      return NextResponse.json(
        { error: "Payment processing error", message, requestId: diagnostics.requestId },
        {
          status: 500,
          headers: {
            "X-Agent-Commerce-Request-Id": diagnostics.requestId,
          },
        },
      );
    }
  };
}
