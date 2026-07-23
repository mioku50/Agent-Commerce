/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  Bot,
  FileText,
  LayoutTemplate,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countHostedFinalReports,
  listHostedFinalReports,
} from "@/lib/agent/hosted-jobs";
import { hostedWorkflowTemplates } from "@/lib/agent/workflow-templates";
import { hostedWorkflowHref } from "@/lib/agent/workflow-links";
import { sanitizePublicReportText } from "@/lib/agent/public-report-copy";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function Home() {
  await connection();

  const [reportsResult, countResult] = await Promise.allSettled([
    listHostedFinalReports(12),
    countHostedFinalReports(),
  ]);
  const reports = reportsResult.status === "fulfilled" ? reportsResult.value : [];
  const totalReportsCount = countResult.status === "fulfilled" ? countResult.value : reports.length;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div className="min-w-0">
            <Badge className="mb-4">Verified agent workflows · Arc Testnet</Badge>
            <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-normal text-foreground sm:text-6xl">
              Create a verified agent report
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Choose a workflow, provide your input, confirm the total price, and receive a shareable report.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/agent-runner">
                  <Bot />
                  Create Report
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/results">
                  <FileText />
                  View Reports
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Reports generated", totalReportsCount.toString(), "Completed workflows"],
              [
                "Recent Reports",
                reports.length ? reports[0].workflowLabel : "None yet",
                "Latest report",
              ],
            ].map(([label, value, detail]) => (
              <Card className="command-card rounded-lg" key={label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 font-semibold text-2xl sm:text-3xl tabular-usdc text-foreground truncate">
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
                href={hostedWorkflowHref(template.value)}
                className="grid min-w-0 gap-3 rounded-md border bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{template.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {template.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {template.benefitLabel}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground md:text-right">
                  From 0.002 USDC
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
              Recent Reports
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary">{report.workflowLabel}</Badge>
                    <Badge variant={report.completedWithWarnings ? "outline" : "default"}>
                      {report.completedWithWarnings ? "Completed with warnings" : "Completed"}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">
                    {sanitizePublicReportText(report.summary)}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
                    <span>{formatDate(report.generatedAt)}</span>
                    <span className="font-semibold text-primary flex items-center gap-1">
                      View Report &rarr;
                    </span>
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
                View all reports
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6">
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Reports include Arc verification.{" "}
              <Link href="/console/audit" className="text-primary hover:underline font-semibold">
                View technical details &rarr;
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
