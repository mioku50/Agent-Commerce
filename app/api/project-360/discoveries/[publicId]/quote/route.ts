import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { validateIdempotencyKey } from "@/lib/agent/hosted-policy";
import { sponsoredWorkflowAuthorizationMessage } from "@/lib/commerce/workflow-checkout";
import { project360ErrorResponse } from "@/lib/project-360/http";
import { createBrowserProject360Quote } from "@/lib/project-360/service";

type RouteContext = { params: Promise<{ publicId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const { publicId } = await params;
    const result = await createBrowserProject360Quote({
      ownerWallet: owner.wallet,
      publicDiscoveryId: publicId,
      discoveryRevision: body.revision,
      selectedCandidateIds: body.selectedCandidateIds,
      modules: body.modules,
      idempotencyKey: validateIdempotencyKey(
        request.headers.get("idempotency-key"),
      ),
      forwardedFor: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(
      {
        ...result,
        sponsoredAuthorizationMessage:
          result.quote.paymentMode === "sponsored"
            ? sponsoredWorkflowAuthorizationMessage(result.quote)
            : null,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
