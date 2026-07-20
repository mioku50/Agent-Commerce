import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";
import { getServerSupabaseConfig } from "../lib/supabase/server-env.ts";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const marker = `phase28-${Date.now()}-${randomBytes(4).toString("hex")}`;
const owner = privateKeyToAccount(generatePrivateKey()).address;
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const otherOwner = privateKeyToAccount(generatePrivateKey()).address;
const otherWallet = privateKeyToAccount(generatePrivateKey()).address;
const serverConfig = getServerSupabaseConfig();
const publicConfig = getPublicSupabaseConfig();
const server = createClient(serverConfig.url, serverConfig.key, { auth: { persistSession: false } });
const publicClient = createClient(publicConfig.url, publicConfig.key, { auth: { persistSession: false } });

function publicId(seed: string) {
  return `agt_${digest(seed).slice(0, 20)}`;
}

async function createAgent(input: { owner: string; wallet: string; seed: string }) {
  const inserted = await server.rpc("create_byoa_agent_v1", {
    p_public_id: publicId(`${marker}:${input.seed}`),
    p_display_name: `DB test ${input.seed}`,
    p_owner_wallet: input.owner,
    p_agent_wallet: input.wallet,
  });
  assert(!inserted.error, `Atomic agent registration failed: ${inserted.error?.message}`);
  const agentId = inserted.data?.[0]?.agent_id as string;
  assert(agentId, "Atomic agent registration returned no ID.");
  const initialized = await Promise.all([
    server.from("byoa_agent_policies").select("agent_id").eq("agent_id", agentId).maybeSingle(),
    server.from("byoa_agent_passports").select("agent_id").eq("agent_id", agentId).maybeSingle(),
  ]);
  assert(initialized.every((result) => !result.error && result.data), "Atomic registration did not initialize policy and Passport.");
  const policy = await server.from("byoa_agent_policies").update({
    allowed_workflows: ["sentiment_tone"],
    allowed_service_types: ["internal_deterministic"],
    max_price_per_run_usdc: 0.005,
    daily_spend_limit_usdc: 0.005,
    max_daily_calls: 1,
    status: "active",
  }).eq("agent_id", agentId);
  assert(!policy.error, `Policy update failed: ${policy.error?.message}`);
  const activated = await server.from("byoa_agents").update({
    agent_wallet_status: "verified",
    status: "active",
    canary_enabled: true,
    wallet_verified_at: new Date().toISOString(),
  }).eq("id", agentId);
  assert(!activated.error, `Agent activation failed: ${activated.error?.message}`);
  return agentId;
}

async function createCredential(agentId: string, scopes: string[], seed: string) {
  const inserted = await server.from("byoa_agent_credentials").insert({
    agent_id: agentId,
    label: `DB test ${seed}`,
    token_prefix: `aac_${digest(`${marker}:${seed}`).slice(0, 8)}`,
    credential_hash: digest(`${marker}:credential:${seed}`),
    scopes,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }).select("*").single();
  assert(!inserted.error, `Credential insert failed: ${inserted.error?.message}`);
  assert(!("token" in inserted.data), "Credential table persisted a plaintext token column.");
  return inserted.data.id as string;
}

const agentId = await createAgent({ owner, wallet, seed: "primary" });
const otherAgentId = await createAgent({ owner: otherOwner, wallet: otherWallet, seed: "other" });
const quoteCredentialId = await createCredential(
  agentId,
  ["quotes:create", "workflows:execute", "results:read"],
  "full",
);
const quoteOnlyCredentialId = await createCredential(agentId, ["quotes:create"], "quote-only");
const otherCredentialId = await createCredential(otherAgentId, ["workflows:execute"], "other-agent");

const challengeId = crypto.randomUUID();
const challengeMessageHash = digest(`${marker}:challenge-message`);
const challenge = await server.from("byoa_wallet_challenges").insert({
  id: challengeId,
  wallet,
  action: "bind_agent_wallet",
  origin: "https://app.example",
  chain_id: 5_042_002,
  agent_id: agentId,
  nonce_hash: digest(`${marker}:nonce`),
  message_hash: challengeMessageHash,
  expires_at: new Date(Date.now() + 300_000).toISOString(),
});
assert(!challenge.error, `Challenge insert failed: ${challenge.error?.message}`);
const firstConsume = await server.rpc("consume_byoa_wallet_challenge_v1", {
  p_challenge_id: challengeId,
  p_wallet: wallet,
  p_action: "bind_agent_wallet",
  p_origin: "https://app.example",
  p_message_hash: challengeMessageHash,
});
const replayConsume = await server.rpc("consume_byoa_wallet_challenge_v1", {
  p_challenge_id: challengeId,
  p_wallet: wallet,
  p_action: "bind_agent_wallet",
  p_origin: "https://app.example",
  p_message_hash: challengeMessageHash,
});
assert.equal(firstConsume.data, true, "First challenge consume failed.");
assert.equal(replayConsume.data, false, "Challenge replay was accepted.");

function quoteParams(seed: string) {
  return {
    p_agent_id: agentId,
    p_credential_id: quoteCredentialId,
    p_idempotency_hash: digest(`${marker}:idempotency:${seed}`),
    p_request_hash: digest(`${marker}:request:${seed}`),
    p_requester_fingerprint: digest(`${marker}:fingerprint`),
    p_workflow_type: "sentiment_tone",
    p_task: "Analyze a safe external agent database test input.",
    p_input_preview: "Safe external agent database test input.",
    p_input_hash: digest(`${marker}:input`),
    p_budget_usdc: 0.005,
    p_planner_snapshot: { version: 3, selectedServices: [{ slug: "text-analyzer" }] },
    p_selected_services: [{ slug: "text-analyzer" }],
    p_service_types: ["internal_deterministic"],
    p_price_usdc: 0.005,
    p_amount_atomic: 5000,
    p_pay_to: owner,
    p_expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
}

const [firstReservation, secondReservation] = await Promise.all([
  server.rpc("reserve_byoa_workflow_quote_v1", quoteParams("one")),
  server.rpc("reserve_byoa_workflow_quote_v1", quoteParams("two")),
]);
assert(!firstReservation.error, `First reservation RPC failed: ${firstReservation.error?.message}`);
assert(!secondReservation.error, `Second reservation RPC failed: ${secondReservation.error?.message}`);
const reservationRows = [firstReservation.data?.[0], secondReservation.data?.[0]];
const created = reservationRows.filter((row) => row?.created === true);
const denied = reservationRows.filter((row) => row?.reason === "daily_spend_exceeded" || row?.reason === "daily_calls_exceeded");
assert.equal(created.length, 1, "Concurrent allowance created more or fewer than one quote.");
assert.equal(denied.length, 1, "Concurrent allowance did not atomically deny the second quote.");
const winningSeed = firstReservation.data?.[0]?.created ? "one" : "two";
const quoteId = created[0].quote_id as string;

const replay = await server.rpc("reserve_byoa_workflow_quote_v1", quoteParams(winningSeed));
assert(!replay.error, `Idempotency replay RPC failed: ${replay.error?.message}`);
assert.equal(replay.data?.[0]?.quote_id, quoteId);
assert.equal(replay.data?.[0]?.created, false);
assert.equal(replay.data?.[0]?.reason, "idempotent");
const conflictParams = quoteParams(winningSeed);
conflictParams.p_request_hash = digest(`${marker}:changed-request`);
const conflict = await server.rpc("reserve_byoa_workflow_quote_v1", conflictParams);
assert.equal(conflict.data?.[0]?.reason, "idempotency_conflict");

const paused = await server.from("byoa_agent_policies").update({ status: "paused" }).eq("agent_id", agentId);
assert(!paused.error, `Policy pause failed: ${paused.error?.message}`);
const pausedClaim = await server.rpc("claim_byoa_quote_settlement_v1", {
  p_quote_id: quoteId,
  p_credential_id: quoteCredentialId,
});
assert.equal(pausedClaim.data?.[0]?.reason, "policy_denied", "Paused policy issued a settlement lease.");
const resumed = await server.from("byoa_agent_policies").update({ status: "active" }).eq("agent_id", agentId);
assert(!resumed.error, `Policy resume failed: ${resumed.error?.message}`);

const scopeDenied = await server.rpc("claim_byoa_quote_settlement_v1", {
  p_quote_id: quoteId,
  p_credential_id: quoteOnlyCredentialId,
});
assert.equal(scopeDenied.data?.[0]?.reason, "credential_denied", "Quote-only credential executed a workflow.");
const isolationDenied = await server.rpc("claim_byoa_quote_settlement_v1", {
  p_quote_id: quoteId,
  p_credential_id: otherCredentialId,
});
assert.equal(isolationDenied.data?.[0]?.reason, "credential_denied", "A second agent credential claimed another agent's quote.");

const rotatedHash = digest(`${marker}:credential:rotated`);
const rotated = await server.rpc("rotate_byoa_credential_v1", {
  p_owner_wallet: owner,
  p_agent_id: agentId,
  p_previous_credential_id: quoteCredentialId,
  p_label: "DB test rotated",
  p_token_prefix: `aac_${digest(`${marker}:rotated-prefix`).slice(0, 8)}`,
  p_credential_hash: rotatedHash,
  p_scopes: ["quotes:create", "workflows:execute", "results:read"],
  p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
});
assert(!rotated.error, `Atomic credential rotation failed: ${rotated.error?.message}`);
const rotatedId = rotated.data?.[0]?.credential_id as string;
assert(rotatedId, "Atomic credential rotation returned no ID.");
const [oldCredential, newCredential] = await Promise.all([
  server.from("byoa_agent_credentials").select("revoked_at").eq("id", quoteCredentialId).single(),
  server.from("byoa_agent_credentials").select("credential_hash,rotated_from_id,revoked_at").eq("id", rotatedId).single(),
]);
assert(oldCredential.data?.revoked_at, "Atomic rotation did not revoke the previous credential.");
assert.equal(newCredential.data?.credential_hash, rotatedHash);
assert.equal(newCredential.data?.rotated_from_id, quoteCredentialId);
assert.equal(newCredential.data?.revoked_at, null);

const publicRead = await publicClient.from("byoa_agents").select("id").eq("id", agentId);
assert(!publicRead.error, `Public RLS query failed unexpectedly: ${publicRead.error?.message}`);
assert.equal(publicRead.data?.length, 0, "Public client bypassed BYOA service-role-only RLS.");

await server.from("byoa_agents").update({ status: "suspended", canary_enabled: false }).in("id", [agentId, otherAgentId]);
await server.from("byoa_agent_credentials").update({ revoked_at: new Date().toISOString() }).in("agent_id", [agentId, otherAgentId]);
await server.from("byoa_policy_reservations").update({ status: "released", released_at: new Date().toISOString() }).eq("quote_id", quoteId).eq("status", "reserved");

console.log("[byoa-db-test] passed: atomic registration/credential rotation, one-time challenges, hashed credential schema, policy/scope/agent isolation, concurrent allowance, idempotency replay/conflict, and public RLS");
