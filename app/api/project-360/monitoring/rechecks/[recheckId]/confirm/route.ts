import { after, NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import {
  confirmProject360MonitorQuote,
  executeProject360MonitorJob,
} from "@/lib/project-360/monitoring-service";

type RouteContext = { params: Promise<{ recheckId: string }> };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { recheckId } = await params;
    const body = await jsonBody(request);
    const confirmed = await confirmProject360MonitorQuote({
      recheckPublicId: recheckId,
      ownerWallet: owner.wallet,
      signature: typeof body.signature === "string" ? body.signature : null,
      transactionHash: typeof body.transactionHash === "string" ? body.transactionHash : null,
    });
    after(async () => {
      try {
        await executeProject360MonitorJob(confirmed.jobId);
      } catch (error) {
        console.error("[project360-monitoring] Manual recheck failed.", {
          jobId: confirmed.jobId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });
    const { canonicalInput: _canonicalInput, ...safe } = confirmed;
    return NextResponse.json({
      ...safe,
      status: "queued",
      statusUrl: `/api/hosted-agent/jobs/${confirmed.jobId}`,
      reportUrl: `/agent-runner/${confirmed.jobId}`,
    }, { status: confirmed.created ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
