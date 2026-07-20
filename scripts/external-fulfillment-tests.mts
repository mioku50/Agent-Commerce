/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  validateExternal402Challenge,
  ExternalPaymentValidationError,
} from "../lib/seller/external-fulfillment.ts";
import type { ApiService } from "../lib/services/registry.ts";

async function runTests() {
  console.log("Running external fulfillment 402 challenge validation tests...");

  const mockService: ApiService = {
    id: "test-service",
    slug: "risk-score",
    name: "Risk Score API",
    shortDescription: "Risk score evaluation",
    longDescription: "Detailed risk evaluation",
    category: "Signals",
    method: "POST",
    endpoint: "/api/store/services/risk-score/invoke",
    fulfillmentUrl: "https://external-seller.api.com/v1/risk",
    priceLabel: "0.0005 USDC",
    priceUsd: 0.0005,
    status: "live",
    sourceType: "external_seller",
    isPaid: true,
    inputSchema: {},
    outputSchema: {},
    exampleRequest: {},
    exampleResponse: {},
    exampleUseCase: "Risk scoring",
    agentReasoningHint: "Use for risk evaluation",
    sellerWallet: "0x8888888888888888888888888888888888888888",
    expectedNetwork: "eip155:5042002",
    expectedAsset: "0x3600000000000000000000000000000000000000",
  };

  function encodeChallenge(obj: unknown) {
    return Buffer.from(JSON.stringify(obj)).toString("base64");
  }

  const validChallenge = encodeChallenge({
    x402Version: 1,
    resource: { url: "https://external-seller.api.com/v1/risk" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:5042002",
        asset: "0x3600000000000000000000000000000000000000",
        amount: "500", // exactly 0.0005 USDC (6 decimals)
        payTo: "0x8888888888888888888888888888888888888888",
      },
    ],
  });

  // Test 1: Valid challenge succeeds
  const summary = validateExternal402Challenge({
    service: mockService,
    status: 402,
    paymentRequiredHeader: validChallenge,
    fulfillmentUrl: "https://external-seller.api.com/v1/risk",
  });
  assert.equal(summary.firstAccept?.payTo, "0x8888888888888888888888888888888888888888");

  // Test 2: Status not 402
  assert.throws(
    () =>
      validateExternal402Challenge({
        service: mockService,
        status: 200,
        paymentRequiredHeader: validChallenge,
        fulfillmentUrl: "https://external-seller.api.com/v1/risk",
      }),
    (err: unknown) => err instanceof ExternalPaymentValidationError && err.message.includes("Expected HTTP 402"),
    "Non-402 status must throw",
  );

  // Test 3: Unauthorized network
  const wrongNetwork = encodeChallenge({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:1", // mainnet instead of Arc
        asset: "0x3600000000000000000000000000000000000000",
        amount: "500",
        payTo: "0x8888888888888888888888888888888888888888",
      },
    ],
  });
  assert.throws(
    () =>
      validateExternal402Challenge({
        service: mockService,
        status: 402,
        paymentRequiredHeader: wrongNetwork,
        fulfillmentUrl: "https://external-seller.api.com/v1/risk",
      }),
    (err: unknown) => err instanceof ExternalPaymentValidationError && err.message.includes("Unauthorized network"),
    "Wrong network must throw",
  );

  // Test 4: Price increase violation (trying to charge 1000 atomic units instead of 500)
  const priceViolation = encodeChallenge({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:5042002",
        asset: "0x3600000000000000000000000000000000000000",
        amount: "1000",
        payTo: "0x8888888888888888888888888888888888888888",
      },
    ],
  });
  assert.throws(
    () =>
      validateExternal402Challenge({
        service: mockService,
        status: 402,
        paymentRequiredHeader: priceViolation,
        fulfillmentUrl: "https://external-seller.api.com/v1/risk",
      }),
    (err: unknown) => err instanceof ExternalPaymentValidationError && err.message.includes("Price quote violation"),
    "Exceeding listing price quote must throw",
  );

  // Test 5: Unauthorized payTo address
  const wrongPayTo = encodeChallenge({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:5042002",
        asset: "0x3600000000000000000000000000000000000000",
        amount: "500",
        payTo: "0x1111111111111111111111111111111111111111", // attacker wallet
      },
    ],
  });
  assert.throws(
    () =>
      validateExternal402Challenge({
        service: mockService,
        status: 402,
        paymentRequiredHeader: wrongPayTo,
        fulfillmentUrl: "https://external-seller.api.com/v1/risk",
      }),
    (err: unknown) => err instanceof ExternalPaymentValidationError && err.message.includes("Unauthorized payTo wallet"),
    "Attacker payTo address must throw",
  );

  console.log("All external fulfillment validation tests passed! ✅");
}

runTests().catch((err) => {
  console.error("External fulfillment tests failed:", err);
  process.exit(1);
});
