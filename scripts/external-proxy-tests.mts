import assert from "node:assert/strict";
import {
  executeExternalSellerProxy,
  executePreparedExternalSellerPayment,
  ExternalProxyError,
  prepareExternalSellerRequest,
} from "../lib/seller/proxy.ts";
import {
  ARC_TESTNET_GATEWAY_WALLET,
  ARC_TESTNET_NETWORK,
  ARC_TESTNET_USDC,
} from "../lib/seller/external-fulfillment.ts";
import { setSellerRequestAdapterForTests } from "../lib/seller/ssrf.ts";
import type { ApiService } from "../lib/services/registry.ts";
import { readFileSync } from "node:fs";

process.env.NODE_ENV = "test";
const payerPrivateKey = `0x${"11".repeat(32)}`;
const sellerWallet = "0x8888888888888888888888888888888888888888";

const baseService: ApiService = {
  id: "test-proxy-service",
  slug: "external-risk",
  name: "External Risk API",
  shortDescription: "Risk score evaluation",
  longDescription: "Detailed risk evaluation",
  category: "Signals",
  method: "POST",
  endpoint: "/api/store/services/external-risk/invoke",
  fulfillmentUrl: "https://8.8.8.8/v1/risk?mode=brief",
  priceLabel: "0.0005 USDC",
  priceUsd: 0.0005,
  status: "live",
  sourceType: "external_seller",
  isPaid: true,
  inputSchema: {}, outputSchema: {}, exampleRequest: {}, exampleResponse: {},
  exampleUseCase: "Risk scoring", agentReasoningHint: "Risk evaluation",
  sellerWallet,
  expectedNetwork: ARC_TESTNET_NETWORK,
  expectedAsset: ARC_TESTNET_USDC,
};

function encodeChallenge(amount = "500") {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    resource: { url: baseService.fulfillmentUrl },
    accepts: [{
      scheme: "exact",
      network: ARC_TESTNET_NETWORK,
      asset: ARC_TESTNET_USDC,
      amount,
      payTo: sellerWallet,
      maxTimeoutSeconds: 600,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
      },
    }],
  })).toString("base64");
}

function paymentResponse(transaction = "gateway-downstream-test-transaction") {
  return Buffer.from(JSON.stringify({ success: true, transaction })).toString("base64");
}

async function run() {
  console.log("[seller-proxy] running protected request-scoped payment tests");
  await assert.rejects(
    () => executeExternalSellerProxy({ service: { ...baseService, fulfillmentUrl: undefined }, method: "POST" }),
    (error: unknown) => error instanceof ExternalProxyError && error.statusCode === 500,
  );
  await assert.rejects(
    () => executeExternalSellerProxy({ service: { ...baseService, sellerWallet: undefined }, method: "POST" }),
    (error: unknown) => error instanceof ExternalProxyError && error.statusCode === 500,
  );
  await assert.rejects(
    () => executeExternalSellerProxy({
      service: { ...baseService, fulfillmentUrl: "https://169.254.169.254/latest/meta-data" },
      method: "POST",
    }),
    (error: unknown) => error instanceof ExternalProxyError && error.message.includes("security rules"),
  );

  let calls = 0;
  setSellerRequestAdapterForTests(async () => {
    calls += 1;
    return new Response(JSON.stringify({ ignoredPayment: true }), { status: 200 });
  });
  await assert.rejects(
    () => prepareExternalSellerRequest({ service: baseService, method: "POST", body: { input: "test" } }),
    (error: unknown) => error instanceof ExternalProxyError && error.message.includes("direct success without x402"),
  );
  assert.equal(calls, 1, "Paid direct 200 must stop before any downstream payment attempt");

  const invokeSource = readFileSync(
    new URL("../app/api/store/services/[slug]/invoke/route.ts", import.meta.url),
    "utf8",
  );
  assert(
    invokeSource.indexOf("preparedExternal = await prepareExternalSellerRequest") < invokeSource.indexOf("return withGateway"),
    "Paid external preflight must complete before the buyer settlement wrapper is entered",
  );

  const free = { ...baseService, priceUsd: 0, priceLabel: "Free", isPaid: false };
  const freePrepared = await prepareExternalSellerRequest({ service: free, method: "POST" });
  assert.equal(freePrepared.kind, "free-response");

  const challenge = encodeChallenge();
  calls = 0;
  let pinnedIp = "";
  setSellerRequestAdapterForTests(async (_url, init, ip) => {
    calls += 1;
    pinnedIp = ip;
    const headers = init.headers as Record<string, string>;
    if (calls === 1) {
      assert.equal(headers["Payment-Signature"], undefined);
      return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": challenge } });
    }
    assert(headers["Payment-Signature"], "Actual request must carry the signed exact acceptance");
    return new Response(JSON.stringify({ riskScore: 12 }), {
      status: 200,
      headers: { "PAYMENT-RESPONSE": paymentResponse() },
    });
  });
  const paid = await executeExternalSellerProxy({
    service: baseService,
    method: "POST",
    body: { input: "test" },
    payerPrivateKey,
  });
  assert.equal(calls, 2, "Flow must use one challenge request and one signed request");
  assert.equal(pinnedIp, "8.8.8.8");
  assert.equal(paid.paidAmountUsdc, "0.0005");
  assert.equal(paid.downstreamTransaction, "gateway-downstream-test-transaction");

  calls = 0;
  setSellerRequestAdapterForTests(async (_url, init) => {
    calls += 1;
    const headers = init.headers as Record<string, string>;
    if (!headers["Payment-Signature"]) {
      return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": challenge } });
    }
    return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": encodeChallenge("499") } });
  });
  await assert.rejects(
    () => executeExternalSellerProxy({ service: baseService, method: "POST", payerPrivateKey }),
    (error: unknown) => error instanceof ExternalProxyError && error.statusCode === 422 && error.message.includes("changed after preflight"),
  );
  assert.equal(calls, 2);

  calls = 0;
  setSellerRequestAdapterForTests(async () => {
    calls += 1;
    return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": challenge } });
  });
  const prepared = await prepareExternalSellerRequest({ service: baseService, method: "POST" });
  assert.equal(prepared.kind, "payment-required");
  if (prepared.kind === "payment-required") {
    prepared.pinnedIps = ["1.1.1.1"];
    await assert.rejects(
      () => executePreparedExternalSellerPayment(prepared, payerPrivateKey),
      (error: unknown) => error instanceof ExternalProxyError && error.message.includes("DNS rebinding"),
    );
  }
  assert.equal(calls, 1, "A changed address must be rejected before the signed HTTP connection");

  setSellerRequestAdapterForTests(null);
  console.log("[seller-proxy] passed: no paid direct-200, exact challenge signing, changed challenge/IP rejection, downstream settlement confirmation");
}

run().catch((error) => {
  setSellerRequestAdapterForTests(null);
  console.error("[seller-proxy] failed", error);
  process.exitCode = 1;
});
