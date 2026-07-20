import { NextResponse } from "next/server";
import { getSellerAnalytics } from "@/lib/seller/analytics";
import { getHostedWorkflowCheckoutAnalytics } from "@/lib/commerce/workflow-checkout";
import { requireSellerAuth } from "@/lib/seller/session";

export async function GET(request: Request) {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject;

  try {
    const [analytics, workflowCheckout] = await Promise.all([
      getSellerAnalytics(),
      getHostedWorkflowCheckoutAnalytics(),
    ]);
    return NextResponse.json({ ...analytics, workflowCheckout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
