import { createHmac } from "node:crypto";
import { getByoaClient } from "../byoa/service.ts";
import { BRAND } from "../brand.ts";
import {
  fetchWithSsrfProtection,
  SSRFProtectionError,
  validateUrlSsrf,
  verifyDnsSsrf,
  ResponseSizeLimitExceededError,
} from "../seller/ssrf.ts";
import { TrustMonitoringError } from "./service.ts";
import {
  TRUST_ALERT_EVENT_TYPES,
  type TrustAlertEventType,
  type WebhookDeliveryRow,
  type WebhookEventRow,
  type WebhookSubscriptionRow,
} from "./types.ts";
import {
  createWebhookSecret,
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "./webhook-secret.ts";

const MAX_WEBHOOKS_PER_OWNER = 10;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const SECRET_GRACE_MS = 10 * 60_000;
const WEBHOOK_USER_AGENT = `${BRAND.name}-Webhooks/1.0`;
const WEBHOOK_TEST_MESSAGE = `${BRAND.name} webhook connection verified.`;

type WebhookTenant = {
  ownerWallet: string;
  byoaAgentId?: string;
  machineCredentialId?: string;
};

function cleanText(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") {
    throw new TrustMonitoringError(`${label} is required.`, "invalid_webhook_url");
  }
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < minimum || result.length > maximum) {
    throw new TrustMonitoringError(
      `${label} must contain ${minimum}-${maximum} characters.`,
      "invalid_webhook_url",
    );
  }
  return result;
}

function eventTypes(value: unknown): TrustAlertEventType[] {
  if (!Array.isArray(value)) {
    throw new TrustMonitoringError(
      "Select at least one supported event type.",
      "invalid_webhook_url",
    );
  }
  const result = [...new Set(value.map(String))] as TrustAlertEventType[];
  if (
    result.length === 0 ||
    result.some((type) => !TRUST_ALERT_EVENT_TYPES.includes(type))
  ) {
    throw new TrustMonitoringError(
      "Select only supported trust alert event types.",
      "invalid_webhook_url",
    );
  }
  return result;
}

export async function validateWebhookEndpoint(value: unknown) {
  const raw = cleanText(value, "Webhook endpoint", 12, 2048);
  let url: URL;
  try {
    url = validateUrlSsrf(raw, { allowLocalhost: false });
  } catch (error) {
    throw new TrustMonitoringError(
      error instanceof SSRFProtectionError && /restricted|internal|metadata/i.test(error.message)
        ? "This endpoint cannot be used. Enter a public HTTPS URL."
        : "Enter a valid public HTTPS webhook URL.",
      error instanceof SSRFProtectionError && /restricted|internal|metadata/i.test(error.message)
        ? "webhook_private_network_blocked"
        : "invalid_webhook_url",
    );
  }
  if (url.username || url.password || url.protocol !== "https:") {
    throw new TrustMonitoringError(
      "Enter a public HTTPS URL without embedded credentials.",
      "invalid_webhook_url",
    );
  }
  try {
    await verifyDnsSsrf(url.hostname, { allowLocalhost: false });
  } catch {
    throw new TrustMonitoringError(
      "This endpoint cannot be used. Enter a public HTTPS URL.",
      "webhook_private_network_blocked",
    );
  }
  return url;
}

async function resolveOwnedProfiles(
  profileIdsValue: unknown,
  tenant: WebhookTenant,
) {
  if (!Array.isArray(profileIdsValue)) {
    throw new TrustMonitoringError(
      "Select at least one Trust Profile.",
      "invalid_webhook_url",
    );
  }
  const publicIds = [...new Set(profileIdsValue.map(String))];
  if (
    publicIds.length === 0 ||
    publicIds.length > 10 ||
    publicIds.some((id) => !/^vtr_[0-9a-f]{20}$/.test(id))
  ) {
    throw new TrustMonitoringError(
      "Select between 1 and 10 valid Trust Profiles.",
      "invalid_webhook_url",
    );
  }
  const client = getByoaClient();
  let query = client
    .from("trust_watchlists")
    .select("profile_id,trust_profiles!inner(public_id)")
    .ilike("owner_wallet", tenant.ownerWallet)
    .in("trust_profiles.public_id", publicIds);
  if (tenant.machineCredentialId && tenant.byoaAgentId) {
    query = query
      .eq("byoa_agent_id", tenant.byoaAgentId)
      .eq("machine_credential_id", tenant.machineCredentialId);
  }
  const result = await query;
  const rows = result.data ?? [];
  const ownedPublicIds = new Set(
    rows.map((row) => {
      const profile = row.trust_profiles as unknown as { public_id: string };
      return profile.public_id;
    }),
  );
  if (result.error || publicIds.some((id) => !ownedPublicIds.has(id))) {
    throw new TrustMonitoringError("Webhook not found.", "webhook_not_found", 404);
  }
  return {
    internalIds: [...new Set(rows.map((row) => row.profile_id as string))],
    publicIds,
  };
}

async function publicProfileIds(ids: string[]) {
  if (!ids.length) return [];
  const result = await getByoaClient()
    .from("trust_profiles")
    .select("id,public_id")
    .in("id", ids);
  const map = new Map(
    (result.data ?? []).map((row) => [row.id as string, row.public_id as string]),
  );
  return ids.map((id) => map.get(id)).filter((id): id is string => Boolean(id));
}

async function subscriptionView(row: WebhookSubscriptionRow) {
  return {
    id: row.public_id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    endpointDomain: row.endpoint_domain,
    profileIds: await publicProfileIds(row.profile_ids),
    eventTypes: row.event_types,
    status: row.status,
    lastSuccessfulDelivery: row.last_success_at,
    lastFailedDelivery: row.last_failure_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopeSubscription<T>(query: T, tenant: WebhookTenant) {
  type Filter = {
    ilike(column: string, value: string): Filter;
    eq(column: string, value: string): Filter;
  };
  let scoped = (query as T & Filter).ilike("owner_wallet", tenant.ownerWallet);
  if (tenant.machineCredentialId && tenant.byoaAgentId) {
    scoped = scoped
      .eq("byoa_agent_id", tenant.byoaAgentId)
      .eq("machine_credential_id", tenant.machineCredentialId);
  }
  return scoped as T;
}

async function ownedSubscription(id: string, tenant: WebhookTenant) {
  if (!/^whk_[0-9a-f]{24}$/.test(id)) {
    throw new TrustMonitoringError("Webhook not found.", "webhook_not_found", 404);
  }
  let query = getByoaClient()
    .from("webhook_subscriptions")
    .select("*")
    .eq("public_id", id);
  query = scopeSubscription(query, tenant);
  const result = await query.maybeSingle();
  if (!result.data) {
    throw new TrustMonitoringError("Webhook not found.", "webhook_not_found", 404);
  }
  return result.data as WebhookSubscriptionRow;
}

export async function listWebhooks(tenant: WebhookTenant) {
  let query = getByoaClient()
    .from("webhook_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  query = scopeSubscription(query, tenant);
  const result = await query;
  if (result.error) {
    throw new TrustMonitoringError(
      "Webhooks are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  return Promise.all(
    ((result.data ?? []) as WebhookSubscriptionRow[]).map(subscriptionView),
  );
}

export async function createWebhookSubscription(
  tenant: WebhookTenant,
  input: Record<string, unknown>,
) {
  const client = getByoaClient();
  const countQuery = client
    .from("webhook_subscriptions")
    .select("id", { count: "exact", head: true })
    .ilike("owner_wallet", tenant.ownerWallet);
  const count = await countQuery;
  if ((count.count ?? 0) >= MAX_WEBHOOKS_PER_OWNER) {
    throw new TrustMonitoringError(
      "You can create up to 10 webhooks.",
      "webhook_limit_reached",
      409,
    );
  }
  const [url, profiles] = await Promise.all([
    validateWebhookEndpoint(input.endpointUrl),
    resolveOwnedProfiles(input.profileIds, tenant),
  ]);
  const secret = createWebhookSecret();
  const inserted = await client
    .from("webhook_subscriptions")
    .insert({
      owner_wallet: tenant.ownerWallet,
      name: cleanText(input.name, "Webhook name", 2, 80),
      endpoint_url: url.toString(),
      endpoint_domain: url.hostname,
      profile_ids: profiles.internalIds,
      event_types: eventTypes(input.eventTypes),
      secret_ciphertext: encryptWebhookSecret(secret),
      byoa_agent_id: tenant.byoaAgentId ?? null,
      machine_credential_id: tenant.machineCredentialId ?? null,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    throw new TrustMonitoringError(
      "Webhook could not be created.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  return {
    webhook: await subscriptionView(inserted.data as WebhookSubscriptionRow),
    secret,
    warning: "Copy this signing secret now. It will not be shown again.",
  };
}

export async function updateWebhookSubscription(
  tenant: WebhookTenant,
  id: string,
  input: Record<string, unknown>,
) {
  const existing = await ownedSubscription(id, tenant);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    patch.name = cleanText(input.name, "Webhook name", 2, 80);
  }
  if (input.endpointUrl !== undefined) {
    const url = await validateWebhookEndpoint(input.endpointUrl);
    patch.endpoint_url = url.toString();
    patch.endpoint_domain = url.hostname;
  }
  if (input.profileIds !== undefined) {
    patch.profile_ids = (
      await resolveOwnedProfiles(input.profileIds, tenant)
    ).internalIds;
  }
  if (input.eventTypes !== undefined) patch.event_types = eventTypes(input.eventTypes);
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "paused") {
      throw new TrustMonitoringError(
        "Webhook status must be active or paused.",
        "invalid_webhook_url",
      );
    }
    patch.status = input.status;
  }
  const result = await getByoaClient()
    .from("webhook_subscriptions")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (!result.data) {
    throw new TrustMonitoringError("Webhook not found.", "webhook_not_found", 404);
  }
  return subscriptionView(result.data as WebhookSubscriptionRow);
}

export async function deleteWebhookSubscription(tenant: WebhookTenant, id: string) {
  const existing = await ownedSubscription(id, tenant);
  await getByoaClient().from("webhook_subscriptions").delete().eq("id", existing.id);
  return { deleted: true };
}

export async function rotateWebhookSecret(tenant: WebhookTenant, id: string) {
  const existing = await ownedSubscription(id, tenant);
  const secret = createWebhookSecret();
  const result = await getByoaClient()
    .from("webhook_subscriptions")
    .update({
      previous_secret_ciphertext: existing.secret_ciphertext,
      previous_secret_expires_at: new Date(Date.now() + SECRET_GRACE_MS).toISOString(),
      secret_ciphertext: encryptWebhookSecret(secret),
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (!result.data) {
    throw new TrustMonitoringError("Webhook not found.", "webhook_not_found", 404);
  }
  return {
    webhook: await subscriptionView(result.data as WebhookSubscriptionRow),
    secret,
    previousSecretValidUntil: result.data.previous_secret_expires_at as string,
    warning: "Copy this signing secret now. It will not be shown again.",
  };
}

export function signWebhookPayload(secret: string, timestamp: number, rawBody: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function webhookDeliveryDecision(input: {
  attempt: number;
  httpStatus?: number | null;
  failed?: boolean;
}) {
  const delivered =
    !input.failed &&
    input.httpStatus !== null &&
    input.httpStatus !== undefined &&
    input.httpStatus >= 200 &&
    input.httpStatus < 300;
  return delivered
    ? "delivered"
    : input.attempt >= 6
      ? "failed"
      : "retry_scheduled";
}

export async function createTestWebhookEvent(tenant: WebhookTenant, id: string) {
  const subscription = await ownedSubscription(id, tenant);
  if (subscription.status !== "active") {
    throw new TrustMonitoringError(
      "This webhook is paused and is not receiving new events.",
      "webhook_subscription_paused",
      409,
    );
  }
  const client = getByoaClient();
  const eventId = `evt_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const createdAt = new Date().toISOString();
  const payload = {
    id: eventId,
    type: "test",
    createdAt,
    apiVersion: "2026-07-30",
    data: { message: WEBHOOK_TEST_MESSAGE },
  };
  const event = await client
    .from("webhook_events")
    .insert({
      public_id: eventId,
      owner_wallet: tenant.ownerWallet,
      event_type: "test",
      payload,
      created_at: createdAt,
    })
    .select("*")
    .single();
  if (!event.data) {
    throw new TrustMonitoringError(
      "Test event could not be scheduled.",
      "webhook_delivery_failed",
      503,
      true,
    );
  }
  const delivery = await client
    .from("webhook_deliveries")
    .insert({
      owner_wallet: tenant.ownerWallet,
      subscription_id: subscription.id,
      event_id: event.data.id,
      status: "pending",
      next_attempt_at: createdAt,
    })
    .select("public_id")
    .single();
  return { eventId, deliveryId: delivery.data?.public_id ?? null, scheduled: true };
}

export async function listWebhookDeliveries(
  tenant: WebhookTenant,
  subscriptionId: string,
) {
  const subscription = await ownedSubscription(subscriptionId, tenant);
  const result = await getByoaClient()
    .from("webhook_deliveries")
    .select("*,webhook_events!inner(public_id,event_type,created_at)")
    .eq("subscription_id", subscription.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) {
    throw new TrustMonitoringError(
      "Webhook deliveries are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  return (result.data ?? []).map((row) => {
    const event = row.webhook_events as unknown as {
      public_id: string;
      event_type: string;
      created_at: string;
    };
    return {
      id: row.public_id,
      eventId: event.public_id,
      eventType: event.event_type,
      eventCreatedAt: event.created_at,
      attemptNumber: row.attempt_count,
      httpStatus: row.http_status,
      durationMs: row.duration_ms,
      status: row.status,
      nextRetryAt:
        row.status === "retry_scheduled" ? row.next_attempt_at : null,
      errorCategory: row.error_category,
      deliveredAt: row.delivered_at,
    };
  });
}

function deliveryErrorCategory(error: unknown) {
  if (error instanceof ResponseSizeLimitExceededError) return "response_too_large";
  if (error instanceof SSRFProtectionError) {
    if (/redirect/i.test(error.message)) return "redirect_blocked";
    if (/restricted|private|internal|metadata|rebind/i.test(error.message)) {
      return "private_network_blocked";
    }
    if (/dns/i.test(error.message)) return "dns_failed";
  }
  const message = error instanceof Error ? error.message : "";
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/certificate|tls|ssl/i.test(message)) return "tls_failed";
  if (/connect|socket|fetch/i.test(message)) return "connection_failed";
  return "unknown";
}

async function completeDelivery(
  delivery: WebhookDeliveryRow,
  patch: {
    status: "delivered" | "retry_scheduled" | "failed";
    httpStatus?: number | null;
    durationMs: number;
    errorCategory?: string | null;
  },
) {
  const client = getByoaClient();
  const delivered = patch.status === "delivered";
  const finalFailure = patch.status === "failed";
  const delay = RETRY_DELAYS_MS[Math.max(0, delivery.attempt_count - 1)] ?? 0;
  await client
    .from("webhook_deliveries")
    .update({
      status: patch.status,
      http_status: patch.httpStatus ?? null,
      duration_ms: patch.durationMs,
      error_category: patch.errorCategory ?? null,
      delivered_at: delivered ? new Date().toISOString() : null,
      next_attempt_at:
        patch.status === "retry_scheduled"
          ? new Date(Date.now() + delay).toISOString()
          : new Date().toISOString(),
    })
    .eq("id", delivery.id)
    .eq("status", "delivering");
  await client
    .from("webhook_subscriptions")
    .update(
      delivered
        ? { last_success_at: new Date().toISOString() }
        : finalFailure
          ? { last_failure_at: new Date().toISOString() }
          : {},
    )
    .eq("id", delivery.subscription_id);
}

async function deliverOne(delivery: WebhookDeliveryRow) {
  const client = getByoaClient();
  const [subscriptionResult, eventResult] = await Promise.all([
    client
      .from("webhook_subscriptions")
      .select("*")
      .eq("id", delivery.subscription_id)
      .single(),
    client.from("webhook_events").select("*").eq("id", delivery.event_id).single(),
  ]);
  const subscription = subscriptionResult.data as WebhookSubscriptionRow | null;
  const event = eventResult.data as WebhookEventRow | null;
  const started = Date.now();
  if (!subscription || !event || subscription.status !== "active") {
    await completeDelivery(delivery, {
      status: "failed",
      durationMs: Date.now() - started,
      errorCategory: "subscription_paused",
    });
    return;
  }
  try {
    const body = JSON.stringify(event.payload);
    const timestamp = Math.floor(Date.now() / 1_000);
    const currentSecret = decryptWebhookSecret(subscription.secret_ciphertext);
    const signatures = [
      `v1=${signWebhookPayload(currentSecret, timestamp, body)}`,
    ];
    if (
      subscription.previous_secret_ciphertext &&
      subscription.previous_secret_expires_at &&
      Date.parse(subscription.previous_secret_expires_at) > Date.now()
    ) {
      signatures.push(
        `v1=${signWebhookPayload(
          decryptWebhookSecret(subscription.previous_secret_ciphertext),
          timestamp,
          body,
        )}`,
      );
    }
    const response = await fetchWithSsrfProtection(
      subscription.endpoint_url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WEBHOOK_USER_AGENT,
          "Veyra-Event-Id": event.public_id,
          "Veyra-Event-Type": event.event_type,
          "Veyra-Timestamp": String(timestamp),
          "Veyra-Signature": signatures.join(","),
        },
        body,
      },
      {
        maxTimeoutMs: 8_000,
        maxResponseSizeBytes: 4_096,
        allowedHeaders: [
          "content-type",
          "user-agent",
          "veyra-event-id",
          "veyra-event-type",
          "veyra-timestamp",
          "veyra-signature",
        ],
        label: `${BRAND.name} webhook`,
      },
    );
    const status = webhookDeliveryDecision({
      attempt: delivery.attempt_count,
      httpStatus: response.status,
    });
    await completeDelivery(delivery, {
      status,
      httpStatus: response.status,
      durationMs: Date.now() - started,
      errorCategory: status === "delivered" ? null : "response_rejected",
    });
  } catch (error) {
    await completeDelivery(delivery, {
      status: webhookDeliveryDecision({
        attempt: delivery.attempt_count,
        failed: true,
      }),
      durationMs: Date.now() - started,
      errorCategory: deliveryErrorCategory(error),
    });
  }
}

export async function deliverDueWebhooks(limit = 25) {
  const client = getByoaClient();
  const claimed = await client.rpc("claim_due_webhook_deliveries_v1", {
    p_limit: Math.max(0, Math.min(limit, 25)),
  });
  if (claimed.error) {
    throw new TrustMonitoringError(
      "Webhook delivery queue is temporarily unavailable.",
      "webhook_delivery_failed",
      503,
      true,
    );
  }
  const deliveries = (claimed.data ?? []) as WebhookDeliveryRow[];
  for (const delivery of deliveries) await deliverOne(delivery);
  return { processed: deliveries.length };
}
