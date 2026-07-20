import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
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

const owner = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());

process.env.BYOA_ENABLED = "true";
process.env.BYOA_PUBLIC_REGISTRATION_ENABLED = "false";
process.env.BYOA_ALLOWED_ORIGINS = "https://app.example";
process.env.BYOA_CANARY_OWNER_WALLETS = owner.address;
process.env.BYOA_CANARY_AGENT_WALLETS = agent.address;
process.env.BYOA_MANAGEMENT_SESSION_SECRET = "unit-test-owner-session-secret-000000000000";
process.env.BYOA_CREDENTIAL_PEPPER = "unit-test-credential-pepper-0000000000000";

const config = getByoaConfig();
assert.equal(config.enabled, true);
assert.equal(config.publicRegistrationEnabled, false);
assert.equal(config.chainId, 5_042_002);
assert(config.canaryOwnerWallets.has(owner.address.toLowerCase()));
assert(config.canaryAgentWallets.has(agent.address.toLowerCase()));
assert.throws(
  () => requireAllowedOrigin("https://app.example/api/byoa/management/challenges", "https://evil.example"),
  (error: unknown) => error instanceof ByoaConfigAccessError && error.status === 403 && error.reason === "origin_denied",
);

const challenge = buildByoaChallengeMessage({
  action: "bind_agent_wallet",
  origin: "https://app.example",
  wallet: agent.address,
  agentPublicId: "agt_0123456789abcdefghij",
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-07-20T00:00:00.000Z",
  expiresAt: "2026-07-20T00:05:00.000Z",
});
assert.match(challenge, /Action: bind_agent_wallet/);
assert.match(challenge, /Origin: https:\/\/app\.example/);
assert.match(challenge, /Chain ID: 5042002/);
assert.match(challenge, new RegExp(`Wallet: ${agent.address}`, "i"));
const challengeSignature = await agent.signMessage({ message: challenge });
assert(await verifyMessage({ address: agent.address, message: challenge, signature: challengeSignature }));
assert(!(await verifyMessage({ address: owner.address, message: challenge, signature: challengeSignature })));

const session = createOwnerSession(owner.address, Date.parse("2026-07-20T00:00:00.000Z"));
assert.equal(
  verifyOwnerSession(session.value, Date.parse("2026-07-20T00:01:00.000Z"))?.wallet,
  owner.address,
);
const tamperedSession = `${session.value.slice(0, -1)}${session.value.endsWith("0") ? "1" : "0"}`;
assert.equal(verifyOwnerSession(tamperedSession, Date.parse("2026-07-20T00:01:00.000Z")), null);
assert.equal(verifyOwnerSession(session.value, Date.parse("2026-07-20T02:00:00.000Z")), null);

const generated = createApiCredential("agt_0123456789abcdefghij");
assert.match(generated.token, /^aac_[0-9a-f]{8}\.agt_[a-z0-9]{20}\./);
assert.equal(hashApiCredential(generated.token), generated.hash);
assert.notEqual(generated.hash, generated.token);
assert.deepEqual(normalizeScopes(["quotes:create", "results:read", "quotes:create"]), ["quotes:create", "results:read"]);
assert.throws(() => normalizeScopes(["admin"]), /unsupported/);
assert.throws(
  () => validateByoaWorkflowRequest({ workflowType: "market_context", inputText: "short" }),
  (error: unknown) => error instanceof ByoaError && error.status === 400 && error.reason === "invalid_workflow_request",
);

const agentRow = {
  id: "11111111-1111-4111-8111-111111111111",
  public_id: "agt_0123456789abcdefghij",
  display_name: "Unit Test Agent",
  owner_wallet: owner.address,
  agent_wallet: agent.address,
  agent_wallet_status: "verified",
  status: "active",
  canary_enabled: true,
  wallet_verified_at: "2026-07-20T00:00:00.000Z",
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
} satisfies ByoaAgentRow;
const credentialRow = {
  id: "22222222-2222-4222-8222-222222222222",
  agent_id: agentRow.id,
  label: "Unit credential",
  token_prefix: generated.prefix,
  credential_hash: generated.hash,
  scopes: ["quotes:create", "workflows:execute", "results:read"],
  expires_at: "2026-08-20T00:00:00.000Z",
  rotated_from_id: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-20T00:00:00.000Z",
} satisfies ByoaCredentialRow;
const policyRow = {
  agent_id: agentRow.id,
  allowed_workflows: ["sentiment_tone"],
  allowed_service_types: ["internal_deterministic"],
  max_price_per_run_usdc: "0.005",
  daily_spend_limit_usdc: "0.01",
  max_daily_calls: 3,
  status: "active",
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
} satisfies ByoaPolicyRow;
const request = validateHostedWorkflowRequest({
  workflowType: "sentiment_tone",
  task: "Analyze this external agent input safely.",
  inputText: "This is a useful and sufficiently long external agent workflow input.",
  budgetUsdc: 0.005,
});
const idempotencyKey = "unit-test-byoa-idempotency-0001";
const quote = {
  id: "33333333-3333-4333-8333-333333333333",
  agent_id: agentRow.id,
  credential_id: credentialRow.id,
  idempotency_hash: byoaIdempotencyHash(agentRow.id, idempotencyKey),
  request_hash: byoaRequestHash(agentRow.id, request),
  input_hash: request.inputText ? (await import("../lib/agent/hosted-workflows.ts")).hashHostedWorkflowInput(request.inputText) : "",
  workflow_type: request.workflowType,
  task: request.task,
  budget_usdc: request.budgetUsdc.toFixed(6),
  status: "quoted",
} as unknown as ByoaQuoteRow;
const auth = { agent: agentRow, credential: credentialRow, policy: policyRow };
assert.equal(validateQuoteExecutionRequest({
  auth,
  quote,
  idempotencyKey,
  requestBody: request,
}).inputText, request.inputText);
assert.throws(() => validateQuoteExecutionRequest({
  auth,
  quote,
  idempotencyKey,
  requestBody: { ...request, inputText: `${request.inputText} changed` },
}), /does not match/);

const projected = safeCredential(credentialRow);
const serialized = JSON.stringify(projected);
assert(!serialized.includes(generated.token));
assert(!serialized.includes(generated.hash));
assert(!serialized.includes("credential_hash"));

console.log("[byoa-test] passed: Arc-bound signatures, one-way credentials, signed owner sessions, scopes, input-bound idempotency, and safe projections");
