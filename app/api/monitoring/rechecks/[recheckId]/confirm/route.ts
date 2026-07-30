import { after, NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  confirmTrustMonitoringQuote,
  executeTrustMonitoringJob,
  requireOwnerWatchlist,
} from "@/lib/monitoring/service";
import { getByoaClient } from "@/lib/byoa/service";

type RouteContext = { params: Promise<{ recheckId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { recheckId } = await params;
    const body = await jsonBody(request);
    const confirmed = await confirmTrustMonitoringQuote({
      recheckPublicId: recheckId,
      ownerWallet: owner.wallet,
      signature: typeof body.signature === "string" ? body.signature : null,
      transactionHash:
        typeof body.transactionHash === "string" ? body.transactionHash : null,
    });
    const linked = await getByoaClient()
      .from("trust_monitoring_rechecks")
      .select("trust_watchlists!inner(public_id,subject_input)")
      .eq("public_id", recheckId)
      .single();
    if (linked.error || !linked.data) {
      throw new Error("Monitoring recheck input could not be loaded.");
    }
    const watchlist = (linked.data as unknown as {
      trust_watchlists: {
        public_id: string;
        subject_input: Record<string, unknown>;
      };
    }).trust_watchlists;
    await requireOwnerWatchlist(watchlist.public_id, owner.wallet);
    after(async () => {
      try {
        await executeTrustMonitoringJob({
          jobId: confirmed.jobId,
          reportInput: watchlist.subject_input,
        });
      } catch (error) {
        console.error("[trust-monitoring] Manual recheck failed.", {
          jobId: confirmed.jobId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });
    return NextResponse.json(
      {
        ...confirmed,
        status: "queued",
        statusUrl: `/api/hosted-agent/jobs/${confirmed.jobId}`,
        reportUrl: `/agent-runner/${confirmed.jobId}`,
      },
      { status: confirmed.created ? 202 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
