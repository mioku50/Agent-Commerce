import { NextResponse, type NextRequest } from "next/server";
import { trustDecisionsCache } from "../../store";

export async function GET(request: NextRequest, context: { params: Promise<{ decisionId: string }> }) {
  try {
    const { decisionId } = await context.params;
    const decision = trustDecisionsCache.get(decisionId);

    if (!decision) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }

    return NextResponse.json(decision);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
