import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
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
