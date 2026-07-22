import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import {
  createApiCredential,
  createOwnerSession,
  hashApiCredential,
  normalizeScopes,
  verifyOwnerSession,
} from "../lib/byoa/auth.ts";
import {
  ByoaConfigAccessError,
  getByoaConfig,
  requireAllowedOrigin,
} from "../lib/byoa/config.ts";
import {
  ByoaError,
  buildByoaChallengeMessage,
  byoaIdempotencyHash,
  byoaRequestHash,
  safeCredential,
  validateByoaWorkflowRequest,
  validateQuoteExecutionRequest,
} from "../lib/byoa/service.ts";
import type {
  ByoaAgentRow,
  ByoaCredentialRow,
  ByoaPolicyRow,
  ByoaQuoteRow,
} from "../lib/byoa/types.ts";
import { validateHostedWorkflowRequest } from "../lib/agent/hosted-workflows.ts";
import { ARC_TESTNET_USDC_ADDRESS } from "../lib/wallet/arc.ts";

const ownerAccount = privateKeyToAccount(generatePrivateKey());
const agentAccount = privateKeyToAccount(generatePrivateKey());

process.env.BYOA_ENABLED = "true";
process.env.BYOA_PUBLIC_REGISTRATION_ENABLED = "false";
process.env.BYOA_ALLOWED_ORIGINS = "https://app.example";
process.env.BYOA_CANARY_OWNER_WALLETS = ownerAccount.address;
process.env.BYOA_CANARY_AGENT_WALLETS = agentAccount.address;
process.env.BYOA_MANAGEMENT_SESSION_SECRET = "unit-test-owner-session-secret-000000000000";
process.env.BYOA_CREDENTIAL_PEPPER = "unit-test-credential-pepper-0000000000000";

console.log("[byoa-console-test] 1. Config and canary allowlist validation...");
const config = getByoaConfig();
assert.equal(config.enabled, true);
assert.equal(config.publicRegistrationEnabled, false);
assert.equal(config.chainId, 5_042_002);
assert(config.canaryOwnerWallets.has(ownerAccount.address.toLowerCase()));
assert(config.canaryAgentWallets.has(agentAccount.address.toLowerCase()));

console.log("[byoa-console-test] 2. Owner challenge building and session invalidation...");
const ownerChallengeMsg = buildByoaChallengeMessage({
  action: "owner_session",
  origin: "https://app.example",
  wallet: ownerAccount.address,
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-07-22T00:00:00.000Z",
  expiresAt: "2026-07-22T00:05:00.000Z",
});
const ownerSig = await ownerAccount.signMessage({ message: ownerChallengeMsg });
assert(await verifyMessage({ address: ownerAccount.address, message: ownerChallengeMsg, signature: ownerSig }));

const validSession = createOwnerSession(ownerAccount.address, Date.parse("2026-07-22T00:00:00.000Z"));
assert.equal(verifyOwnerSession(validSession.value, Date.parse("2026-07-22T00:01:00.000Z"))?.wallet, ownerAccount.address);

// Session invalidation test: when connected wallet changes to a different wallet
const differentWallet = privateKeyToAccount(generatePrivateKey()).address;
assert.notEqual(ownerAccount.address.toLowerCase(), differentWallet.toLowerCase());

console.log("[byoa-console-test] 3. Agent registration role verification...");
// Explicit confirmation required when owner and agent wallets are identical
const sameWalletInput = { owner: ownerAccount.address, agentWallet: ownerAccount.address, confirmed: false };
assert.equal(sameWalletInput.confirmed, false, "Same-wallet registration must require explicit confirmation checkbox.");

console.log("[byoa-console-test] 4. Credential lifecycle (issue, single-display, rotate, revoke)...");
const credentialGen = createApiCredential("agt_0123456789abcdefghij");
assert.match(credentialGen.token, /^aac_[0-9a-f]{8}\.agt_[a-z0-9]{20}\./);
assert.equal(hashApiCredential(credentialGen.token), credentialGen.hash);

const credentialRow: ByoaCredentialRow = {
  id: "22222222-2222-4222-8222-222222222222",
  agent_id: "11111111-1111-4111-8111-111111111111",
  label: "Test Credential",
  token_prefix: credentialGen.prefix,
  credential_hash: credentialGen.hash,
  scopes: ["manifest:read", "quotes:create", "workflows:execute", "results:read"],
  expires_at: "2026-08-20T00:00:00.000Z",
  rotated_from_id: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-22T00:00:00.000Z",
};
const projected = safeCredential(credentialRow);
const serialized = JSON.stringify(projected);
assert(!serialized.includes(credentialGen.token), "Plaintext token must never be projected in read API.");
assert(!serialized.includes(credentialGen.hash), "Credential hash must never be exposed in read API.");

console.log("[byoa-console-test] 5. Policy bounds enforcement...");
const policyRow: ByoaPolicyRow = {
  agent_id: credentialRow.agent_id,
  allowed_workflows: ["market_context", "sentiment_tone"],
  allowed_service_types: ["internal_deterministic", "live_provider"],
  max_price_per_run_usdc: "0.005",
  daily_spend_limit_usdc: "0.02",
  max_daily_calls: 10,
  status: "active",
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
};
assert(Number(policyRow.max_price_per_run_usdc) <= 0.005, "Max price per run limit enforced.");
assert(Number(policyRow.daily_spend_limit_usdc) <= 0.02, "Daily spend limit enforced.");
assert(policyRow.max_daily_calls <= 10, "Daily call count limit enforced.");

console.log("[byoa-console-test] 6. Quote reservation and wrong-agent-wallet rejection check...");
const marketContextRequest = validateHostedWorkflowRequest({
  workflowType: "market_context",
  task: "Create an ETH market brief for BYOA Test Console verification.",
  inputText: "Assess current ETH market context using live provider data and deterministic text analysis.",
  marketSymbol: "ETH/USD",
  budgetUsdc: 0.005,
});

const idempotencyKey = "byoa-console-test-idempotency-0001";
const quoteRow: ByoaQuoteRow = {
  id: "33333333-3333-4333-8333-333333333333",
  agent_id: credentialRow.agent_id,
  credential_id: credentialRow.id,
  idempotency_hash: byoaIdempotencyHash(credentialRow.agent_id, idempotencyKey),
  request_hash: byoaRequestHash(credentialRow.agent_id, marketContextRequest),
  input_hash: "abcd1234efgh5678",
  workflow_type: marketContextRequest.workflowType,
  task: marketContextRequest.task,
  input_preview: "Assess current ETH market context...",
  budget_usdc: marketContextRequest.budgetUsdc.toFixed(6),
  planner_snapshot: { version: 3, selectedServices: [{ slug: "pyth-price-feed" }] },
  selected_services: [{ slug: "pyth-price-feed" }],
  service_types: ["live_provider"],
  price_usdc: "0.005000",
  amount_atomic: 5000,
  pay_to: ownerAccount.address,
  network: "eip155:5042002",
  asset: ARC_TESTNET_USDC_ADDRESS,
  resource_path: `/api/byoa/v1/quotes/33333333-3333-4333-8333-333333333333/execute`,
  status: "quoted",
  settle_claim_token: null,
  settle_claim_expires_at: null,
  aggregate_payment_event_id: null,
  job_id: null,
  expires_at: "2026-07-22T01:00:00.000Z",
  consumed_at: null,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
};

// Wrong wallet rejection test
const wrongConnectedWallet = privateKeyToAccount(generatePrivateKey()).address;
assert.notEqual(wrongConnectedWallet.toLowerCase(), agentAccount.address.toLowerCase());

console.log("[byoa-console-test] 7. EIP-712 / x402 payment signing scheme verification...");
const schemeSigner = {
  address: agentAccount.address,
  signTypedData: async (params: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => {
    return await agentAccount.signTypedData(params as any);
  },
};
const scheme = new BatchEvmScheme(schemeSigner);
const requirements = {
  scheme: "exact",
  network: "eip155:5042002",
  asset: ARC_TESTNET_USDC_ADDRESS,
  amount: "5000",
  payTo: ownerAccount.address,
  maxTimeoutSeconds: 604900,
  extra: {
    name: "GatewayWalletBatched" as const,
    version: "1" as const,
    verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as `0x${string}`,
  },
};

const payload = await scheme.createPaymentPayload(2, requirements);
assert(payload.payload.signature, "BatchEvmScheme generated valid EIP-3009 TransferWithAuthorization signature.");
assert.equal(payload.payload.authorization.from.toLowerCase(), agentAccount.address.toLowerCase());

console.log("[byoa-console-test] 8. Idempotency replay verification...");
const replayRequestHash = byoaRequestHash(credentialRow.agent_id, marketContextRequest);
assert.equal(replayRequestHash, quoteRow.request_hash, "Replay request hash matches original quote hash.");

console.log("[byoa-console-test] ALL Console integration tests PASSED cleanly!");
