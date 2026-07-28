import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getOperationsSnapshot } from "@/lib/operations/health";
import { fetchWithRetry } from "@/lib/agent/fetch-with-retry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

async function deliverAlert(snapshot: Awaited<ReturnType<typeof getOperationsSnapshot>>) {
  if (snapshot.alerts.length === 0) return { configured: false, delivered: false };
  const webhook = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) return { configured: false, delivered: false };

  const response = await fetchWithRetry(
    webhook,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "arc-agent-commerce",
        environment: process.env.VERCEL_ENV ?? "unknown",
        status: snapshot.status,
        generatedAt: snapshot.generatedAt,
        alerts: snapshot.alerts,
      }),
    },
    {
      retries: 2,
      timeoutMs: 8_000,
      initialDelayMs: 500,
      label: "operations alert webhook",
    },
  );
  if (!response.ok) {
    throw new Error(`Operations alert webhook returned HTTP ${response.status}.`);
  }
  return { configured: true, delivered: true };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const snapshot = await getOperationsSnapshot();
    if (snapshot.alerts.length > 0) {
      console.error(
        `[operations-alert] status=${snapshot.status} alerts=${JSON.stringify(snapshot.alerts)}`,
      );
    }
    const delivery = await deliverAlert(snapshot);
    return NextResponse.json(
      {
        ok: true,
        status: snapshot.status,
        alertCount: snapshot.alerts.length,
        delivery,
        generatedAt: snapshot.generatedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      `[operations-monitor] failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return NextResponse.json(
      { ok: false, error: "Operations monitor failed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
