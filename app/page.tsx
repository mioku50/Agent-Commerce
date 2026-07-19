/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  FileText,
  LayoutTemplate,
  ReceiptText,
  ShieldCheck,
  Store,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listHostedFinalReports } from "@/lib/agent/hosted-jobs";
import { listAgentProfiles } from "@/lib/agent/passport-persistence";
import { hostedWorkflowTemplates } from "@/lib/agent/workflow-templates";
import { fetchRecentReceipts } from "@/lib/commerce/receipts";

export default async function Home() {
  await connection();

  const [reportsResult, receiptsResult, profilesResult] = await Promise.allSettled([
    listHostedFinalReports(12),
    fetchRecentReceipts({ limit: 100 }),
    listAgentProfiles(30),
  ]);
  const reports = reportsResult.status === "fulfilled" ? reportsResult.value : [];
  const receipts = receiptsResult.status === "fulfilled" ? receiptsResult.value : [];
  const profiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
  const verifiedProofs = receipts.filter(
    (receipt) => receipt.onchainProof?.status === "verified",
  ).length;
  const spent = reports.reduce(
    (sum, report) => sum + Number(report.spentUsdc || 0),
    0,
  );

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div className="min-w-0">
            <Badge className="mb-4">Workflow-first agent commerce</Badge>
            <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-normal text-foreground sm:text-6xl">
              Real input in. Verified agent work out.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Submit real input → the hosted agent selects and purchases paid APIs
              through x402 → a Final Report is generated → receipts are created →
              proofs are verified in the app-owned registry on Arc.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/agent-runner">
                  <Bot />
                  Run Workflow
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/workflows">
                  <LayoutTemplate />
                  Browse templates
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/results">
                  <FileText />
                  View Final Reports
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Arc Testnet · project-owned payer wallet · maximum 0.005 USDC ·
              local CLI available as an advanced operator flow.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Final Reports", reports.length.toString(), "hosted workflows"],
              ["Paid calls", receipts.length.toString(), "commerce receipts"],
              ["Arc proofs", verifiedProofs.toString(), "verified on Arc"],
              ["Tracked spend", spent.toFixed(4), "USDC in reports"],
            ].map(([label, value, detail]) => (
              <Card className="command-card rounded-lg" key={label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 font-mono text-3xl font-semibold tabular-usdc text-foreground">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 xl:grid-cols-[1fr_0.9fr]">
        <Card className="command-card rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="size-5" />
                Workflow Templates
              </CardTitle>
              <Badge variant="secondary">real input</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {hostedWorkflowTemplates.slice(0, 3).map((template) => (
              <Link
                key={template.value}
                href="/agent-runner"
                className="grid min-w-0 gap-3 rounded-md border bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{template.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {template.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {template.services.map((service) => service.name).join(" + ")}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground md:text-right">
                  est. {template.estimatedSpendUsdc.toFixed(4)} USDC
                </span>
              </Link>
            ))}
            <Button asChild variant="outline">
              <Link href="/workflows">
                View all templates
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="command-card rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Recent Results
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {reports.length ? (
              reports.slice(0, 3).map((report) => (
                <Link
                  key={report.id}
                  href={report.href}
                  className="grid min-w-0 gap-3 rounded-md border bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{report.workflowLabel}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {report.spentUsdc} USDC
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{report.summary}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{report.receiptCount} receipts</span>
                    <span>{report.proofCount} Arc proofs</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                The first completed hosted workflow will appear here as a Final Report.
              </p>
            )}
            <Button asChild variant="outline">
              <Link href="/results">
                View all results
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6">
        <Card className="rounded-lg">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-5 text-primary" />
                Proof trail included
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Every successful paid call contributes to Results, Activity,
                Commerce Receipts, Agent Passports, seller analytics, and Arc Proofs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link href="/proofs"><ShieldCheck />Arc Proofs</Link></Button>
              <Button asChild variant="outline"><Link href="/receipts"><ReceiptText />Receipts</Link></Button>
              <Button asChild variant="outline"><Link href="/agents"><BadgeCheck />Passports ({profiles.length})</Link></Button>
              <Button asChild variant="outline"><Link href="/developer-tools"><Wrench />Developer Tools</Link></Button>
              <Button asChild variant="outline"><Link href="/seller"><Store />Seller</Link></Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
