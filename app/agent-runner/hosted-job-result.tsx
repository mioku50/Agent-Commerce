/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, Circle, ExternalLink, LoaderCircle, ReceiptText, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortenHash } from "@/lib/utils";
import type { HostedJobView } from "./types";

const STAGES = [
  ["queued", "queued"],
  ["planning", "planning"],
  ["purchasing", "purchasing"],
  ["generating_receipt", "generating receipt"],
  ["publishing_onchain_proof", "publishing onchain proof"],
  ["completed", "completed"],
] as const;

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
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

  const currentIndex = STAGES.findIndex(([stage]) => stage === view.job.progressStage);
  const active = view.job.status === "queued" || view.job.status === "running";
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
            <div><Badge className="mb-3">Shareable hosted result</Badge><h1 className="text-3xl font-bold sm:text-4xl">{view.job.plannerSnapshot.workflowLabel ?? "Hosted agent workflow"}</h1><p className="mt-3 max-w-3xl text-muted-foreground">{view.job.task}</p></div>
            <div className="flex gap-2"><Badge variant={view.job.status === "failed" ? "destructive" : view.job.status === "completed" ? "default" : "secondary"}>{view.job.status}</Badge><Button asChild variant="outline"><Link href="/agent-runner"><RotateCcw />New workflow</Link></Button></div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="grid content-start gap-6">
          <Card className="rounded-lg"><CardHeader><CardTitle>Live progress</CardTitle></CardHeader><CardContent className="grid gap-3">
            {STAGES.map(([stage, label], index) => {
              const done = view.job.status === "completed" || (currentIndex >= 0 && index < currentIndex);
              const current = stage === view.job.progressStage;
              return <div key={stage} className="flex items-center gap-3 text-sm">{done ? <Check className="size-5 text-primary" /> : current && active ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <Circle className="size-5 text-muted-foreground/40" />}<span className={done || current ? "font-medium" : "text-muted-foreground"}>{label}</span></div>;
            })}
            {view.job.status === "failed" ? <p className="text-sm text-destructive">failed · {view.job.error}</p> : null}
            {pollError ? <p className="text-sm text-destructive">{pollError}</p> : null}
            <div className="mt-2 rounded-md bg-secondary/30 p-3 text-xs"><p className="font-mono break-all">{view.job.id}</p><p className="mt-2 text-muted-foreground">Budget {view.job.budgetUsdc} USDC · spent {view.job.spentUsdc} USDC</p>{view.job.progressMessage ? <p className="mt-2">{view.job.progressMessage}</p> : null}</div>
          </CardContent></Card>

          <Card className="rounded-lg"><CardHeader><CardTitle>Plan snapshot</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm">
            {view.job.plannerSnapshot.selectedServices?.map((service) => <div key={service.slug} className="rounded-md border p-3"><div className="flex justify-between gap-3"><p className="font-medium">{service.name}</p><span>{service.priceUsdc} USDC</span></div><p className="mt-1 text-xs text-muted-foreground">{service.reasoning}</p></div>)}
            <p className="text-xs text-muted-foreground">Estimated {view.job.plannerSnapshot.estimatedSpendUsdc ?? "—"} USDC · server allowlist · max 3 paid calls.</p>
          </CardContent></Card>
        </div>

        <div className="grid content-start gap-6">
          <Card className="rounded-lg"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Final Report</CardTitle>{report ? <Badge variant={report.completedWithWarnings ? "secondary" : "default"}>{report.completedWithWarnings ? "completed with warnings" : "complete"}</Badge> : null}</div></CardHeader><CardContent className="grid gap-5">
            {report ? <>
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p><p className="mt-2 leading-7">{report.summary}</p></div>
              <div className="rounded-md bg-secondary/30 p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Safe input preview</p><p className="mt-2 text-sm">{reportInput.preview}</p><p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {reportInput.sha256}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key findings</p><ul className="mt-2 grid gap-2 text-sm">{report.keyFindings.map((finding, index) => <li key={`${index}-${finding}`} className="rounded-md bg-secondary/30 p-3">{finding}</li>)}</ul></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected services</p><div className="mt-2 flex flex-wrap gap-2">{report.selectedServices.map((service) => <Badge key={service.slug}>{service.name}</Badge>)}</div></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skipped services</p><div className="mt-2 flex flex-wrap gap-2">{report.skippedServices.length ? report.skippedServices.map((service) => <Badge key={service.slug} variant="outline">{service.name}</Badge>) : <span className="text-sm text-muted-foreground">None in the allowlisted plan.</span>}</div></div></div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">{report.aggregationLabel}</p><p className="mt-1 text-xs text-muted-foreground">This report aggregates actual API responses deterministically. No model-generated sentiment or prose is claimed.</p></div>
              <div className="flex flex-wrap gap-2">{report.links.agentRun ? <Button asChild variant="outline"><Link href={report.links.agentRun}>Agent Run</Link></Button> : null}<Button asChild variant="outline"><Link href={report.links.receipts}>Commerce Receipts</Link></Button>{report.links.passport ? <Button asChild variant="outline"><Link href={report.links.passport}>Agent Passport</Link></Button> : null}</div>
            </> : <div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />The Final Report appears after paid execution and durable persistence complete.</div>}
          </CardContent></Card>

          <Card className="rounded-lg"><CardHeader><CardTitle>Services purchased</CardTitle></CardHeader><CardContent className="grid gap-4">
            {view.services.filter((service) => service.status === "paid" || service.status === "failed").map((service) => <div key={service.serviceSlug} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{service.serviceName}</p><Badge variant={service.status === "paid" ? "default" : "destructive"}>{service.status === "paid" ? `${service.priceUsdc} USDC` : "failed"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{service.reasoning}</p>{service.response ? <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-secondary/40 p-3 text-xs">{prettyJson(service.response)}</pre> : null}{service.error ? <p className="mt-2 text-sm text-destructive">{service.error}</p> : null}{service.receiptId ? <Button asChild size="sm" variant="outline" className="mt-3"><Link href={`/receipts/${service.receiptId}`}><ReceiptText />Receipt</Link></Button> : null}</div>)}
            {!view.services.some((service) => service.status === "paid" || service.status === "failed") ? <p className="text-sm text-muted-foreground">Purchases have not started yet.</p> : null}
          </CardContent></Card>

          <Card className="rounded-lg"><CardHeader><CardTitle>Verified on Arc</CardTitle></CardHeader><CardContent className="grid gap-3">
            {view.proofs.map((proof) => <div key={proof.receiptId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">{proof.status === "verified" ? <BadgeCheck className="size-5 text-primary" /> : proof.status === "pending" ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <Circle className="size-5 text-destructive" />}<p className="font-medium">{proof.status === "verified" ? "Verified on Arc" : proof.status === "failed" ? "Proof failed" : "Onchain proof pending"}</p></div><Badge variant="outline">receipt {shortenHash(proof.receiptId, 6)}</Badge></div>{proof.transactionHash ? <p className="mt-3 break-all font-mono text-xs">{proof.transactionHash}</p> : null}<div className="mt-3 flex flex-wrap gap-2">{proof.transactionUrl ? <Button asChild size="sm"><a href={proof.transactionUrl} target="_blank" rel="noreferrer">Proof transaction <ExternalLink /></a></Button> : null}{proof.contractUrl ? <Button asChild size="sm" variant="outline"><a href={proof.contractUrl} target="_blank" rel="noreferrer">Registry contract <ExternalLink /></a></Button> : null}</div></div>)}
            {!view.proofs.length ? <p className="text-sm text-muted-foreground">Proof metadata appears after settlement creates a receipt.</p> : null}
          </CardContent></Card>
        </div>
      </section>
    </main>
  );
}
