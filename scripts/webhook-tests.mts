import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTrustAlertDrafts,
  buildTrustDelta,
  buildTrustWebhookPayload,
} from "../lib/monitoring/alerts.ts";
import {
  signWebhookPayload,
  validateWebhookEndpoint,
  webhookDeliveryDecision,
} from "../lib/monitoring/webhooks.ts";
import {
  createWebhookSecret,
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "../lib/monitoring/webhook-secret.ts";
import { normalizeCredentialScopes } from "../lib/byoa/auth.ts";
import type {
  TrustMonitoringSnapshotRow,
  TrustProfileRow,
} from "../lib/monitoring/types.ts";

process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "test-only-webhook-encryption-key";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function snapshot(input: {
  id: string;
  sequence: number;
  score: number;
  status?: string;
  verification?: string;
  changes?: Array<Record<string, unknown>>;
}) {
  return {
    id: input.id,
    public_id: `tms_${input.id.padEnd(20, "0").slice(0, 20)}`,
    watchlist_id: "watchlist",
    recheck_id: "recheck",
    job_id: "job",
    sequence_number: input.sequence,
    trust_score: input.score,
    trust_status: input.status ?? "review_recommended",
    report_hash: `0x${"1".repeat(64)}`,
    verification_status: input.verification ?? "verified",
    proof_transaction_hash: `0x${"2".repeat(64)}`,
    report_snapshot: {
      subject: { name: "Example" },
      codeIntelligence: { status: "available" },
      identity: { status: "found" },
      endpointAvailability: { status: "available" },
      services: { status: "available" },
      contractTransparency: { status: "available" },
    },
    delta_snapshot: {
      kind: "trust_delta_report",
      version: 1,
      previousSnapshotId: input.sequence > 1 ? "tms_previous0000000000" : null,
      currentSnapshotId: `tms_${input.id.padEnd(20, "0").slice(0, 20)}`,
      score: {
        before: input.sequence > 1 ? input.score + 3 : null,
        after: input.score,
        change: input.sequence > 1 ? -3 : null,
        direction: input.sequence > 1 ? "declined" : "unavailable",
      },
      summary: {
        newRisks: 0,
        improvements: 0,
        statusChanges: 0,
        activityChanges: 0,
        totalChanges: input.changes?.length ?? 0,
      },
      changes: input.changes ?? [],
      generatedAt: "2026-07-30T17:30:00.000Z",
    },
    observed_at: "2026-07-30T17:30:00.000Z",
    created_at: "2026-07-30T17:30:00.000Z",
  } as unknown as TrustMonitoringSnapshotRow;
}

const previous = snapshot({ id: "prev", sequence: 1, score: 76 });
const identical = snapshot({ id: "same", sequence: 2, score: 76, changes: [] });
identical.delta_snapshot.score = {
  before: 76,
  after: 76,
  change: 0,
  direction: "unchanged",
};
assert.equal(buildTrustDelta(previous, identical).meaningful, false);
assert.equal(buildTrustAlertDrafts(previous, identical).length, 0);

const belowThreshold = snapshot({ id: "small", sequence: 2, score: 74 });
assert.equal(buildTrustAlertDrafts(previous, belowThreshold).some((event) => event.type === "trust_score_changed"), false);

const threshold = snapshot({ id: "large", sequence: 2, score: 73 });
const thresholdEvents = buildTrustAlertDrafts(previous, threshold);
assert.equal(thresholdEvents.filter((event) => event.type === "trust_score_changed").length, 1);
assert.deepEqual(
  thresholdEvents.find((event) => event.type === "trust_score_changed")?.change,
  { previous: 76, current: 73, delta: -3 },
);
assert.deepEqual(
  buildTrustAlertDrafts(previous, threshold).map((event) => event.fingerprint),
  thresholdEvents.map((event) => event.fingerprint),
  "Repeated snapshot processing must produce identical fingerprints.",
);

const risks = snapshot({
  id: "risks",
  sequence: 2,
  score: 76,
  changes: [
    {
      code: "new_risk_missing_open_source_license",
      kind: "new_risk",
      severity: "medium",
      category: "code",
      title: "Missing Open Source License",
      summary: "Missing.",
      before: null,
      after: "Missing.",
    },
    {
      code: "resolved_risk_single_contributor_concentration",
      kind: "improved",
      severity: "medium",
      category: "code",
      title: "Single Contributor Concentration resolved",
      summary: "Resolved.",
      before: "Risk",
      after: null,
    },
  ],
});
const riskDelta = buildTrustDelta(previous, risks);
assert.equal(riskDelta.addedRisks[0]?.riskCode, "missing_open_source_license");
assert.equal(riskDelta.resolvedRisks[0]?.riskCode, "single_contributor_concentration");
assert.equal(buildTrustAlertDrafts(previous, risks).filter((event) => event.type === "risk_added").length, 1);
assert.equal(buildTrustAlertDrafts(previous, risks).filter((event) => event.type === "risk_resolved").length, 1);

const verificationFailed = snapshot({
  id: "verifyfail",
  sequence: 2,
  score: 76,
  verification: "verification_failed",
});
verificationFailed.delta_snapshot.score = identical.delta_snapshot.score;
assert.deepEqual(
  buildTrustAlertDrafts(previous, verificationFailed).map((event) => event.type),
  ["verification_failed"],
);

const profile = {
  id: "internal-profile-uuid",
  public_id: "vtr_1234567890abcdef1234",
  subject_type: "github_repository",
  display_name: "owner/repository",
} as TrustProfileRow;
const payload = buildTrustWebhookPayload({
  eventId: "evt_1234567890abcdef12345678",
  type: "risk_added",
  createdAt: "2026-07-30T17:30:00.000Z",
  profile,
  report: risks.report_snapshot,
  snapshot: risks,
  change: { risk: riskDelta.addedRisks[0] },
});
const serializedPayload = JSON.stringify(payload);
for (const forbidden of [
  "ownerWallet",
  "agentWallet",
  "credentialId",
  "credentialSecret",
  "quoteId",
  "paymentId",
  "jobId",
  "cronSecret",
  "stack",
]) {
  assert(!serializedPayload.includes(forbidden), `Webhook payload leaked ${forbidden}.`);
}
assert(serializedPayload.includes("vtr_1234567890abcdef1234"));
assert(serializedPayload.includes("tms_risks000000000000000"));

const secret = "vwhsec_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO";
const rawBody = JSON.stringify({ id: "evt_test", value: 1 });
const timestamp = 1_785_432_600;
const signature = signWebhookPayload(secret, timestamp, rawBody);
assert.equal(
  signature,
  createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"),
);
assert.notEqual(
  signWebhookPayload(secret, timestamp, `${rawBody} `),
  signature,
  "Changing one payload byte must invalidate the signature.",
);

const generatedSecret = createWebhookSecret();
assert(generatedSecret.startsWith("vwhsec_"));
assert.equal(decryptWebhookSecret(encryptWebhookSecret(generatedSecret)), generatedSecret);

for (const endpoint of [
  "http://example.com/webhook",
  "https://localhost/webhook",
  "https://127.0.0.1/webhook",
  "https://169.254.169.254/latest",
  "https://user:password@example.com/webhook",
]) {
  await assert.rejects(() => validateWebhookEndpoint(endpoint));
}

assert.equal(webhookDeliveryDecision({ attempt: 1, httpStatus: 200 }), "delivered");
assert.equal(webhookDeliveryDecision({ attempt: 1, httpStatus: 299 }), "delivered");
assert.equal(webhookDeliveryDecision({ attempt: 1, httpStatus: 500 }), "retry_scheduled");
assert.equal(webhookDeliveryDecision({ attempt: 1, failed: true }), "retry_scheduled");
assert.equal(webhookDeliveryDecision({ attempt: 6, failed: true }), "failed");

assert.deepEqual(
  normalizeCredentialScopes(
    ["workflows:read", "quotes:create", "runs:create", "results:read"],
    "machine_api",
  ),
  ["workflows:read", "quotes:create", "runs:create", "results:read"],
);
assert.deepEqual(
  normalizeCredentialScopes(
    [
      "workflows:read",
      "quotes:create",
      "runs:create",
      "results:read",
      "alerts:read",
      "webhooks:write",
    ],
    "machine_api",
  ),
  [
    "workflows:read",
    "quotes:create",
    "runs:create",
    "results:read",
    "alerts:read",
    "webhooks:write",
  ],
);
assert.throws(() =>
  normalizeCredentialScopes(["alerts:read", "webhooks:write"], "machine_api"),
);

const migration = read("supabase/migrations/20260730235000_p32_trust_alerts_webhooks.sql");
for (const required of [
  "create table if not exists public.trust_alert_events",
  "create table if not exists public.trust_alert_states",
  "create table if not exists public.webhook_subscriptions",
  "create table if not exists public.webhook_events",
  "create table if not exists public.webhook_deliveries",
  "unique (profile_id, snapshot_id, event_type, event_fingerprint)",
  "unique (profile_id, event_type, event_fingerprint)",
  "claim_due_webhook_deliveries_v1",
  "alter table public.webhook_deliveries enable row level security",
  "revoke all on table public.webhook_deliveries from anon, authenticated",
]) {
  assert(migration.includes(required), `Migration is missing: ${required}`);
}

const webhookSource = read("lib/monitoring/webhooks.ts");
for (const required of [
  "maxTimeoutMs: 8_000",
  "maxResponseSizeBytes: 4_096",
  "fetchWithSsrfProtection",
  "-Webhooks/1.0",
  "previous_secret_expires_at",
]) {
  assert(webhookSource.includes(required), `Webhook worker is missing: ${required}`);
}

const publicPage = read("app/trust/[publicId]/page.tsx");
assert(!/webhook_subscriptions|endpointDomain|delivery failures/i.test(publicPage));

console.log(
  "[webhooks-test] passed: deterministic alerts, score threshold, stable risk codes, HMAC tamper detection, encrypted one-time secrets, SSRF blocks, bounded retries, opt-in scopes, safe payloads, migration/RLS, and public-profile isolation",
);
