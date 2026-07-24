/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, Circle, CreditCard, ExternalLink, LoaderCircle, ReceiptText, RotateCcw, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderResponseDetails } from "@/components/services/provider-response-details";
import { ServicePresentation } from "@/components/services/service-presentation";
import {
  HOSTED_REQUESTER_IDENTITY_LABEL,
  HOSTED_REQUESTER_NOT_CHARGED_COPY,
  HOSTED_REQUESTER_PAYMENT_COPY,
  hostedRequesterDisplayLine,
} from "@/lib/agent/hosted-ui";
import { sanitizePublicReportText } from "@/lib/agent/public-report-copy";
import { shortenHash } from "@/lib/utils";
import type {
  AssessmentStatus,
  DueDiligenceOverallStatus,
  GitHubDueDiligenceAssessment,
  RiskSeverity,
} from "@/lib/agent/github-due-diligence";
import type { GitHubRepositorySnapshot } from "@/lib/providers/github-types";
import type { HostedJobView } from "./types";

const DEFAULT_CONSUMER_STAGES = [
  { id: "preparing", label: "Preparing report", matches: ["queued", "planning"] },
  { id: "collecting", label: "Collecting data", matches: ["purchasing"] },
  { id: "analyzing", label: "Analyzing results", matches: ["generating_receipt"] },
  { id: "verifying", label: "Verifying result", matches: ["publishing_onchain_proof"] },
  { id: "completed", label: "Completed", matches: ["completed"] },
] as const;

const GITHUB_CONSUMER_STAGES = [
  { id: "preparing", label: "Preparing repository", matches: ["queued", "planning"] },
  { id: "collecting", label: "Collecting GitHub data", matches: ["purchasing_1"] },
  { id: "activity", label: "Checking recent activity", matches: ["purchasing_2"] },
  { id: "reviewing", label: "Reviewing documentation and releases", matches: ["purchasing_3"] },
  { id: "building", label: "Building the due diligence report", matches: ["generating_receipt"] },
  { id: "verifying", label: "Verifying the result on Arc", matches: ["publishing_onchain_proof"] },
  { id: "completed", label: "Completed", matches: ["completed"] },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function overallStatusBadge(status?: DueDiligenceOverallStatus) {
  switch (status) {
    case "healthy_signals":
      return { label: "Healthy signals", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
    case "review_needed":
      return { label: "Review recommended", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
    case "high_attention":
      return { label: "High attention", color: "bg-red-500/10 text-red-500 border-red-500/20" };
    case "limited_data":
      return { label: "Limited data", color: "bg-muted text-muted-foreground" };
    default:
      return { label: "Review recommended", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
  }
}

function riskSeverityBadge(severity: RiskSeverity) {
  switch (severity) {
    case "high":
      return { label: "High attention", color: "border-red-500/30 bg-red-500/5 text-red-400" };
    case "medium":
      return { label: "Review recommended", color: "border-amber-500/30 bg-amber-500/5 text-amber-400" };
    case "low":
    case "info":
    default:
      return { label: "Additional context", color: "border-blue-500/30 bg-blue-500/5 text-blue-400" };
  }
}

function categoryStatusBadge(status?: AssessmentStatus) {
  switch (status) {
    case "strong":
      return { label: "Strong", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
    case "moderate":
      return { label: "Moderate", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
    case "weak":
      return { label: "Weak", color: "bg-red-500/10 text-red-500 border-red-500/20" };
    case "unknown":
    default:
      return { label: "Unknown", color: "bg-muted text-muted-foreground" };
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function fallbackReasonLabel(
  value: NonNullable<
    NonNullable<HostedJobView["job"]["structuredResult"]>["synthesis"]
  >["fallbackReason"],
) {
  if (value === "not_configured") return "FreeModel is not configured";
  if (value === "unsupported_provider") return "Unsupported LLM provider configuration";
  if (value === "no_paid_api_results") return "No successful paid API response was available";
  if (value === "timeout") return "FreeModel timed out";
  if (value === "rate_limited") return "FreeModel rate limit";
  if (value === "response_too_large") return "FreeModel response exceeded the safe limit";
  if (value === "invalid_response") return "FreeModel returned an invalid response";
  if (value === "upstream_error") return "FreeModel was unavailable";
  return "Deterministic report selected";
}

export function HostedJobResult({ initialView }: { initialView: HostedJobView }) {
  const [view, setView] = useState(initialView);
  const [pollError, setPollError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (view.job.status === "failed") return;
    const allProofsFinal = view.proofs.length > 0 && view.proofs.every((proof) => proof.status !== "pending");
    if (view.job.status === "completed" && allProofsFinal) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/hosted-agent/jobs/${view.job.id}`, { cache: "no-store" });
        const data = (await response.json()) as HostedJobView & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to refresh hosted workflow.");
        if (!cancelled) {
          setView(data);
          setPollError(null);
        }
      } catch (error) {
        if (!cancelled) setPollError(error instanceof Error ? error.message : String(error));
      }
      if (!cancelled) timer = window.setTimeout(poll, 1_500);
    };
    timer = window.setTimeout(poll, 800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [view.job.id, view.job.status, view.proofs]);

  function copyShareLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeStage = view.job.progressStage;
  const isGithubWorkflow = view.job.workflowType === "github_due_diligence";
  const consumerStages = isGithubWorkflow ? GITHUB_CONSUMER_STAGES : DEFAULT_CONSUMER_STAGES;
  const currentIndex = DEFAULT_CONSUMER_STAGES.findIndex((stage) =>
    (stage.matches as readonly string[]).includes(activeStage),
  );
  const active = view.job.status === "queued" || view.job.status === "running";
  const isVerifiedOnArc =
    view.job.status === "completed" ||
    view.proofs.some((proof) => proof.status === "verified");

  const report = view.job.structuredResult;
  const reportInput = report?.input ?? {
    preview: view.job.inputPreview,
    sha256: view.job.inputSha256,
  };

  const repoRef =
    report?.repository ??
    view.job.plannerSnapshot.repository ??
    (report?.workflowData as any)?.repository;

  const snapshot: GitHubRepositorySnapshot | null =
    (report?.workflowData as any)?.snapshot ??
    (() => {
      const service = view.services.find((s) => s.serviceSlug === "github-repository-intelligence");
      const resp = service?.response as any;
      return resp?.snapshot ?? (resp && "repository" in resp ? resp : null);
    })();

  const canonicalUrl =
    repoRef?.canonicalUrl ||
    snapshot?.ref?.canonicalUrl ||
    (snapshot?.repository?.fullName
      ? `https://github.com/${snapshot.repository.fullName}`
      : null);

  const assessment: GitHubDueDiligenceAssessment | null =
    (report?.workflowData as any)?.assessment ??
    (() => {
      const service = view.services.find((s) => s.serviceSlug === "github-due-diligence-analysis");
      const resp = service?.response as any;
      return resp?.assessment ?? (resp && "overallStatus" in resp ? resp : null);
    })();

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Badge className="mb-3">
                {isGithubWorkflow ? "GitHub Project Intelligence · Arc Testnet" : "Shareable hosted result"}
              </Badge>
              <h1 className="text-3xl font-bold sm:text-4xl">
                {isGithubWorkflow
                  ? `GitHub Project Due Diligence`
                  : view.job.plannerSnapshot.workflowLabel ?? "Hosted agent workflow"}
              </h1>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                {isGithubWorkflow
                  ? repoRef?.fullName ?? snapshot?.repository?.fullName ?? view.job.inputPreview
                  : view.job.task}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={view.job.status === "failed" ? "destructive" : view.job.status === "completed" ? "default" : "secondary"}>
                {view.job.status === "completed" ? "Completed" : view.job.status}
              </Badge>
              {isGithubWorkflow && assessment ? (
                <Badge className={overallStatusBadge(assessment.overallStatus).color}>
                  {overallStatusBadge(assessment.overallStatus).label}
                </Badge>
              ) : null}
              {isVerifiedOnArc ? (
                <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                  <BadgeCheck className="size-3.5" />
                  Verified on Arc
                </Badge>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/agent-runner">
                  <RotateCcw className="size-4" />
                  New workflow
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="grid content-start gap-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Live progress</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {consumerStages.map((stageItem, index) => {
                let done = view.job.status === "completed";
                let current = false;

                if (view.job.status !== "completed" && active) {
                  if (!isGithubWorkflow) {
                    done = currentIndex >= 0 && index < currentIndex;
                    current = (stageItem.matches as readonly string[]).includes(activeStage);
                  } else {
                    const paidCount = view.services.filter((s) => s.status === "paid").length;
                    if (activeStage === "queued" || activeStage === "planning") {
                      current = index === 0;
                      done = index < 0;
                    } else if (activeStage === "purchasing") {
                      done = index < 1 + Math.min(paidCount, 2);
                      current = index === 1 + Math.min(paidCount, 2);
                    } else if (activeStage === "generating_receipt") {
                      done = index < 4;
                      current = index === 4;
                    } else if (activeStage === "publishing_onchain_proof") {
                      done = index < 5;
                      current = index === 5;
                    }
                  }
                }

                return (
                  <div key={stageItem.id} className="flex items-center gap-3 text-sm">
                    {done ? (
                      <Check className="size-5 text-primary" />
                    ) : current && active ? (
                      <LoaderCircle className="size-5 animate-spin text-primary" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground/40" />
                    )}
                    <span className={done || current ? "font-medium" : "text-muted-foreground"}>
                      {stageItem.label}
                    </span>
                  </div>
                );
              })}
              {view.job.status === "failed" ? (
                <p className="text-sm text-destructive">Failed · {view.job.error}</p>
              ) : null}
              {pollError ? <p className="text-sm text-destructive">{pollError}</p> : null}
              {view.job.progressMessage ? (
                <p className="mt-2 text-xs text-muted-foreground">{view.job.progressMessage}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {isGithubWorkflow ? (
            <Card className="rounded-lg">
              <CardContent className="p-6 grid gap-6">
                {/* 1. Header & Actions */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {repoRef?.fullName ?? snapshot?.repository?.fullName ?? view.job.inputPreview}
                      </Badge>
                      {assessment ? (
                        <Badge className={overallStatusBadge(assessment.overallStatus).color}>
                          {overallStatusBadge(assessment.overallStatus).label}
                        </Badge>
                      ) : null}
                      {isVerifiedOnArc ? (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                          <BadgeCheck className="size-3.5" />
                          Verified on Arc
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">GitHub Project Due Diligence</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {snapshot?.repository?.description ?? "Public repository intelligence and automated risk assessment."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canonicalUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={canonicalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="gap-1.5"
                        >
                          <ExternalLink className="size-4" />
                          Open Repository
                        </a>
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={copyShareLink} className="gap-1.5">
                      {copied ? <Check className="size-4 text-emerald-500" /> : <Share2 className="size-4" />}
                      {copied ? "Copied!" : "Share Report"}
                    </Button>
                  </div>
                </div>

                {/* 1. Executive Summary */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">1. Executive Summary</h3>
                  <div className="rounded-md bg-secondary/30 p-4 text-sm leading-6">
                    {sanitizePublicReportText(report?.summary || assessment?.overallSummary || "Analyzing repository activity, maintenance, documentation, and releases...")}
                  </div>
                </div>

                {/* 2. Project Overview */}
                <div className="border-t pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">2. Project Overview</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Primary Language</p>
                      <p className="font-semibold mt-1">{snapshot?.stack?.primaryLanguage ?? "Unspecified"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Open Source License</p>
                      <p className="font-semibold mt-1">{snapshot?.repository?.license?.name ?? "No license detected"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Default Branch</p>
                      <p className="font-semibold mt-1 font-mono">{snapshot?.repository?.defaultBranch ?? "main"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Repository Age</p>
                      <p className="font-semibold mt-1">
                        {snapshot?.repository?.createdAt ? formatDate(snapshot.repository.createdAt) : "Unknown"}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-semibold mt-1">
                        {snapshot?.repository?.isArchived ? "Archived (Read-Only)" : "Active"}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-semibold mt-1">
                        {snapshot?.repository?.isFork ? "Forked Repository" : "Standalone Repository"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Health Signals */}
                {assessment ? (
                  <div className="border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">3. Health Signals</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { key: "activity", title: "Development Activity", cat: assessment.categories.activity },
                        { key: "maintenance", title: "Maintenance", cat: assessment.categories.maintenance },
                        { key: "documentation", title: "Documentation", cat: assessment.categories.documentation },
                        { key: "releaseDiscipline", title: "Release Discipline", cat: assessment.categories.releaseDiscipline },
                        { key: "contributorDistribution", title: "Contributor Distribution", cat: assessment.categories.contributorDistribution },
                        { key: "automation", title: "Automation & CI", cat: assessment.categories.automation },
                      ].map(({ key, title, cat }) => (
                        <div key={key} className="rounded-md border p-4 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="font-semibold text-sm">{title}</p>
                              <Badge variant="outline" className={categoryStatusBadge(cat?.status).color}>
                                {categoryStatusBadge(cat?.status).label}
                              </Badge>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">{cat?.summary}</p>
                          </div>
                          {cat?.evidence?.length ? (
                            <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground/80 grid gap-1">
                              {cat.evidence.map((ev, i) => (
                                <span key={i}>• {ev}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 4. Recent Activity */}
                <div className="border-t pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">4. Recent Activity Breakdown</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Last Commit</p>
                      <p className="font-semibold mt-1">
                        {snapshot?.activity?.lastCommitAt ? formatDate(snapshot.activity.lastCommitAt) : "No commit record"}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">30-Day Commits</p>
                      <p className="font-semibold mt-1 text-lg">{snapshot?.activity?.commitCount30d ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">90-Day Commits</p>
                      <p className="font-semibold mt-1 text-lg">{snapshot?.activity?.commitCount90d ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Sampled Contributors</p>
                      <p className="font-semibold mt-1 text-lg">{snapshot?.contributors?.totalCount ?? 0}</p>
                    </div>
                  </div>
                  {snapshot?.contributors?.topContributors?.length ? (
                    <div className="mt-3 rounded-md border bg-secondary/10 p-3 text-xs">
                      <p className="font-medium text-muted-foreground mb-2">Top Maintainers (Commit Share)</p>
                      <div className="flex flex-wrap gap-2">
                        {snapshot.contributors.topContributors.slice(0, 5).map((c) => (
                          <Badge key={c.login} variant="secondary" className="font-mono text-xs">
                            {c.login} ({c.contributions} commits)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 5. Releases & Documentation Checklist */}
                <div className="border-t pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">5. Releases & Documentation Checklist</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                    {[
                      { label: "README Documentation", present: snapshot?.documentation?.hasReadme },
                      { label: "Open Source License", present: snapshot?.documentation?.hasLicense },
                      { label: "Security Policy (SECURITY.md)", present: snapshot?.documentation?.hasSecurityPolicy },
                      { label: "Contributing Guide (CONTRIBUTING.md)", present: snapshot?.documentation?.hasContributing },
                      { label: "Code of Conduct (CODE_OF_CONDUCT.md)", present: snapshot?.documentation?.hasCodeOfConduct },
                      { label: "Automated CI Workflows", present: snapshot?.stack?.hasWorkflows },
                    ].map(({ label, present }) => (
                      <div key={label} className="flex items-center justify-between rounded-md border p-3">
                        <span>{label}</span>
                        {present ? (
                          <span className="flex items-center gap-1 font-semibold text-emerald-500">
                            <Check className="size-4" /> Present
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-semibold text-amber-500">
                            Missing
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {snapshot?.releases ? (
                    <div className="mt-3 rounded-md border p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span>Tagged Releases: <strong>{snapshot.releases.totalCount}</strong> total ({snapshot.releases.releaseCount90d} in last 90 days)</span>
                      {snapshot.releases.latestRelease ? (
                        <span className="font-mono">Latest Tag: {snapshot.releases.latestRelease.tagName} ({snapshot.releases.latestRelease.publishedAt ? formatDate(snapshot.releases.latestRelease.publishedAt) : "published"})</span>
                      ) : (
                        <span className="text-muted-foreground">No GitHub release tags published</span>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* 6. Technology Stack & Ecosystems */}
                {snapshot?.stack ? (
                  <div className="border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">6. Technology Stack & Ecosystems</h3>
                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      {snapshot.stack.languages && Object.keys(snapshot.stack.languages).length > 0 ? (
                        <div className="rounded-md border p-3">
                          <p className="font-medium text-muted-foreground mb-2">Languages Breakdown</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(snapshot.stack.languages).slice(0, 6).map(([lang]) => (
                              <Badge key={lang} variant="secondary">
                                {lang}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {snapshot.stack.detectedFrameworks?.length ? (
                        <div className="rounded-md border p-3">
                          <p className="font-medium text-muted-foreground mb-2">Detected Frameworks & Ecosystems</p>
                          <div className="flex flex-wrap gap-2 font-mono">
                            {snapshot.stack.detectedFrameworks.map((m) => (
                              <Badge key={m} variant="outline">
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* 7. Strengths & Severity-Coded Risks */}
                {assessment ? (
                  <div className="border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">7. Strengths & Severity-Coded Risks</h3>
                    
                    {assessment.strengths?.length ? (
                      <div className="mb-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs">
                        <p className="font-semibold text-emerald-400 mb-2">Evidence-Backed Strengths</p>
                        <ul className="grid gap-1.5 text-muted-foreground">
                          {assessment.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {assessment.risks?.length ? (
                      <div className="grid gap-3 text-xs">
                        {assessment.risks.map((risk, i) => {
                          const badge = riskSeverityBadge(risk.severity);
                          return (
                            <div key={i} className={`rounded-md border p-4 ${badge.color}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                <p className="font-semibold text-sm">{risk.title}</p>
                                <Badge variant="outline" className="text-xs font-medium">
                                  {badge.label}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground leading-5">{risk.description}</p>
                              <p className="mt-2 text-[11px] font-medium text-foreground/80">Impact: {risk.impact}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No significant risk factors identified by deterministic rules.</p>
                    )}
                  </div>
                ) : null}

                {/* 8. Questions Before You Rely on This Project */}
                {assessment?.suggestedQuestions?.length ? (
                  <div className="border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">8. Questions Before You Rely on This Project</h3>
                    <div className="rounded-md border p-4 text-xs">
                      <ul className="grid gap-2 text-muted-foreground">
                        {assessment.suggestedQuestions.map((q, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {/* 9. Evidence & Limitations Disclaimer */}
                <div className="border-t pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">9. Evidence & Limitations Disclaimer</h3>
                  <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-5 text-amber-200/90">
                    <p>{assessment?.limitationsDisclaimer || "This report analyzes public GitHub metadata. It is not a security audit or investment recommendation."}</p>
                    {assessment?.analyzedAt ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">Analysis generated at {formatDate(assessment.analyzedAt)}.</p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-lg">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Final Report</CardTitle>
                    {report ? (
                      <Badge variant={report.completedWithWarnings ? "secondary" : "default"}>
                        {report.completedWithWarnings ? "Completed with warnings" : "Completed"}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5">
                  {report ? (
                    <>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
                        <p className="mt-2 leading-7">{sanitizePublicReportText(report.summary)}</p>
                      </div>
                      <div className="rounded-md bg-secondary/30 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Input preview</p>
                        <p className="mt-2 text-sm">{sanitizePublicReportText(reportInput.preview)}</p>
                      </div>
                      {report.synthesis ? (
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={report.synthesis.status === "ai_generated" ? "default" : "secondary"}>
                              {report.synthesis.status === "ai_generated" ? "AI-generated synthesis" : "Deterministic fallback"}
                            </Badge>
                            {report.synthesis.provider ? <Badge variant="outline">Provider · {report.synthesis.provider}</Badge> : null}
                            {report.synthesis.model ? <Badge variant="outline">Model · {report.synthesis.model}</Badge> : null}
                          </div>
                          {report.synthesis.status === "ai_generated" ? (
                            <>
                              <p className="mt-3 text-xs text-muted-foreground">
                                Summary and findings synthesized after execution completed.
                              </p>
                              <div className="mt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid API responses used</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {report.synthesis.usedPaidApiResponses.map((service) => (
                                    <Badge key={service.serviceSlug} variant="secondary">
                                      {service.serviceName}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {fallbackReasonLabel(report.synthesis.fallbackReason)}. Successful paid API results, receipts, and Arc proofs were preserved.
                            </p>
                          )}
                        </div>
                      ) : null}
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key findings</p>
                        <ul className="mt-2 grid gap-2 text-sm">
                          {report.keyFindings.map((finding, index) => (
                            <li key={`${index}-${finding}`} className="rounded-md bg-secondary/30 p-3">
                              {sanitizePublicReportText(finding)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected services</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {report.selectedServices.map((service) => (
                              <Badge key={service.slug}>{service.name}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skipped services</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {report.skippedServices.length ? (
                              report.skippedServices.map((service) => (
                                <Badge key={service.slug} variant="outline">{service.name}</Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">None in the allowlisted plan.</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {report.links.agentRun ? (
                          <Button asChild variant="outline">
                            <Link href={report.links.agentRun}>Agent Run</Link>
                          </Button>
                        ) : null}
                        <Button asChild variant="outline">
                          <Link href={report.links.receipts}>Commerce Receipts</Link>
                        </Button>
                        {report.links.passport ? (
                          <Button asChild variant="outline">
                            <Link href={report.links.passport}>Agent Passport</Link>
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      The Final Report appears after execution completes.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>Services purchased</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {view.services
                    .filter((service) => service.status === "paid" || service.status === "failed")
                    .map((service) => (
                      <div key={service.serviceSlug} className="min-w-0 rounded-md border p-4">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{service.serviceName}</p>
                            <div className="mt-2">
                              <ServicePresentation metadata={service.presentation} />
                            </div>
                          </div>
                          <Badge variant={service.status === "paid" ? "default" : "destructive"}>
                            {service.status === "paid" ? `${service.priceUsdc} USDC` : "failed"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{service.reasoning}</p>
                        {service.presentation.providerType === "live_provider" ? (
                          <div className="mt-3">
                            <ProviderResponseDetails value={service.response} />
                          </div>
                        ) : service.response ? (
                          <pre className="mt-3 max-h-52 max-w-full overflow-auto rounded-md bg-secondary/40 p-3 text-xs">
                            {prettyJson(service.response)}
                          </pre>
                        ) : null}
                        {service.error ? (
                          <p className="mt-2 break-words text-sm text-destructive">{service.error}</p>
                        ) : null}
                        {service.receiptId ? (
                          <Button asChild size="sm" variant="outline" className="mt-3">
                            <Link href={`/receipts/${service.receiptId}`}>
                              <ReceiptText className="size-4" />
                              Receipt
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  {!view.services.some((service) => service.status === "paid" || service.status === "failed") ? (
                    <p className="text-sm text-muted-foreground">Purchases have not started yet.</p>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6">
        <details className="mt-6 rounded-md border p-4">
          <summary className="cursor-pointer font-semibold text-sm text-muted-foreground hover:text-foreground">
            Payment & verification details
          </summary>
          <div className="mt-4 grid gap-6">
            {view.userPayment ? (
              <Card className="rounded-lg">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CreditCard className="size-4 text-primary" />
                      Workflow Checkout & Payment
                    </CardTitle>
                    <Badge variant={view.userPayment.status === "credit_issued" ? "secondary" : "default"}>
                      {view.userPayment.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">User payment</p>
                      <p className="font-mono font-medium">{view.userPayment.grossAmountUsdc} USDC</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Provider cost</p>
                      <p className="font-mono font-medium">{view.userPayment.providerCostUsdc} USDC</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Quoted platform fee</p>
                      <p className="font-mono font-medium">{view.userPayment.platformFeeUsdc} USDC</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net revenue</p>
                      <p className="font-mono font-medium">{view.userPayment.netRevenueUsdc} USDC</p>
                    </div>
                  </div>
                  {Number(view.userPayment.creditAmountUsdc) > 0 ? (
                    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
                      <p className="font-medium">Credit issued · {view.userPayment.creditAmountUsdc} USDC</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {view.userPayment.failureReason ?? "The paid workflow could not complete."}
                      </p>
                    </div>
                  ) : null}
                  {view.userPayment.transactionHash ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">User checkout transaction</p>
                      <p className="break-all font-mono text-xs">{view.userPayment.transactionHash}</p>
                      {view.userPayment.transactionUrl ? (
                        <Button asChild size="sm" variant="outline" className="mt-2">
                          <a href={view.userPayment.transactionUrl} target="_blank" rel="noreferrer">
                            User payment on Arc <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sponsored checkout · no user USDC transaction.</p>
                  )}
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href={view.links.workflowReceipt}>
                      <ReceiptText className="size-4" />
                      Workflow Receipt
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Identity & Wallets</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-xs">
                <div>
                  <p className="font-medium">{HOSTED_REQUESTER_IDENTITY_LABEL}</p>
                  <p className={view.job.requesterWallet ? "mt-1 break-all font-mono" : "mt-1 text-muted-foreground"}>
                    {hostedRequesterDisplayLine(view.job.requesterWallet)}
                  </p>
                  {view.userPayment?.paymentMode === "paid" ? (
                    <p className="mt-1 text-muted-foreground">Paid user-facing workflow price.</p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">{HOSTED_REQUESTER_NOT_CHARGED_COPY}</p>
                  )}
                </div>
                <div className="border-t pt-2">
                  <p className="text-muted-foreground">
                    Internal x402 payer wallet: <span className="font-mono">{view.payerWallet ?? "Pending"}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Arc Proof Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {view.proofs.map((proof) => (
                  <div key={proof.receiptId} className="rounded-md border p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {proof.status === "verified" ? (
                          <BadgeCheck className="size-4 text-primary" />
                        ) : proof.status === "pending" ? (
                          <LoaderCircle className="size-4 animate-spin text-primary" />
                        ) : (
                          <Circle className="size-4 text-destructive" />
                        )}
                        <span className="font-medium">
                          {proof.status === "verified" ? "Verified on Arc" : proof.status === "failed" ? "Proof failed" : "Onchain proof pending"}
                        </span>
                      </div>
                      <Badge variant="outline">receipt {shortenHash(proof.receiptId, 6)}</Badge>
                    </div>
                    {proof.transactionHash ? <p className="mt-2 break-all font-mono">{proof.transactionHash}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proof.transactionUrl ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={proof.transactionUrl} target="_blank" rel="noreferrer">
                            Proof transaction <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      ) : null}
                      {proof.contractUrl ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={proof.contractUrl} target="_blank" rel="noreferrer">
                            Registry contract <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!view.proofs.length ? <p className="text-xs text-muted-foreground">Proof metadata appears after settlement creates a receipt.</p> : null}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Raw Execution & Planner Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-xs">
                <div className="grid gap-1 font-mono">
                  <p>Job ID: {view.job.id}</p>
                  <p>Input SHA-256: {reportInput.sha256}</p>
                  <p>Budget: {view.job.budgetUsdc} USDC | Spent: {view.job.spentUsdc} USDC</p>
                  <p>Internal Progress Stage: {view.job.progressStage}</p>
                </div>
                {view.job.plannerSnapshot.marketSymbol ? (
                  <Badge variant="outline" className="w-fit">Selected asset · {view.job.plannerSnapshot.marketSymbol}</Badge>
                ) : null}
                <div className="grid gap-2 border-t pt-2">
                  <p className="font-medium text-muted-foreground">Planner Service Selections:</p>
                  {view.job.plannerSnapshot.selectedServices?.map((service) => (
                    <div key={service.slug} className="rounded-md border p-2">
                      <div className="flex justify-between font-mono">
                        <span>{service.name}</span>
                        <span>{service.priceUsdc.toFixed(4)} USDC</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{service.reasoning}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </details>
      </section>
    </main>
  );
}
