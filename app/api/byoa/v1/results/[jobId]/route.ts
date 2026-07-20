import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, requireAgentCredential } from "@/lib/byoa/http";
import { getByoaResult } from "@/lib/byoa/result";

type Context = { params: Promise<{ jobId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const auth = await requireAgentCredential(request, "results:read");
    const { jobId } = await params;
    return NextResponse.json(await getByoaResult(auth, jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
