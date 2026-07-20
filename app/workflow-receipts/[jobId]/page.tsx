import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CreditCard, ExternalLink, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHostedAgentJobView } from "@/lib/agent/hosted-jobs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ jobId: string }> };

export default async function WorkflowReceiptPage({ params }: PageProps) {
  const { jobId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) notFound();
  const view = await getHostedAgentJobView(jobId).catch(() => null);
  if (!view) notFound();
  const payment = view.userPayment;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
          <Badge className="mb-4">Aggregate commerce record</Badge>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">Workflow Receipt</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            One user-facing workflow checkout linked to the hosted agent&apos;s internal x402 receipts and app-owned Arc proofs.
          </p>
          <p className="mt-4 break-all font-mono text-xs text-muted-foreground">{view.job.id}</p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
        <Card className="rounded-lg">
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-primary" />User → Agent Commerce</CardTitle><Badge variant={payment?.status === "credit_issued" ? "secondary" : "default"}>{payment?.status ?? view.job.paymentMode}</Badge></div></CardHeader>
          <CardContent className="grid gap-5">
            {payment ? <>
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">User payment</dt><dd className="mt-1 font-mono font-medium">{payment.grossAmountUsdc} USDC</dd></div>
                <div><dt className="text-muted-foreground">Provider cost</dt><dd className="mt-1 font-mono font-medium">{payment.providerCostUsdc} USDC</dd></div>
                <div><dt className="text-muted-foreground">Platform fee</dt><dd className="mt-1 font-mono font-medium">{payment.platformFeeUsdc} USDC</dd></div>
                <div><dt className="text-muted-foreground">Net revenue</dt><dd className="mt-1 font-mono font-medium">{payment.netRevenueUsdc} USDC</dd></div>
              </dl>
              <div className="rounded-md bg-secondary/30 p-3 text-xs"><p>Requested by</p><p className="mt-1 break-all font-mono">{payment.requesterWallet}</p></div>
              {Number(payment.creditAmountUsdc) > 0 ? <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-sm"><p className="font-medium">Workflow credit · {payment.creditAmountUsdc} USDC</p><p className="mt-1 text-muted-foreground">{payment.failureReason}</p></div> : null}
              {payment.transactionHash ? <div><p className="break-all font-mono text-xs">{payment.transactionHash}</p>{payment.transactionUrl ? <Button asChild size="sm" variant="outline" className="mt-3"><a href={payment.transactionUrl} target="_blank" rel="noreferrer">User payment transaction <ExternalLink /></a></Button> : null}</div> : <p className="text-sm text-muted-foreground">Sponsored checkout used no user USDC transaction.</p>}
            </> : <p className="text-sm text-muted-foreground">Legacy sponsored workflow; no Phase 26 checkout record exists.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />Agent Commerce → API providers</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {view.services.filter((service) => service.receiptId).map((service) => (
              <div key={service.receiptId} className="flex min-w-0 flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-medium">{service.serviceName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{service.priceUsdc} USDC · {service.serviceSlug}</p></div>
                <Button asChild size="sm" variant="outline"><Link href={`/receipts/${service.receiptId}`}>Internal x402 receipt</Link></Button>
              </div>
            ))}
            {!view.services.some((service) => service.receiptId) ? <p className="text-sm text-muted-foreground">Internal purchases have not produced receipts.</p> : null}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><BadgeCheck className="size-5 text-primary" />Verified Arc proofs</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {view.proofs.map((proof) => <div key={proof.receiptId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{proof.status === "verified" ? "Verified on Arc" : proof.status}</p><Badge variant="outline">receipt {proof.receiptId}</Badge></div>{proof.transactionHash ? <p className="mt-2 break-all font-mono text-xs">{proof.transactionHash}</p> : null}{proof.transactionUrl ? <Button asChild size="sm" className="mt-3"><a href={proof.transactionUrl} target="_blank" rel="noreferrer">Arc proof <ExternalLink /></a></Button> : null}</div>)}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2"><Button asChild><Link href={view.links.hostedRun}>Final Report</Link></Button>{view.links.agentRun ? <Button asChild variant="outline"><Link href={view.links.agentRun}>Agent Run</Link></Button> : null}</div>
      </section>
    </main>
  );
}
