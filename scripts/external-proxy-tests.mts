/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  executeExternalSellerProxy,
  ExternalProxyError,
} from "../lib/seller/proxy.ts";
import type { ApiService } from "../lib/services/registry.ts";

async function runTests() {
  console.log("Running external proxy execution unit tests...");

  const baseService: ApiService = {
    id: "test-proxy-service",
    slug: "external-risk",
    name: "External Risk API",
    shortDescription: "Risk score evaluation",
    longDescription: "Detailed risk evaluation",
    category: "Signals",
    method: "POST",
    endpoint: "/api/store/services/external-risk/invoke",
    fulfillmentUrl: "https://example.com/v1/risk",
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
  };

  // Test 1: Missing fulfillmentUrl
  await assert.rejects(
    () =>
      executeExternalSellerProxy({
        service: { ...baseService, fulfillmentUrl: undefined },
        method: "POST",
      }),
    (err: unknown) => err instanceof ExternalProxyError && err.statusCode === 500 && err.message.includes("no fulfillmentUrl"),
    "Missing fulfillmentUrl must throw 500",
  );

  // Test 2: Missing sellerWallet
  await assert.rejects(
    () =>
      executeExternalSellerProxy({
        service: { ...baseService, sellerWallet: undefined },
        method: "POST",
      }),
    (err: unknown) => err instanceof ExternalProxyError && err.statusCode === 500 && err.message.includes("no registered sellerWallet"),
    "Missing sellerWallet must throw 500",
  );

  // Test 3: SSRF blocked target (localhost)
  await assert.rejects(
    () =>
      executeExternalSellerProxy({
        service: { ...baseService, fulfillmentUrl: "http://localhost:9000/admin/secrets" },
        method: "POST",
      }),
    (err: unknown) => err instanceof ExternalProxyError && err.statusCode === 502 && err.message.includes("security rules"),
    "SSRF target must throw 502 with security rules error",
  );

  // Test 4: Mock fetch where external seller returns 200 directly
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://example.com/v1/risk") {
        return new Response(JSON.stringify({ riskScore: 12, verdict: "LOW" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    };

    const res = await executeExternalSellerProxy({
      service: baseService,
      method: "POST",
      body: { query: "test" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { riskScore: 12, verdict: "LOW" });
    assert.equal(res.sourceType, "external_seller");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Test 5: Mock fetch where external seller returns 402 with tampered challenge (price higher than listing)
  try {
    const tamperedChallenge = Buffer.from(
      JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:5042002",
            asset: "0x3600000000000000000000000000000000000000",
            amount: "1000000", // $1 instead of $0.0005
            payTo: "0x8888888888888888888888888888888888888888",
          },
        ],
      }),
    ).toString("base64");

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://example.com/v1/risk") {
        return new Response("Payment Required", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": tamperedChallenge },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    };

    await assert.rejects(
      () =>
        executeExternalSellerProxy({
          service: baseService,
          method: "POST",
        }),
      (err: unknown) => err instanceof ExternalProxyError && err.statusCode === 502 && err.message.includes("challenge failed security validation"),
      "Tampered 402 challenge must throw 502 with security validation failure",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("All external proxy execution tests passed! ✅");
}

runTests().catch((err) => {
  console.error("External proxy tests failed:", err);
  process.exit(1);
});
