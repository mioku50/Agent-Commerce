import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Bot,
  ChartNoAxesCombined,
  ExternalLink,
  ReceiptText,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSellerAnalytics,
  type SellerAnalytics,
  type SellerAnalyticsBuyerWallet,
  type SellerAnalyticsPurchase,
  type SellerAnalyticsService,
} from "@/lib/seller/analytics";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Seller Analytics | Arc Agent Commerce",
  description: "Demo seller analytics for API Store usage and x402 revenue.",
};

function formatDate(value: string | null) {
  if (!value) return "n/a";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sourceLabel(sourceType: string) {
  if (sourceType === "static") return "Internal deterministic";
  if (sourceType === "provider_backed") return "Live Provider";
  if (sourceType === "seller_mock") return "Seller-created mock";
  return "Seller-created placeholder";
}

function proofStatusLabel(status: string | null) {
  if (status === "verified") return "Verified on Arc";
  if (status === "pending") return "Onchain proof pending";
  if (status === "failed") return "Proof failed";
  return "Proof unavailable";
}

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof BadgeDollarSign;
}) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon size={20} />
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TopServicesTable({ services }: { services: SellerAnalyticsService[] }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Store className="size-5" />
          Top services
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Skipped</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Buyers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No service usage recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.serviceId}>
                  <TableCell>
                    <div className="font-medium">{service.serviceName}</div>
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {service.endpoint}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline">{service.method}</Badge>
                      <Badge variant={service.status === "live" ? "default" : "secondary"}>
                        {service.status}
                      </Badge>
                      <Badge variant="secondary">x402 protected</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={service.sourceType === "seller_mock" ? "secondary" : "outline"}
                    >
                      {sourceLabel(service.sourceType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{service.paidCalls}</TableCell>
                  <TableCell className="font-mono">{service.skippedCalls}</TableCell>
                  <TableCell className="font-mono">{service.failedCalls}</TableCell>
                  <TableCell className="font-mono">
                    {service.estimatedUsdcRevenue} USDC
                  </TableCell>
                  <TableCell className="font-mono">
                    {service.buyerAgentWallets}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecentPurchasesTable({
  purchases,
}: {
  purchases: SellerAnalyticsPurchase[];
}) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ReceiptText className="size-5" />
          Recent paid purchases
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Buyer agent</TableHead>
              <TableHead>Request ID</TableHead>
              <TableHead>Payment event</TableHead>
              <TableHead>Onchain proof</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Run</TableHead>
              <TableHead>Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No paid purchases recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((purchase) => {
                const paymentEventId =
                  purchase.paymentEventId ?? purchase.matchedPaymentEventId;

                return (
                  <TableRow key={purchase.stepId}>
                    <TableCell className="min-w-36 text-xs text-muted-foreground">
                      {formatDate(purchase.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{purchase.serviceName}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {sourceLabel(purchase.serviceSourceType)}
                        </Badge>
                        {purchase.method ? (
                          <Badge variant="outline">{purchase.method}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {purchase.buyerWallet ? (
                        <Link
                          href={`/agents/${purchase.buyerWallet}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {shortenHash(purchase.buyerWallet, 5)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">n/a</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {purchase.requestId ? shortenHash(purchase.requestId, 6) : "n/a"}
                    </TableCell>
                    <TableCell>
                      {paymentEventId ? (
                        <Link
                          href="/dashboard"
                          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        >
                          {shortenHash(paymentEventId, 6)}
                          <ExternalLink size={12} />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">n/a</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          variant={
                            purchase.onchainProofStatus === "verified"
                              ? "default"
                              : purchase.onchainProofStatus === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {proofStatusLabel(purchase.onchainProofStatus)}
                        </Badge>
                        {purchase.onchainTransactionUrl ? (
                          <a
                            href={purchase.onchainTransactionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            {shortenHash(purchase.onchainTransactionHash ?? "", 6)}
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {purchase.priceUsdc} USDC
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/runs/${purchase.runId}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Timeline
                        <ArrowRight size={14} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/receipts/${purchase.stepId}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Receipt
                        <ReceiptText size={14} />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BuyerWalletsTable({ wallets }: { wallets: SellerAnalyticsBuyerWallet[] }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Bot className="size-5" />
          Buyer-agent wallets
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wallet</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Skipped</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Spent</TableHead>
              <TableHead>Last run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No buyer-agent wallets recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              wallets.map((wallet) => (
                <TableRow key={wallet.wallet}>
                  <TableCell>
                    <Link
                      href={`/agents/${wallet.wallet}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {shortenHash(wallet.wallet, 6)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">{wallet.paidCalls}</TableCell>
                  <TableCell className="font-mono">{wallet.skippedCalls}</TableCell>
                  <TableCell className="font-mono">{wallet.failedCalls}</TableCell>
                  <TableCell className="font-mono">
                    {wallet.estimatedUsdcSpent} USDC
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(wallet.lastRunAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SourceBreakdown({ analytics }: { analytics: SellerAnalytics }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Source type breakdown</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {analytics.sourceBreakdown.map((source) => (
          <div key={source.sourceType} className="rounded-lg border p-4">
            <Badge variant={source.sourceType === "seller_mock" ? "secondary" : "outline"}>
              {source.label}
            </Badge>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Services</dt>
                <dd className="font-mono">{source.services}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Paid calls</dt>
                <dd className="font-mono">{source.paidCalls}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Revenue</dt>
                <dd className="font-mono">{source.estimatedUsdcRevenue} USDC</dd>
              </div>
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function SellerAnalyticsContent() {
  await connection();
  const analytics = await getSellerAnalytics();

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6">
      {analytics.warning ? (
        <Card className="rounded-lg">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {analytics.warning}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Estimated revenue"
          value={`${analytics.overview.estimatedUsdcRevenue} USDC`}
          detail="From paid agent purchase steps, matched to payment events where available."
          icon={BadgeDollarSign}
        />
        <StatCard
          title="Paid calls"
          value={analytics.overview.paidCalls}
          detail={`${analytics.overview.linkedPaymentEvents} linked payment event(s).`}
          icon={ReceiptText}
        />
        <StatCard
          title="Verified Arc proofs"
          value={analytics.overview.verifiedProofs}
          detail={`${analytics.overview.pendingProofs} pending, ${analytics.overview.failedProofs} failed.`}
          icon={ReceiptText}
        />
        <StatCard
          title="Buyer agents"
          value={analytics.overview.buyerAgentWallets}
          detail="Wallets seen in agent runs and purchase steps."
          icon={Bot}
        />
        <StatCard
          title="Seller-created services"
          value={analytics.overview.sellerCreatedServices}
          detail={`${analytics.overview.liveServices} live listing(s).`}
          icon={Store}
        />
      </div>

      <SourceBreakdown analytics={analytics} />
      <TopServicesTable services={analytics.topServices} />
      <RecentPurchasesTable purchases={analytics.recentPurchases} />
      <BuyerWalletsTable wallets={analytics.buyerWallets} />
    </section>
  );
}

function SellerAnalyticsFallback() {
  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6">
      <Card className="rounded-lg">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading seller analytics...
        </CardContent>
      </Card>
    </section>
  );
}

export default function SellerAnalyticsPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Button asChild variant="ghost" className="mb-6 px-0">
              <Link href="/seller">
                <ArrowLeft />
                Back to Seller Creator
              </Link>
            </Button>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Seller Analytics</Badge>
              <Badge variant="outline">x402 revenue demo</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
              API revenue and buyer-agent usage
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              See how seller-created APIs perform across paid calls, skipped
              decisions, failed requests, buyer-agent wallets, request IDs, and
              matched payment events.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/agent-control">
                <Bot />
                Agent Control
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <ChartNoAxesCombined />
                Seller Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/receipts">
                <ReceiptText />
                Receipts
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/store">
                <Store />
                API Store
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Suspense fallback={<SellerAnalyticsFallback />}>
        <SellerAnalyticsContent />
      </Suspense>
    </main>
  );
}
