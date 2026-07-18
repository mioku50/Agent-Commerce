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
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { shortenHash } from "@/lib/utils";
import type {
  HostedPlannerSnapshot,
  HostedRunnerDiagnostic,
  HostedWorkflowType,
  RecentHostedJob,
} from "./types";

const WORKFLOWS: Array<{
  value: HostedWorkflowType;
  label: string;
  description: string;
  task: string;
  input: string;
}> = [
  {
    value: "sentiment_tone",
    label: "Sentiment & Tone Report",
    description: "Measure submitted text with deterministic paid compute and add concise paid context.",
    task: "Analyze this text and produce a sentiment and tone workflow report.",
    input: "Arc builders are shipping useful payment infrastructure quickly, and the latest proof workflow feels clear and trustworthy.",
  },
  {
    value: "builder_update",
    label: "Builder Update Analysis",
    description: "Turn a project update into a compact, traceable structured report.",
    task: "Analyze this builder update and extract a concise structured progress report.",
    input: "This week we launched the hosted runner, connected receipts to our onchain registry, and reduced the public demo budget to a safe testnet cap.",
  },
  {
    value: "custom_task",
    label: "Custom Task",
    description: "Let the deterministic planner select only relevant services from the server allowlist.",
    task: "Analyze my text and prepare a concise structured report with useful paid API context.",
    input: "Paste optional source text here for the allowlisted Text Analyzer service.",
  },
];

function workflowLabel(type: HostedWorkflowType) {
  return WORKFLOWS.find((workflow) => workflow.value === type)?.label ?? type;
}

export function HostedAgentRunner({
  diagnostic,
  initialHistory,
}: {
  diagnostic: HostedRunnerDiagnostic;
  initialHistory: RecentHostedJob[];
}) {
  const router = useRouter();
  const wallet = useArcWallet();
  const initial = WORKFLOWS[0];
  const [workflowType, setWorkflowType] = useState<HostedWorkflowType>(initial.value);
  const [task, setTask] = useState(initial.task);
  const [inputText, setInputText] = useState(initial.input);
  const [budget, setBudget] = useState("0.005");
  const [plan, setPlan] = useState<HostedPlannerSnapshot | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  function invalidatePlan() {
    setPlan(null);
    setError(null);
    idempotencyKey.current = null;
  }

  function selectWorkflow(value: HostedWorkflowType) {
    const workflow = WORKFLOWS.find((item) => item.value === value) ?? WORKFLOWS[0];
    setWorkflowType(workflow.value);
    setTask(workflow.task);
    setInputText(workflow.input);
    invalidatePlan();
  }

  function requestBody() {
    return { workflowType, task, inputText, budgetUsdc: budget };
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
              <p className="text-muted-foreground">A browser wallet is optional requester identity only. It never pays or exposes a private key.</p>
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
                {WORKFLOWS.map((workflow) => <option key={workflow.value} value={workflow.value}>{workflow.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{WORKFLOWS.find((workflow) => workflow.value === workflowType)?.description}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-task">Task</Label>
              <textarea id="hosted-task" value={task} onChange={(event) => { setTask(event.target.value); invalidatePlan(); }} maxLength={500} className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" />
              <p className="text-xs text-muted-foreground">{task.length}/500 characters</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-input">Input text</Label>
              <textarea id="hosted-input" value={inputText} onChange={(event) => { setInputText(event.target.value); invalidatePlan(); }} maxLength={5000} className="min-h-36 rounded-md border bg-background px-3 py-2 text-sm" />
              <p className="text-xs text-muted-foreground">{inputText.length}/5000 · Results are public and shareable; do not paste secrets.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-budget">Maximum budget (USDC)</Label>
              <Input id="hosted-budget" type="number" min="0.001" max="0.005" step="0.0001" value={budget} onChange={(event) => { setBudget(event.target.value); invalidatePlan(); }} />
            </div>
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">Optional requester identity</p><p className="mt-1 text-xs text-muted-foreground">Separate from the project payer wallet.</p></div>
                {wallet.address ? <Badge variant="secondary" className="font-mono">{shortenHash(wallet.address, 6)}</Badge> : <Button type="button" variant="outline" onClick={() => void wallet.connect()} disabled={!wallet.providerAvailable || wallet.connecting}><Wallet />{wallet.connecting ? "Connecting…" : "Connect identity"}</Button>}
              </div>
            </div>
            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            <Button size="lg" variant={plan ? "outline" : "default"} onClick={() => void preview()} disabled={previewing || launching || !diagnostic.configured}>
              {previewing ? <LoaderCircle className="animate-spin" /> : <Calculator />}{previewing ? "Building safe plan…" : plan ? "Refresh plan preview" : "Preview plan and cost"}
            </Button>
            <Button size="lg" onClick={() => void launch()} disabled={!plan || launching || previewing || plan.selectedServices.length === 0}>
              {launching ? <LoaderCircle className="animate-spin" /> : <Bot />}{launching ? "Queueing workflow…" : "Run this workflow"}
            </Button>
            <Button asChild variant="ghost"><Link href="/agent-setup">Use your own wallet with the local CLI <ArrowRight /></Link></Button>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Plan preview</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {plan ? <>
                <div className="flex flex-wrap gap-2"><Badge>{plan.selectedServices.length} paid API{plan.selectedServices.length === 1 ? "" : "s"}</Badge><Badge variant="secondary">estimated {plan.estimatedSpendUsdc} USDC</Badge><Badge variant="outline">cap {plan.maxPaidCalls} calls</Badge></div>
                <div className="grid gap-3">{plan.selectedServices.map((service) => <div key={service.slug} className="rounded-md border p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{service.name}</p><Badge variant="secondary">{service.priceUsdc} USDC</Badge></div><p className="mt-2 font-mono text-xs text-muted-foreground">{service.method} {service.endpoint}</p><p className="mt-2 text-sm text-muted-foreground">{service.reasoning}</p></div>)}</div>
                {plan.skippedServices.length ? <div><p className="text-sm font-medium">Skipped by policy or relevance</p><div className="mt-2 flex flex-wrap gap-2">{plan.skippedServices.map((service) => <Badge key={service.slug} variant="outline">{service.name}</Badge>)}</div></div> : null}
                <p className="text-xs text-muted-foreground">{plan.aggregationLabel}. No LLM analysis is claimed.</p>
              </> : <p className="text-sm text-muted-foreground">Preview is calculated on the server from the fixed Arc Testnet allowlist. Browser-supplied URLs and service selections are ignored.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader><CardTitle>Recent hosted workflows</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {initialHistory.length ? initialHistory.map((job) => <Link key={job.id} href={job.href} className="rounded-md border p-3 transition-colors hover:bg-secondary/30"><div className="flex items-center justify-between gap-3"><p className="font-medium">{workflowLabel(job.workflowType)}</p><Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{job.task}</p><p className="mt-2 text-xs text-muted-foreground">{job.spentUsdc} USDC · {job.receiptCount} receipts · {job.proofCount} Arc proofs</p></Link>) : <p className="text-sm text-muted-foreground">No hosted workflow history yet.</p>}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
