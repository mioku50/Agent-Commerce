import { NextResponse } from "next/server";
import {
  getHostedWorkflowQuote,
  sponsoredWorkflowAuthorizationMessage,
  toPublicHostedWorkflowQuote,
} from "@/lib/commerce/workflow-checkout";
import { safeHostedError } from "@/lib/agent/hosted-policy";

type RouteContext = { params: Promise<{ quoteId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  const { quoteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
    return NextResponse.json({ error: "Invalid workflow quote ID." }, { status: 400 });
  }
  try {
    const row = await getHostedWorkflowQuote(quoteId);
    if (!row) return NextResponse.json({ error: "Workflow quote not found." }, { status: 404 });
    const quote = toPublicHostedWorkflowQuote(row);
    return NextResponse.json({
      quote,
      sponsoredAuthorizationMessage:
        quote.paymentMode === "sponsored"
          ? sponsoredWorkflowAuthorizationMessage(quote)
          : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[hosted-checkout] quote read failed: ${safeHostedError(error)}`);
    return NextResponse.json({ error: "Unable to load workflow quote." }, { status: 503 });
  }
}
