import assert from "node:assert/strict";
import {
  ARC_TESTNET_GATEWAY_WALLET,
  ARC_TESTNET_NETWORK,
  ARC_TESTNET_USDC,
  ExternalPaymentValidationError,
  validateExternal402Challenge,
} from "../lib/seller/external-fulfillment.ts";
import type { ApiService } from "../lib/services/registry.ts";

const wallet = "0x8888888888888888888888888888888888888888";
const fulfillmentUrl = "https://external-seller.api.com:443/v1/risk?asset=BTC%2FUSD&mode=brief";
const service: ApiService = {
  id: "test-service",
  slug: "risk-score",
  name: "Risk Score API",
  shortDescription: "Risk score evaluation",
  longDescription: "Detailed risk evaluation",
  category: "Signals",
  method: "POST",
  endpoint: "/api/store/services/risk-score/invoke",
  fulfillmentUrl,
  priceLabel: "0.0005 USDC",
  priceUsd: 0.0005,
  status: "live",
  sourceType: "external_seller",
  isPaid: true,
  inputSchema: {}, outputSchema: {}, exampleRequest: {}, exampleResponse: {},
  exampleUseCase: "Risk scoring", agentReasoningHint: "Risk scoring",
  sellerWallet: wallet,
  expectedNetwork: ARC_TESTNET_NETWORK,
  expectedAsset: ARC_TESTNET_USDC,
};

function acceptance(overrides: Record<string, unknown> = {}) {
  return {
    scheme: "exact",
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: "500",
    payTo: wallet,
    maxTimeoutSeconds: 600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
    ...overrides,
  };
}

function challenge(overrides: { resourceUrl?: string; accepts?: unknown[]; x402Version?: number } = {}) {
  return Buffer.from(JSON.stringify({
    x402Version: overrides.x402Version ?? 2,
    resource: { url: overrides.resourceUrl ?? "https://external-seller.api.com/v1/risk?mode=brief&asset=BTC%2FUSD" },
    accepts: overrides.accepts ?? [acceptance()],
  })).toString("base64");
}

function expectInvalid(header: string, fragment: string) {
  assert.throws(
    () => validateExternal402Challenge({ service, status: 402, paymentRequiredHeader: header, fulfillmentUrl }),
    (error: unknown) => error instanceof ExternalPaymentValidationError && error.message.includes(fragment),
  );
}

console.log("[seller-external-402] validating exact challenge and acceptance");
const valid = validateExternal402Challenge({
  service,
  status: 402,
  paymentRequiredHeader: challenge(),
  fulfillmentUrl,
});
assert.equal(valid.selectedAccept.payTo, wallet);
assert.equal(valid.acceptsCount, 1);

expectInvalid(challenge({ resourceUrl: "https://external-seller.api.com/v1/other?asset=BTC%2FUSD&mode=brief" }), "Resource URL mismatch");
expectInvalid(challenge({ resourceUrl: "https://external-seller.api.com/v1/risk?asset=ETH%2FUSD&mode=brief" }), "Resource URL mismatch");
expectInvalid(challenge({ accepts: [acceptance(), acceptance({ payTo: "0x1111111111111111111111111111111111111111" })] }), "exactly one");
expectInvalid(challenge({ accepts: [acceptance({ network: "eip155:1" })] }), "Unauthorized network");
expectInvalid(challenge({ accepts: [acceptance({ asset: "0x1111111111111111111111111111111111111111" })] }), "Unauthorized asset");
expectInvalid(challenge({ accepts: [acceptance({ amount: "501" })] }), "Price quote mismatch");
expectInvalid(challenge({ accepts: [acceptance({ amount: "499" })] }), "Price quote mismatch");
expectInvalid(challenge({ accepts: [acceptance({ scheme: "upto" })] }), "Unauthorized x402 scheme");
expectInvalid(challenge({ accepts: [acceptance({ extra: { name: "malicious" } })] }), "Gateway acceptance");

const noResource = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [acceptance()] })).toString("base64");
expectInvalid(noResource, "resource.url");
assert.throws(
  () => validateExternal402Challenge({ service, status: 200, paymentRequiredHeader: challenge(), fulfillmentUrl }),
  (error: unknown) => error instanceof ExternalPaymentValidationError && error.message.includes("Expected HTTP 402"),
);
console.log("[seller-external-402] passed: full URL, exact price/wallet/network/asset, single supported acceptance");
