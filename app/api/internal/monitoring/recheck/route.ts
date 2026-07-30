import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  claimAndLaunchScheduledTrustRecheck,
  executeTrustMonitoringJob,
} from "@/lib/monitoring/service";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const MAX_RECHECKS_PER_TICK = 3;

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

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const launched = await claimAndLaunchScheduledTrustRecheck();
    if (!launched) {
      return NextResponse.json(
        { ok: true, launched: false, reason: "no_due_watchlists" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    after(async () => {
      let current = launched;
      for (let index = 0; index < MAX_RECHECKS_PER_TICK; index += 1) {
        try {
          await executeTrustMonitoringJob({
            jobId: current.jobId,
            reportInput: current.watchlist.subject_input,
          });
        } catch (error) {
          console.error("[monitoring-cron] Scheduled recheck failed.", {
            jobId: current.jobId,
            error: error instanceof Error ? error.message : "unknown_error",
          });
        }
        if (index === MAX_RECHECKS_PER_TICK - 1) break;
        try {
          const next = await claimAndLaunchScheduledTrustRecheck();
          if (!next) break;
          current = next;
        } catch (error) {
          console.error("[monitoring-cron] Queue drain stopped.", {
            error: error instanceof Error ? error.message : "unknown_error",
          });
          break;
        }
      }
    });
    return NextResponse.json(
      {
        ok: true,
        launched: true,
        watchlistId: launched.watchlist.public_id,
        recheckId: launched.recheck.public_id,
        jobId: launched.jobId,
        maxRechecksThisTick: MAX_RECHECKS_PER_TICK,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
