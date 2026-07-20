import { NextResponse } from "next/server";
import { getSellerAnalytics } from "@/lib/seller/analytics";
import { getHostedWorkflowCheckoutAnalytics } from "@/lib/commerce/workflow-checkout";

export async function GET() {
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
