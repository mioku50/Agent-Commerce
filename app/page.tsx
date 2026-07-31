/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  FileText,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listHostedFinalReports,
  type HostedFinalReportSummary,
} from "@/lib/agent/hosted-jobs";
import {
  getHostedWorkflowTemplate,
  type HostedWorkflowType,
} from "@/lib/agent/workflow-templates";
import { hostedWorkflowHref } from "@/lib/agent/workflow-links";
import { sanitizePublicReportText } from "@/lib/agent/public-report-copy";
import { BRAND, BRAND_TITLE } from "@/lib/brand";
import { API_QUALITY_FINALIZER_PRICE_USDC } from "@/lib/services/constants";

export const metadata: Metadata = {
  title: { absolute: BRAND_TITLE },
  description: BRAND.description,
  openGraph: {
    title: BRAND_TITLE,
    description: BRAND.description,
  },
  twitter: {
    title: BRAND_TITLE,
    description: BRAND.description,
  },
};

const featuredBenefits = [
  "Live GitHub data",
  "Activity and maintainer analysis",
  "Engineering quality signals",
  "Adoption risks",
  "Shareable Arc-verified report",
] as const;

const publicWorkflows: Array<{
  type: HostedWorkflowType;
  description: string;
  benefits: readonly string[];
}> = [
  {
    type: "agent_trust_report",
    description:
      "Verify an AI agent before you use, pay, or integrate it. Review identity, code health, execution history, services, payments, contract signals, and Arc verification in one evidence-backed report.",
    benefits: ["Deterministic Trust Score", "Evidence-backed review", "Arc verification status"],
  },
  {
    type: "github_due_diligence",
    description:
      "Understand the health, activity, engineering signals, and adoption risks of a public repository.",
    benefits: ["Repository health", "Maintainer activity", "Adoption risk signals"],
  },
  {
    type: "paid_api_quality",
    description:
      "Evaluate and compare paid APIs using observed pricing, latency, availability, response validity, payment execution, and settlement history.",
    benefits: ["Quality Score (0–100)", "Uptime & P95 Latency", "Side-by-side benchmarking"],
  },
  {
    type: "market_context",
    description:
      "Receive a current market snapshot using live provider-backed asset data.",
    benefits: ["Current asset data", "Market context", "Structured evidence"],
  },
  {
    type: "sentiment_tone",
    description:
      "Analyze submitted text for sentiment, tone, and communication patterns.",
    benefits: ["Sentiment signals", "Tone patterns", "Shareable findings"],
  },
  {
    type: "builder_update",
    description:
      "Turn a changelog, shipping update, or project note into a concise structured report.",
    benefits: ["Progress summary", "Delivery signals", "Clear next steps"],
  },
];

const reportWorkflowOrder: HostedWorkflowType[] = [
  "github_due_diligence",
  "agent_trust_report",
  "paid_api_quality",
  "market_context",
  "sentiment_tone",
  "builder_update",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatStartingPrice(value: number) {
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function selectDiverseReports(reports: HostedFinalReportSummary[], limit = 4) {
  const selected: HostedFinalReportSummary[] = [];
  const selectedIds = new Set<string>();

  for (const workflowType of reportWorkflowOrder) {
    const report = reports.find((candidate) => candidate.workflowType === workflowType);
    if (!report) continue;
    selected.push(report);
    selectedIds.add(report.id);
  }

  for (const report of reports) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(report.id)) selected.push(report);
  }

  return selected.slice(0, limit);
}

async function recentReportsWithTimeout() {
  return Promise.race([
    listHostedFinalReports(20),
    new Promise<HostedFinalReportSummary[]>((resolve) => {
      setTimeout(() => resolve([]), 3_000);
    }),
  ]).catch(() => []);
}

export default async function Home() {
  await connection();
  const recentReports = await recentReportsWithTimeout();
  const reports = selectDiverseReports(recentReports);
  const featured = getHostedWorkflowTemplate("github_due_diligence");

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-20">
          <Badge className="mb-5">Arc Testnet</Badge>
          <h1 className="max-w-5xl text-4xl font-bold leading-[1.05] tracking-normal text-foreground sm:text-6xl">
            {BRAND.name}
          </h1>
          <p className="mt-5 max-w-3xl text-lg font-semibold leading-7 text-foreground sm:text-xl">
            {BRAND.tagline}
          </p>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {BRAND.description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/agent-runner">
                <Sparkles />
                Explore Workflows
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/console/agent-api">
                <Code2 />
                Developer API
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <Card className="command-card overflow-hidden rounded-lg border-primary/30">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
            <CardHeader className="p-6 sm:p-8">
              <Badge variant="secondary" className="w-fit">Featured Workflow</Badge>
              <CardTitle className="mt-2 text-3xl">GitHub Project Due Diligence</CardTitle>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Analyze a public GitHub repository and receive an evidence-backed report covering project purpose, development activity, maintainability, documentation, releases, contributor structure, and adoption risks.
              </p>
              <p className="text-sm font-semibold text-primary">
                From {formatStartingPrice(featured?.estimatedSpendUsdc ?? Number(API_QUALITY_FINALIZER_PRICE_USDC))} USDC
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {featuredBenefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex items-center border-t bg-primary/5 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <form action="/agent-runner" method="GET" className="grid w-full gap-3">
                <input type="hidden" name="workflow" value="github_due_diligence" />
                <label htmlFor="featured-repository" className="text-sm font-medium">Repository URL</label>
                <input
                  id="featured-repository"
                  type="url"
                  name="repository"
                  placeholder="https://github.com/owner/repository"
                  required
                  className="h-11 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" size="lg">
                  <Bot />
                  Analyze Repository
                </Button>
              </form>
            </CardContent>
          </div>
        </Card>
      </section>

      <section className="border-y bg-secondary/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <div className="max-w-3xl">
            <Badge variant="outline">Available Workflows</Badge>
            <h2 className="mt-3 text-3xl font-bold">Choose the report you need</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Every workflow presents its price before confirmation and produces a structured result you can share.
            </p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {publicWorkflows.map((workflow) => {
              const template = getHostedWorkflowTemplate(workflow.type);
              if (!template) return null;
              return (
                <Card key={workflow.type} className="command-card flex rounded-lg">
                  <CardContent className="flex w-full flex-col p-6">
                    {workflow.type === "agent_trust_report" ? (
                      <Badge variant="secondary" className="mb-3 w-fit">Flagship workflow</Badge>
                    ) : null}
                    <h3 className="text-xl font-semibold">{template.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{workflow.description}</p>
                    <p className="mt-4 text-sm font-semibold text-primary">
                      From {formatStartingPrice(template.estimatedSpendUsdc)} USDC
                    </p>
                    <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      {workflow.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 shrink-0 text-primary" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant="outline" className="mt-6 w-full sm:w-fit">
                      <Link href={hostedWorkflowHref(workflow.type)}>
                        {workflow.type === "agent_trust_report" ? "Check an Agent" : "Run Workflow"}
                        <ArrowRight />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <Badge variant="secondary">Built for humans and autonomous agents</Badge>
          <h2 className="mt-3 text-3xl font-bold">One platform, two ways to run</h2>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserRound className="size-5" /> Public App</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Choose a workflow, confirm the displayed price, and receive a structured shareable report.
              </p>
              <Button asChild className="w-fit"><Link href="/agent-runner">Create Report</Link></Button>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Code2 className="size-5" /> {BRAND.agentApi}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Allow external AI agents to discover workflows, create quotes, execute runs, and retrieve verified reports programmatically.
              </p>
              <Button asChild variant="outline" className="w-fit"><Link href="/console/agent-api">Open Developer API</Link></Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y bg-secondary/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <div className="max-w-3xl">
            <Badge variant="outline">How It Works</Badge>
            <h2 className="mt-3 text-3xl font-bold">From input to verified report</h2>
          </div>
          <ol className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Choose a workflow", "Provide the required input", "Confirm the final USDC price", "Receive a verified report"].map((step, index) => (
              <li key={step} className="rounded-lg border bg-background p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                <p className="mt-4 font-semibold">{step}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            Reports can include Arc verification and machine-readable evidence.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="secondary">Recent Reports</Badge>
            <h2 className="mt-3 text-3xl font-bold">Latest completed workflows</h2>
          </div>
          <Button asChild variant="outline"><Link href="/results">View all reports <ArrowRight /></Link></Button>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {reports.length ? reports.map((report) => (
            <Card key={report.id} className="rounded-lg">
              <CardContent className="grid gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="secondary">{report.workflowLabel}</Badge>
                  <Badge variant={report.completedWithWarnings ? "outline" : "default"}>
                    {report.completedWithWarnings ? "Completed with warnings" : "Completed"}
                  </Badge>
                </div>
                <h3 className="line-clamp-1 font-semibold">
                  {sanitizePublicReportText(
                    report.inputPreview || report.workflowLabel,
                  )}
                </h3>
                <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {sanitizePublicReportText(report.summary)}
                </p>
                <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                  <span>{formatDate(report.generatedAt)}</span>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={report.href}><FileText /> View Report</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )) : (
            <p className="rounded-md border p-5 text-sm text-muted-foreground md:col-span-2">
              Completed reports will appear here after real workflows finish.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
