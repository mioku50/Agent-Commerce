/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Bot, Calculator, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicePresentation } from "@/components/services/service-presentation";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { shortenHash } from "@/lib/utils";
import {
  HOSTED_REQUESTER_IDENTITY_LABEL,
  HOSTED_REQUESTER_PAYMENT_COPY,
  hostedInputPreviewHelper,
} from "@/lib/agent/hosted-ui";
import {
  getHostedWorkflowTemplate,
  hostedWorkflowTemplates,
} from "@/lib/agent/workflow-templates";
import type {
  HostedPlannerSnapshot,
  PythMarketSymbol,
  HostedRunnerDiagnostic,
  HostedWorkflowType,
  RecentHostedJob,
} from "./types";

function workflowLabel(type: HostedWorkflowType) {
  return getHostedWorkflowTemplate(type)?.label ?? type;
}

export function HostedAgentRunner({
  diagnostic,
  initialHistory,
  initialWorkflowType,
  initialMarketSymbol,
}: {
  diagnostic: HostedRunnerDiagnostic;
  initialHistory: RecentHostedJob[];
  initialWorkflowType: HostedWorkflowType;
  initialMarketSymbol: PythMarketSymbol;
}) {
  const router = useRouter();
  const wallet = useArcWallet();
  const initial = getHostedWorkflowTemplate(initialWorkflowType) ?? hostedWorkflowTemplates[0];
  const [workflowType, setWorkflowType] = useState<HostedWorkflowType>(initial.value);
  const [task, setTask] = useState(initial.task);
  const [inputText, setInputText] = useState("");
  const [marketSymbol, setMarketSymbol] = useState<PythMarketSymbol>(initialMarketSymbol);
  const [budget, setBudget] = useState("0.005");
  const [plan, setPlan] = useState<HostedPlannerSnapshot | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [historyFilter, setHistoryFilter] = useState<HostedWorkflowType | "all">("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const inputHelper = hostedInputPreviewHelper(inputText);

  function invalidatePlan() {
    setPlan(null);
    setError(null);
    idempotencyKey.current = null;
  }

  function selectWorkflow(value: HostedWorkflowType) {
    const workflow = getHostedWorkflowTemplate(value) ?? hostedWorkflowTemplates[0];
    setWorkflowType(workflow.value);
    setTask(workflow.task);
    invalidatePlan();
  }

  async function filterHistory(value: HostedWorkflowType | "all") {
    setHistoryFilter(value);
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: "8", workflowType: value });
      const response = await fetch(`/api/hosted-agent/jobs?${params}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { jobs?: RecentHostedJob[]; error?: string };
      if (!response.ok || !data.jobs) {
        throw new Error(data.error ?? "Unable to filter hosted history.");
      }
      setHistory(data.jobs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setHistoryLoading(false);
    }
  }

  function requestBody() {
    return {
      workflowType,
      task,
      inputText,
      marketSymbol: workflowType === "market_context" ? marketSymbol : null,
      budgetUsdc: budget,
    };
  }

  async function preview() {
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch("/api/hosted-agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const data = (await response.json()) as { plan?: HostedPlannerSnapshot; error?: string };
      if (!response.ok || !data.plan) throw new Error(data.error ?? "Unable to preview workflow plan.");
      setPlan(data.plan);
      return data.plan;
    } catch (caught) {
      setPlan(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setPreviewing(false);
    }
  }

  async function launch() {
    if (!plan) return;
    setLaunching(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/hosted-agent/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({ ...requestBody(), requesterWallet: wallet.address }),
      });
      const data = (await response.json()) as { jobId?: string; error?: string; retryAfterSeconds?: number };
      if (!response.ok || !data.jobId) {
        const retry = data.retryAfterSeconds ? ` Retry in about ${data.retryAfterSeconds}s.` : "";
        throw new Error(`${data.error ?? "Unable to launch hosted workflow."}${retry}`);
      }
      router.push(`/agent-runner/${data.jobId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.72fr] lg:items-center">
          <div>
            <Badge className="mb-4">Useful hosted workflows · Arc Testnet</Badge>
            <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">Run a useful agent workflow</h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Preview the exact allowlisted APIs and price, then launch a durable paid workflow with a shareable Final Report and one Arc proof per receipt.
            </p>
          </div>
          <Card className="rounded-lg">
            <CardContent className="grid gap-3 p-5 text-sm">
              <div className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" />Project-owned payer wallet</div>
              <p className="break-all font-mono text-xs">{diagnostic.payerAddress ?? "Hosted wallet not configured"}</p>
              <p className="text-muted-foreground">Arc Testnet only · max {diagnostic.maxBudgetUsdc} USDC · max 3 paid calls · one active run.</p>
              <p className="text-muted-foreground">{HOSTED_REQUESTER_PAYMENT_COPY}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Workflow input</CardTitle></CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="workflow-type">Workflow</Label>
              <select id="workflow-type" value={workflowType} onChange={(event) => selectWorkflow(event.target.value as HostedWorkflowType)} className="h-10 rounded-md border bg-background px-3 text-sm">
                {hostedWorkflowTemplates.map((workflow) => <option key={workflow.value} value={workflow.value}>{workflow.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{getHostedWorkflowTemplate(workflowType)?.description}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-task">Task</Label>
              <textarea id="hosted-task" value={task} onChange={(event) => { setTask(event.target.value); invalidatePlan(); }} maxLength={500} className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" />
              <p className="text-xs text-muted-foreground">{task.length}/500 characters</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-input">Input text</Label>
              <textarea id="hosted-input" aria-describedby="hosted-input-description hosted-input-helper" value={inputText} onChange={(event) => { setInputText(event.target.value); invalidatePlan(); }} placeholder={getHostedWorkflowTemplate(workflowType)?.placeholder} minLength={20} maxLength={5000} required className="min-h-36 max-w-full rounded-md border bg-background px-3 py-2 text-sm" />
              <p id="hosted-input-description" className="text-xs text-muted-foreground">{inputText.length}/5000 · Required. Obvious credentials and private keys are rejected. Only a redacted preview and SHA-256 are published.</p>
            </div>
            {workflowType === "market_context" ? (
              <div className="grid gap-2">
                <Label htmlFor="market-symbol">Market asset</Label>
                <select
                  id="market-symbol"
                  value={marketSymbol}
                  onChange={(event) => {
                    setMarketSymbol(event.target.value as PythMarketSymbol);
                    invalidatePlan();
                  }}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="BTC/USD">BTC/USD</option>
                  <option value="ETH/USD">ETH/USD</option>
                  <option value="SOL/USD">SOL/USD</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  The server maps this allowlisted symbol to its fixed Pyth feed ID. Browser-supplied feed IDs and upstream URLs are never accepted.
                </p>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="hosted-budget">Maximum budget (USDC)</Label>
              <Input id="hosted-budget" type="number" min="0.001" max="0.005" step="0.0001" value={budget} onChange={(event) => { setBudget(event.target.value); invalidatePlan(); }} />
            </div>
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-medium">{HOSTED_REQUESTER_IDENTITY_LABEL} <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-xs text-muted-foreground">{HOSTED_REQUESTER_PAYMENT_COPY}</p></div>
                {wallet.address ? <Badge variant="secondary" className="font-mono">{shortenHash(wallet.address, 6)}</Badge> : <Button type="button" variant="outline" onClick={() => void wallet.connect()} disabled={!wallet.providerAvailable || wallet.connecting}><Wallet />{wallet.connecting ? "Connecting…" : "Connect identity"}</Button>}
              </div>
            </div>
            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            {inputHelper ? <p id="hosted-input-helper" role="status" className="text-sm font-medium text-amber-300">{inputHelper}</p> : <span id="hosted-input-helper" className="sr-only">Input is ready for workflow preview.</span>}
            <Button size="lg" variant={plan ? "outline" : "default"} onClick={() => void preview()} disabled={previewing || launching || !diagnostic.configured || inputText.trim().length < 20}>
              {previewing ? <LoaderCircle className="animate-spin" /> : <Calculator />}{previewing ? "Building safe plan…" : plan ? "Refresh plan preview" : "Preview plan and cost"}
            </Button>
            <Button size="lg" onClick={() => void launch()} disabled={!plan || launching || previewing || plan.selectedServices.length === 0}>
              {launching ? <LoaderCircle className="animate-spin" /> : <Bot />}{launching ? "Queueing workflow…" : plan ? `Run workflow for ${plan.estimatedSpendUsdc.toFixed(4)} USDC` : "Run workflow"}
            </Button>
            <Button asChild variant="ghost"><Link href="/agent-setup">Use your own wallet with the local CLI <ArrowRight /></Link></Button>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Plan preview</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {plan ? <>
                <div className="grid gap-3 rounded-md border bg-secondary/20 p-4 text-sm sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Workflow</p><p className="font-medium">{plan.workflowLabel}</p></div>
                  <div><p className="text-xs text-muted-foreground">Paid calls</p><p className="font-medium">{plan.selectedServices.length} of {plan.maxPaidCalls} maximum</p></div>
                  {plan.marketSymbol ? <div><p className="text-xs text-muted-foreground">Selected asset</p><p className="font-medium">{plan.marketSymbol}</p></div> : null}
                  <div><p className="text-xs text-muted-foreground">Estimated total</p><p className="font-mono font-medium">{plan.estimatedSpendUsdc.toFixed(4)} USDC</p></div>
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">Project-owned payer</p><p className="break-all font-mono text-xs">{diagnostic.payerAddress ?? "Unavailable"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Expected Final Report</p><p className="font-medium">{plan.aggregationLabel}</p></div>
                </div>
                <div className="rounded-md bg-secondary/30 p-3 text-xs"><p className="font-medium">Safe input preview</p><p className="mt-1 text-muted-foreground">{plan.inputPreview}</p><p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {plan.inputSha256}</p></div>
                <div className="grid gap-3">{plan.selectedServices.map((service) => <div key={service.slug} className="min-w-0 rounded-md border p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{service.name}</p><div className="mt-2"><ServicePresentation metadata={service.presentation} /></div></div><Badge variant="secondary" className="font-mono">{service.priceUsdc.toFixed(4)} USDC</Badge></div><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{service.method} {service.endpoint}</p><p className="mt-2 text-sm text-muted-foreground">{service.reasoning}</p></div>)}</div>
                {plan.skippedServices.length ? <div><p className="text-sm font-medium">Skipped by policy or relevance</p><div className="mt-2 flex flex-wrap gap-2">{plan.skippedServices.map((service) => <Badge key={service.slug} variant="outline">{service.name}</Badge>)}</div></div> : null}
                <p className="text-xs text-muted-foreground">{plan.aggregationLabel}. No LLM analysis is claimed.</p>
              </> : <p className="text-sm text-muted-foreground">Preview is calculated on the server from the fixed Arc Testnet allowlist. Browser-supplied URLs and service selections are ignored.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Recent hosted workflows</CardTitle><select aria-label="Filter hosted results by workflow" value={historyFilter} onChange={(event) => void filterHistory(event.target.value as HostedWorkflowType | "all")} disabled={historyLoading} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All workflows</option>{hostedWorkflowTemplates.map((workflow) => <option key={workflow.value} value={workflow.value}>{workflow.label}</option>)}</select></div></CardHeader>
            <CardContent className="grid gap-3">
              {historyLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Filtering history…</p> : history.length ? history.map((job) => <Link key={job.id} href={job.href} className="rounded-md border p-3 transition-colors hover:bg-secondary/30"><div className="flex items-center justify-between gap-3"><p className="font-medium">{workflowLabel(job.workflowType)}</p><Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{job.inputPreview || job.task}</p><p className="mt-2 text-xs text-muted-foreground">{job.spentUsdc} USDC · {job.receiptCount} receipts · {job.proofCount} Arc proofs</p></Link>) : <p className="text-sm text-muted-foreground">No hosted workflow history for this filter.</p>}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
