import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getByoaClient } from "@/lib/byoa/service";
import { BRAND } from "@/lib/brand";
import {
  createWebhookSecret,
  encryptWebhookSecret,
} from "@/lib/monitoring/webhook-secret";
import { deliverDueWebhooks } from "@/lib/monitoring/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const client = getByoaClient();
  const baseUrl = new URL(request.url).origin;
  const publicWatch = await client
    .from("trust_watchlists")
    .select("owner_wallet,profile_id")
    .eq("visibility", "public")
    .not("last_snapshot_id", "is", null)
    .order("last_recheck_at", { ascending: false })
    .limit(1)
    .single();
  if (!publicWatch.data) {
    return NextResponse.json(
      { error: "No public profile is available for the smoke." },
      { status: 503 },
    );
  }
  const watch = publicWatch.data;

  const subscriptionIds: string[] = [];
  const eventIds: string[] = [];
  try {
    async function createDelivery(mode: "success" | "retry") {
      const subscription = await client
        .from("webhook_subscriptions")
        .insert({
          owner_wallet: watch.owner_wallet,
          name: `Production ${mode} smoke`,
          endpoint_url: `${baseUrl}/api/public/webhook-smoke/${mode}`,
          endpoint_domain: new URL(baseUrl).hostname,
          profile_ids: [watch.profile_id],
          event_types: ["risk_added"],
          secret_ciphertext: encryptWebhookSecret(createWebhookSecret()),
        })
        .select("id")
        .single();
      if (!subscription.data) throw new Error("subscription_insert_failed");
      subscriptionIds.push(subscription.data.id as string);

      const publicEventId = `evt_test_${randomBytes(12).toString("hex")}`;
      const createdAt = new Date().toISOString();
      const event = await client
        .from("webhook_events")
        .insert({
          public_id: publicEventId,
          owner_wallet: watch.owner_wallet,
          event_type: "test",
          payload: {
            id: publicEventId,
            type: "test",
            createdAt,
            apiVersion: "2026-07-30",
            data: { message: `${BRAND.name} webhook connection verified.` },
          },
          created_at: createdAt,
        })
        .select("id")
        .single();
      if (!event.data) throw new Error("event_insert_failed");
      eventIds.push(event.data.id as string);

      const delivery = await client
        .from("webhook_deliveries")
        .insert({
          owner_wallet: watch.owner_wallet,
          subscription_id: subscription.data.id,
          event_id: event.data.id,
          status: "pending",
          next_attempt_at: createdAt,
        })
        .select("id")
        .single();
      if (!delivery.data) throw new Error("delivery_insert_failed");
      return delivery.data.id as string;
    }

    const successId = await createDelivery("success");
    const retryId = await createDelivery("retry");
    await deliverDueWebhooks(10);
    const deliveries = await client
      .from("webhook_deliveries")
      .select("id,status,attempt_count,http_status,next_attempt_at")
      .in("id", [successId, retryId]);
    const success = deliveries.data?.find((row) => row.id === successId);
    const retry = deliveries.data?.find((row) => row.id === retryId);
    const result = {
      success: {
        delivered:
          success?.status === "delivered" &&
          success.http_status === 204 &&
          success.attempt_count === 1,
        status: success?.status ?? null,
        httpStatus: success?.http_status ?? null,
        attemptCount: success?.attempt_count ?? null,
      },
      retry: {
        scheduled:
          retry?.status === "retry_scheduled" &&
          retry.http_status === 503 &&
          retry.attempt_count === 1 &&
          Date.parse(retry.next_attempt_at) > Date.now(),
        status: retry?.status ?? null,
        httpStatus: retry?.http_status ?? null,
        attemptCount: retry?.attempt_count ?? null,
      },
    };
    return NextResponse.json(result, {
      status: result.success.delivered && result.retry.scheduled ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Webhook production smoke failed safely." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (subscriptionIds.length) {
      await client.from("webhook_subscriptions").delete().in("id", subscriptionIds);
    }
    if (eventIds.length) {
      await client.from("webhook_events").delete().in("id", eventIds);
    }
  }
}
