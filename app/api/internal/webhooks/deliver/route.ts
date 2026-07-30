import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import { deliverDueWebhooks } from "@/lib/monitoring/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!actual) return false;
  const right = Buffer.from(actual);
  return [
    process.env.WEBHOOK_DELIVERY_CRON_SECRET,
    process.env.CRON_SECRET,
  ].some((expected) => {
    if (!expected) return false;
    const left = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    return NextResponse.json(await deliverDueWebhooks(25), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
