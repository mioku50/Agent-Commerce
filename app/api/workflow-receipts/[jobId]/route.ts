import { NextResponse } from "next/server";
import { getHostedAgentJobView } from "@/lib/agent/hosted-jobs";
import { safeHostedError } from "@/lib/agent/hosted-policy";

type RouteContext = { params: Promise<{ jobId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  const { jobId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid workflow receipt ID." }, { status: 400 });
  }
  try {
    const view = await getHostedAgentJobView(jobId);
    if (!view) return NextResponse.json({ error: "Workflow receipt not found." }, { status: 404 });
    return NextResponse.json({
      workflowReceipt: {
        id: view.job.id,
        status: view.job.status,
        workflowType: view.job.workflowType,
        requesterWallet: view.job.requesterWallet,
        userPayment: view.userPayment,
        providerCostUsdc: view.job.spentUsdc,
        downstreamReceipts: view.services
          .filter((service) => service.receiptId)
          .map((service) => ({
            receiptId: service.receiptId,
            serviceSlug: service.serviceSlug,
            serviceName: service.serviceName,
            amountUsdc: service.priceUsdc,
            href: `/receipts/${service.receiptId}`,
          })),
        proofs: view.proofs,
        finalReport: view.job.structuredResult
          ? {
              summary: view.job.structuredResult.summary,
              generatedAt: view.job.structuredResult.generatedAt,
              href: view.links.hostedRun,
            }
          : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[workflow-receipt] read failed: ${safeHostedError(error)}`);
    return NextResponse.json({ error: "Unable to load workflow receipt." }, { status: 503 });
  }
}
