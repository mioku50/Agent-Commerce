/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, Circle, CreditCard, ExternalLink, LoaderCircle, ReceiptText, RotateCcw } from "lucide-react";
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
import { shortenHash } from "@/lib/utils";
import type { HostedJobView } from "./types";

const CONSUMER_STAGES = [
  { id: "preparing", label: "Preparing report", matches: ["queued", "planning"] },
  { id: "collecting", label: "Collecting data", matches: ["purchasing"] },
  { id: "analyzing", label: "Analyzing results", matches: ["generating_receipt"] },
  { id: "verifying", label: "Verifying result", matches: ["publishing_onchain_proof"] },
  { id: "completed", label: "Completed", matches: ["completed"] },
] as const;

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

  const activeStage = view.job.progressStage;
  const currentIndex = CONSUMER_STAGES.findIndex((stage) =>
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

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Badge className="mb-3">Shareable hosted result</Badge>
              <h1 className="text-3xl font-bold sm:text-4xl">
                {view.job.plannerSnapshot.workflowLabel ?? "Hosted agent workflow"}
              </h1>
              <p className="mt-3 max-w-3xl text-muted-foreground">{view.job.task}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={view.job.status === "failed" ? "destructive" : view.job.status === "completed" ? "default" : "secondary"}>
                {view.job.status === "completed" ? "Completed" : view.job.status}
              </Badge>
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
              {CONSUMER_STAGES.map((stageItem, index) => {
                const done =
                  view.job.status === "completed" ||
                  (currentIndex >= 0 && index < currentIndex);
                const current = (stageItem.matches as readonly string[]).includes(activeStage);
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
                    <p className="mt-2 leading-7">{report.summary}</p>
                  </div>
                  <div className="rounded-md bg-secondary/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Input preview</p>
                    <p className="mt-2 text-sm">{reportInput.preview}</p>
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
                          {finding}
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
