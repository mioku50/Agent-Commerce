/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { executeExternalSellerProxy, ExternalProxyError } from "../lib/seller/proxy.ts";
import { parseSellerServiceRequest } from "../app/api/seller/services/validation.ts";
import type { ApiService } from "../lib/services/registry.ts";

async function runTests() {
  console.log("Running Phase 27 External Seller fulfillment integration tests...");

  // 1. Verify validation rejects external_seller without fulfillmentUrl
  const mockReqMissingUrl = new Request("http://localhost/api/seller/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "External Weather API",
      slug: "external-weather",
      shortDescription: "Live weather data",
      category: "Signals",
      method: "GET",
      status: "draft",
      sourceType: "external_seller",
      priceUsd: 0.0005,
      sellerWallet: "0x8888888888888888888888888888888888888888",
      inputSchema: {},
      outputSchema: {},
      exampleRequest: {},
      exampleResponse: { temp: 24 },
    }),
  });
  const resMissingUrl = await parseSellerServiceRequest(mockReqMissingUrl);
  assert("error" in resMissingUrl, "Must fail validation without fulfillmentUrl");
  assert(resMissingUrl.error.includes("fulfillmentUrl is required"), "Error message must state fulfillmentUrl is required");

  // 2. Verify validation rejects external_seller with SSRF target (e.g. non-http/https)
  const mockReqBadProtocol = new Request("http://localhost/api/seller/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "External Weather API",
      slug: "external-weather",
      shortDescription: "Live weather data",
      category: "Signals",
      method: "GET",
      status: "draft",
      sourceType: "external_seller",
      priceUsd: 0.0005,
      fulfillmentUrl: "file:///etc/passwd",
      sellerWallet: "0x8888888888888888888888888888888888888888",
      inputSchema: {},
      outputSchema: {},
      exampleRequest: {},
      exampleResponse: { temp: 24 },
    }),
  });
  const resBadProtocol = await parseSellerServiceRequest(mockReqBadProtocol);
  assert("error" in resBadProtocol, "Must fail validation with bad protocol");
  assert(resBadProtocol.error.includes("HTTPS (or HTTP for testing)"), "Error message must state protocol restriction");

  // 3. Verify validation passes with correct external_seller parameters
  const mockReqValid = new Request("http://localhost/api/seller/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "External Weather API",
      slug: "external-weather",
      shortDescription: "Live weather data",
      category: "Signals",
      method: "POST",
      status: "draft",
      sourceType: "external_seller",
      priceUsd: 0.0005,
      fulfillmentUrl: "https://example.com/v1/weather",
      sellerWallet: "0x8888888888888888888888888888888888888888",
      inputSchema: {},
      outputSchema: {},
      exampleRequest: { city: "London" },
      exampleResponse: { temp: 24 },
    }),
  });
  const resValid = await parseSellerServiceRequest(mockReqValid);
  assert(!("error" in resValid), "Validation must pass for valid external_seller input");
  assert.equal(resValid.input.sourceType, "external_seller");
  assert.equal(resValid.input.fulfillmentUrl, "https://example.com/v1/weather");
  assert.equal(resValid.input.sellerWallet, "0x8888888888888888888888888888888888888888");

  // 4. Verify executeExternalSellerProxy integration with SSRF block
  const testService: ApiService = {
    id: "int-1",
    slug: resValid.input.slug,
    name: resValid.input.name,
    shortDescription: resValid.input.shortDescription,
    longDescription: resValid.input.longDescription,
    category: resValid.input.category,
    method: "POST",
    endpoint: `/api/store/services/${resValid.input.slug}/invoke`,
    fulfillmentUrl: "http://127.0.0.1:8080/internal/secret", // SSRF private IP
    priceLabel: "0.0005 USDC",
    priceUsd: resValid.input.priceUsd,
    status: "live",
    sourceType: "external_seller",
    isPaid: true,
    inputSchema: {},
    outputSchema: {},
    exampleRequest: {},
    exampleResponse: {},
    exampleUseCase: "Weather",
    agentReasoningHint: "Weather check",
    sellerWallet: resValid.input.sellerWallet,
  };

  await assert.rejects(
    () => executeExternalSellerProxy({ service: testService, method: "POST", body: { city: "Tokyo" } }),
    (err: unknown) => err instanceof ExternalProxyError && err.statusCode === 502 && err.message.includes("security rules"),
    "SSRF target in proxy execution must return 502 Bad Gateway",
  );

  console.log("Phase 27 External Seller integration tests passed! ✅");
}

runTests().catch((err) => {
  console.error("Integration tests failed:", err);
  process.exit(1);
});
