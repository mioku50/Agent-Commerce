import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";
import {
  createWebhookSecret,
  encryptWebhookSecret,
} from "../lib/monitoring/webhook-secret.ts";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const baseUrl = (argument("--confirm-production") ?? "").replace(/\/+$/, "");
assert(
  /^https:\/\/[^/]+$/.test(baseUrl),
  "Use --confirm-production https://YOUR_PRODUCTION_HOST",
);
const config = tryGetServerSupabaseConfig();
assert(config, "Production Supabase service configuration is required.");
const cronSecret = process.env.CRON_SECRET?.trim();
assert(cronSecret, "CRON_SECRET is required for the production delivery smoke.");
const client = createClient(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function json(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const body = await response.text();
  return { response, body, json: body ? JSON.parse(body) as Record<string, unknown> : {} };
}

console.log("[p33-smoke] Resolving a public profile with a canonical snapshot...");
const publicWatch = await client
  .from("trust_watchlists")
  .select("owner_wallet,profile_id,trust_profiles!inner(public_id)")
  .eq("visibility", "public")
  .not("last_snapshot_id", "is", null)
  .order("last_recheck_at", { ascending: false })
  .limit(1)
  .single();
assert(!publicWatch.error && publicWatch.data, `Public profile lookup failed: ${publicWatch.error?.message}`);
const profile = publicWatch.data.trust_profiles as unknown as { public_id: string };
const profileId = profile.public_id;
const profileInternalId = publicWatch.data.profile_id as string;
const ownerWallet = publicWatch.data.owner_wallet as string;

const status = await json(`/api/public/trust/${profileId}/status`);
assert.equal(status.response.status, 200);
assert.deepEqual(
  Object.keys(status.json).sort(),
  ["lastCheckedAt", "profileId", "profileUrl", "score", "status", "verifiedOnArc"].sort(),
);
assert.equal(status.json.profileId, profileId);
assert(!/(owner|credential|quote|payment|job|cron)/i.test(JSON.stringify(status.json)));
const statusEtag = status.response.headers.get("etag");
assert(statusEtag, "Public status ETag is missing.");
const notModified = await fetch(`${baseUrl}/api/public/trust/${profileId}/status`, {
  headers: { "If-None-Match": statusEtag },
});
assert.equal(notModified.status, 304);

for (const variant of ["score", "status", "arc"]) {
  const badge = await fetch(
    `${baseUrl}/api/trust/${profileId}/badge.svg?variant=${variant}`,
  );
  const svg = await badge.text();
  assert.equal(badge.status, 200);
  assert.match(badge.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  assert(svg.startsWith("<svg"));
  assert(svg.includes("Veyra"));
  assert(svg.includes("checked"));
  assert(badge.headers.get("etag"));
}
console.log(`  ✓ Public status and three server SVG variants passed for ${profileId}.`);

const marker = randomUUID();
const unknownId = `vtr_${digest(`${marker}:unknown`).slice(0, 20)}`;
const privateProfileId = `vtr_${digest(`${marker}:private`).slice(0, 20)}`;
const privateWatchId = `wtl_${digest(`${marker}:watch`).slice(0, 20)}`;
const privateCanonicalKey = `github:p33-smoke/${digest(marker).slice(0, 12)}`;
let privateInternalId: string | null = null;
let privateWatchInternalId: string | null = null;
const subscriptionIds: string[] = [];
const eventIds: string[] = [];

try {
  const insertedProfile = await client
    .from("trust_profiles")
    .insert({
      public_id: privateProfileId,
      canonical_subject_key: privateCanonicalKey,
      subject_type: "github_repository",
      canonical_subject_input: { repositoryUrl: "https://github.com/openai/openai-node" },
      display_name: "P3.3 private smoke",
    })
    .select("id")
    .single();
  assert(insertedProfile.data, insertedProfile.error?.message);
  privateInternalId = insertedProfile.data.id;
  const insertedWatch = await client
    .from("trust_watchlists")
    .insert({
      public_id: privateWatchId,
      owner_wallet: ownerWallet,
      label: "P3.3 private smoke",
      subject_hash: digest(`${marker}:subject`),
      subject_input: { repositoryUrl: "https://github.com/openai/openai-node" },
      profile_id: privateInternalId,
      visibility: "private",
      cadence: "manual",
      status: "active",
    })
    .select("id")
    .single();
  assert(insertedWatch.data, insertedWatch.error?.message);
  privateWatchInternalId = insertedWatch.data.id;

  for (const path of [
    `/api/public/trust/${privateProfileId}/status`,
    `/api/public/trust/${unknownId}/status`,
    `/api/trust/${privateProfileId}/badge.svg`,
    `/api/trust/${unknownId}/badge.svg`,
  ]) {
    const result = await json(path);
    assert.equal(result.response.status, 404, `${path} did not fail closed.`);
    assert.equal(
      (result.json.error as { message?: string })?.message,
      "Trust profile not found.",
    );
  }
  console.log("  ✓ Private and unknown status/badge routes return the same 404.");

  async function createDelivery(mode: "success" | "retry") {
    const secret = createWebhookSecret();
    const subscription = await client
      .from("webhook_subscriptions")
      .insert({
        owner_wallet: ownerWallet,
        name: `P3.3 ${mode} smoke`,
        endpoint_url: `${baseUrl}/api/public/webhook-smoke/${mode}`,
        endpoint_domain: new URL(baseUrl).hostname,
        profile_ids: [profileInternalId],
        event_types: ["risk_added"],
        secret_ciphertext: encryptWebhookSecret(secret),
      })
      .select("id")
      .single();
    assert(subscription.data, subscription.error?.message);
    subscriptionIds.push(subscription.data.id);
    const publicEventId = `evt_test_${randomBytes(12).toString("hex")}`;
    const createdAt = new Date().toISOString();
    const event = await client
      .from("webhook_events")
      .insert({
        public_id: publicEventId,
        owner_wallet: ownerWallet,
        event_type: "test",
        payload: {
          id: publicEventId,
          type: "test",
          createdAt,
          apiVersion: "2026-07-30",
          data: { message: "Veyra webhook connection verified." },
        },
        created_at: createdAt,
      })
      .select("id")
      .single();
    assert(event.data, event.error?.message);
    eventIds.push(event.data.id);
    const delivery = await client
      .from("webhook_deliveries")
      .insert({
        owner_wallet: ownerWallet,
        subscription_id: subscription.data.id,
        event_id: event.data.id,
        status: "pending",
        next_attempt_at: createdAt,
      })
      .select("id")
      .single();
    assert(delivery.data, delivery.error?.message);
    return delivery.data.id as string;
  }

  const successDeliveryId = await createDelivery("success");
  const retryDeliveryId = await createDelivery("retry");
  const worker = await fetch(`${baseUrl}/api/internal/webhooks/deliver`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  assert.equal(worker.status, 200, `Delivery worker returned ${worker.status}.`);

  const deliveries = await client
    .from("webhook_deliveries")
    .select("id,status,attempt_count,http_status,next_attempt_at,error_category")
    .in("id", [successDeliveryId, retryDeliveryId]);
  assert(!deliveries.error, deliveries.error?.message);
  const success = deliveries.data?.find((row) => row.id === successDeliveryId);
  const retry = deliveries.data?.find((row) => row.id === retryDeliveryId);
  assert.equal(success?.status, "delivered");
  assert.equal(success?.http_status, 204);
  assert.equal(success?.attempt_count, 1);
  assert.equal(retry?.status, "retry_scheduled");
  assert.equal(retry?.http_status, 503);
  assert.equal(retry?.attempt_count, 1);
  assert(Date.parse(retry?.next_attempt_at ?? "") > Date.now());
  console.log("  ✓ Real signed HTTPS delivery and controlled HTTP 503 retry passed.");
} finally {
  if (subscriptionIds.length) {
    await client.from("webhook_subscriptions").delete().in("id", subscriptionIds);
  }
  if (eventIds.length) {
    await client.from("webhook_events").delete().in("id", eventIds);
  }
  if (privateWatchInternalId) {
    await client.from("trust_watchlists").delete().eq("id", privateWatchInternalId);
  }
  if (privateInternalId) {
    await client.from("trust_profiles").delete().eq("id", privateInternalId);
  }
}

console.log("[p33-smoke] All production checks PASSED.");
