import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  claimAndLaunchScheduledTrustRecheck,
  executeTrustMonitoringJob,
} from "@/lib/monitoring/service";
import {
  claimAndLaunchScheduledProject360Recheck,
  executeProject360MonitorJob,
} from "@/lib/project-360/monitoring-service";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const MAX_RECHECKS_PER_TICK = 3;

type ScheduledLaunch =
  | {
      kind: "trust";
      jobId: string;
      recheckId: string;
      subjectId: string;
      reportInput: Parameters<typeof executeTrustMonitoringJob>[0]["reportInput"];
    }
  | {
      kind: "project_360";
      jobId: string;
      recheckId: string;
      subjectId: string;
    };

async function claimScheduled(kind: ScheduledLaunch["kind"]): Promise<ScheduledLaunch | null> {
  if (kind === "project_360") {
    const launched = await claimAndLaunchScheduledProject360Recheck();
    return launched ? {
      kind,
      jobId: launched.jobId,
      recheckId: launched.recheck.public_id,
      subjectId: launched.monitor.public_id,
    } : null;
  }
  const launched = await claimAndLaunchScheduledTrustRecheck();
  return launched ? {
    kind,
    jobId: launched.jobId,
    recheckId: launched.recheck.public_id,
    subjectId: launched.watchlist.public_id,
    reportInput: launched.watchlist.subject_input,
  } : null;
}

async function claimNext(preferred: ScheduledLaunch["kind"]) {
  return (await claimScheduled(preferred)) ??
    claimScheduled(preferred === "trust" ? "project_360" : "trust");
}

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
    const firstKind: ScheduledLaunch["kind"] =
      Math.floor(Date.now() / 60_000) % 2 === 0 ? "trust" : "project_360";
    const launched = await claimNext(firstKind);
    if (!launched) {
      return NextResponse.json(
        { ok: true, launched: false, reason: "no_due_monitors" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    after(async () => {
      let current = launched;
      for (let index = 0; index < MAX_RECHECKS_PER_TICK; index += 1) {
        try {
          if (current.kind === "trust") {
            await executeTrustMonitoringJob({
              jobId: current.jobId,
              reportInput: current.reportInput,
            });
          } else {
            await executeProject360MonitorJob(current.jobId);
          }
        } catch (error) {
          console.error("[monitoring-cron] Scheduled recheck failed.", {
            jobId: current.jobId,
            error: error instanceof Error ? error.message : "unknown_error",
          });
        }
        if (index === MAX_RECHECKS_PER_TICK - 1) break;
        try {
          const next = await claimNext(
            current.kind === "trust" ? "project_360" : "trust",
          );
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
        kind: launched.kind,
        subjectId: launched.subjectId,
        recheckId: launched.recheckId,
        jobId: launched.jobId,
        maxRechecksThisTick: MAX_RECHECKS_PER_TICK,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
