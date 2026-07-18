/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  Circle,
  ExternalLink,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { shortenHash } from "@/lib/utils";

type HostedRunnerDiagnostic = {
  configured: boolean;
  chainId: number;
  payerAddress: string | null;
  maxBudgetUsdc: number;
  allowedServices: string[];
  cooldownSeconds: number;
  rateLimitWindowSeconds: number;
  rateLimitMaxRuns: number;
};

type HostedJobView = {
  job: {
    id: string;
    requesterWallet: string | null;
    task: string;
    budgetUsdc: string;
    status: "queued" | "running" | "completed" | "failed";
    progressStage:
      | "queued"
      | "planning"
      | "purchasing"
      | "generating_receipt"
      | "publishing_onchain_proof"
      | "completed"
      | "failed";
    progressMessage: string | null;
    agentRunId: string | null;
    spentUsdc: string;
    error: string | null;
    attemptCount: number;
    recoveryCount: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  payerWallet: string | null;
  receiptIds: string[];
  proof: {
    status: "pending" | "verified" | "failed";
    transactionHash: string | null;
    blockNumber: number | null;
  } | null;
  links: {
    hostedRun: string;
    agentRun: string | null;
    receipts: string;
    receipt: string | null;
    passport: string | null;
    proofTransaction: string | null;
  };
};

const STAGES = [
  { value: "queued", label: "queued" },
  { value: "planning", label: "planning" },
  { value: "purchasing", label: "purchasing" },
  { value: "generating_receipt", label: "generating receipt" },
  { value: "publishing_onchain_proof", label: "publishing onchain proof" },
  { value: "completed", label: "completed" },
] as const;

const DEFAULT_TASK =
  "Buy one premium quote and create a verified Arc commerce proof.";

function stageIndex(stage: HostedJobView["job"]["progressStage"] | null) {
  if (stage === "failed") return -1;
  return STAGES.findIndex((item) => item.value === stage);
}

function proofStatusLabel(status: HostedJobView["proof"]) {
  if (!status) return null;
  if (status.status === "verified") return "Verified on Arc";
  if (status.status === "failed") return "Proof failed";
  return "Onchain proof pending";
}

export function HostedAgentRunner({
  initialJobId,
  diagnostic,
}: {
  initialJobId: string | null;
  diagnostic: HostedRunnerDiagnostic;
}) {
  const router = useRouter();
  const wallet = useArcWallet();
  const [task, setTask] = useState(DEFAULT_TASK);
  const [budget, setBudget] = useState("0.001");
  const [jobId, setJobId] = useState(initialJobId);
  const [jobView, setJobView] = useState<HostedJobView | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const completedPolls = useRef(0);

  const loadJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/hosted-agent/jobs/${id}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as HostedJobView & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load hosted run.");
    setJobView(data);
    setTask(data.job.task);
    setBudget(data.job.budgetUsdc);
    return data;
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const view = await loadJob(jobId);
        if (cancelled) return;
        setError(null);

        if (view.job.status === "failed") return;
        if (view.job.status === "completed") {
          completedPolls.current += 1;
          if (
            view.proof?.status === "verified" ||
            view.proof?.status === "failed" ||
            completedPolls.current >= 40
          ) {
            return;
          }
        }
        window.setTimeout(poll, 1_500);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        window.setTimeout(poll, 3_000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId, loadJob]);

  function resetIdempotency() {
    if (!jobId) idempotencyKey.current = null;
  }

  async function launch() {
    setLaunching(true);
    setError(null);
    completedPolls.current = 0;
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/hosted-agent/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          task,
          budgetUsdc: budget,
          requesterWallet: wallet.address,
        }),
      });
      const data = (await response.json()) as {
        jobId?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok || !data.jobId) {
        const retry = data.retryAfterSeconds
          ? ` Retry in about ${data.retryAfterSeconds}s.`
          : "";
        throw new Error(`${data.error ?? "Unable to launch hosted run."}${retry}`);
      }

      setJobId(data.jobId);
      router.replace(`/agent-runner?job=${data.jobId}`, { scroll: false });
      await loadJob(data.jobId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLaunching(false);
    }
  }

  function startNewRun() {
    setJobId(null);
    setJobView(null);
    setTask(DEFAULT_TASK);
    setBudget("0.001");
    setError(null);
    idempotencyKey.current = null;
    completedPolls.current = 0;
    router.replace("/agent-runner", { scroll: false });
  }

  const currentStage = jobView?.job.progressStage ?? null;
  const currentIndex = stageIndex(currentStage);
  const active = jobView?.job.status === "queued" || jobView?.job.status === "running";
  const completed = jobView?.job.status === "completed";
  const failed = jobView?.job.status === "failed";

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.75fr] lg:items-center">
          <div>
            <Badge className="mb-4">One-click Arc Testnet demo</Badge>
            <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">
              Run a real hosted buyer-agent
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Enter a task and budget, then watch the shared buyer-agent core plan,
              settle an allowlisted x402 payment, create a receipt, and publish the
              proof to Arc—all without cloning the repository.
            </p>
          </div>
          <Card className="rounded-lg">
            <CardContent className="grid gap-3 p-5 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4 text-primary" />
                Project-owned payer wallet
              </div>
              <p className="break-all font-mono text-xs">
                {diagnostic.payerAddress ?? "Hosted wallet not configured"}
              </p>
              <p className="text-muted-foreground">
                Arc Testnet only · max {diagnostic.maxBudgetUsdc} USDC · one active
                run · {diagnostic.rateLimitMaxRuns} launches per public rate window.
              </p>
              <p className="text-muted-foreground">
                A connected browser wallet is requester identity only. It never pays,
                signs an x402 authorization, or shares a private key.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Launch configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="hosted-task">Agent task</Label>
              <textarea
                id="hosted-task"
                value={task}
                onChange={(event) => {
                  setTask(event.target.value);
                  resetIdempotency();
                }}
                disabled={Boolean(jobId)}
                maxLength={500}
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              <p className="text-xs text-muted-foreground">{task.length}/500 characters</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hosted-budget">Maximum budget (USDC)</Label>
              <Input
                id="hosted-budget"
                type="number"
                min="0.001"
                max="0.005"
                step="0.0001"
                value={budget}
                onChange={(event) => {
                  setBudget(event.target.value);
                  resetIdempotency();
                }}
                disabled={Boolean(jobId)}
              />
              <p className="text-xs text-muted-foreground">
                The server enforces 0.001–0.005 USDC regardless of browser input.
              </p>
            </div>

            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Optional requester identity</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not the payer wallet; no signature or payment permission is requested.
                  </p>
                </div>
                {wallet.address ? (
                  <Badge variant="secondary" className="font-mono">
                    {shortenHash(wallet.address, 6)}
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void wallet.connect()}
                    disabled={!wallet.providerAvailable || wallet.connecting}
                  >
                    <Wallet />
                    {wallet.connecting ? "Connecting…" : "Connect identity"}
                  </Button>
                )}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {!jobId ? (
              <Button
                size="lg"
                onClick={() => void launch()}
                disabled={launching || !diagnostic.configured}
              >
                {launching ? <LoaderCircle className="animate-spin" /> : <Bot />}
                {launching ? "Queueing hosted run…" : "Run live demo agent"}
              </Button>
            ) : (
              <Button variant="outline" onClick={startNewRun} disabled={active}>
                <RotateCcw />
                Start another run
              </Button>
            )}

            <Button asChild variant="ghost">
              <Link href="/agent-setup">
                Use your own wallet with the local CLI
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Live execution progress</CardTitle>
              {jobView ? (
                <Badge variant={failed ? "destructive" : completed ? "default" : "secondary"}>
                  {jobView.job.status}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3">
              {STAGES.map((stage, index) => {
                const done = completed || (currentIndex >= 0 && index < currentIndex);
                const current = stage.value === currentStage;
                return (
                  <div key={stage.value} className="flex items-center gap-3 text-sm">
                    {done ? (
                      <Check className="size-5 text-primary" />
                    ) : current && active ? (
                      <LoaderCircle className="size-5 animate-spin text-primary" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground/40" />
                    )}
                    <span className={current || done ? "font-medium" : "text-muted-foreground"}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
              {failed ? (
                <div className="flex items-center gap-3 text-sm font-medium text-destructive">
                  <Circle className="size-5 fill-current" />
                  failed
                </div>
              ) : null}
            </div>

            {jobView ? (
              <div className="grid gap-2 rounded-md bg-secondary/30 p-4 text-sm">
                <p><span className="text-muted-foreground">Job ID:</span> <span className="font-mono">{jobView.job.id}</span></p>
                <p><span className="text-muted-foreground">Budget:</span> {jobView.job.budgetUsdc} USDC</p>
                <p><span className="text-muted-foreground">Spent:</span> {jobView.job.spentUsdc} USDC</p>
                {jobView.job.progressMessage ? <p>{jobView.job.progressMessage}</p> : null}
                {jobView.job.error ? <p className="text-destructive">{jobView.job.error}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Submit a task to create a durable queued job. This page polls its
                server-side progress automatically.
              </p>
            )}

            {completed && jobView ? (
              <div className="grid gap-3 border-t pt-5">
                <div className="flex items-center gap-2 font-semibold">
                  <BadgeCheck className="size-5 text-primary" />
                  Hosted commerce proof
                </div>
                <div className="flex flex-wrap gap-2">
                  {jobView.links.agentRun ? (
                    <Button asChild variant="outline"><Link href={jobView.links.agentRun}>Agent Run</Link></Button>
                  ) : null}
                  <Button asChild variant="outline"><Link href={jobView.links.receipts}>Commerce Receipts</Link></Button>
                  {jobView.links.receipt ? (
                    <Button asChild variant="outline"><Link href={jobView.links.receipt}><ReceiptText />Latest receipt</Link></Button>
                  ) : null}
                  {jobView.links.passport ? (
                    <Button asChild variant="outline"><Link href={jobView.links.passport}>Agent Passport</Link></Button>
                  ) : null}
                  {jobView.links.proofTransaction ? (
                    <Button asChild>
                      <a href={jobView.links.proofTransaction} target="_blank" rel="noreferrer">
                        Verified Arc proof <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                </div>
                {jobView.proof ? (
                  <p className="text-sm text-muted-foreground">
                    Proof status: <span className="font-medium text-foreground">{proofStatusLabel(jobView.proof)}</span>
                    {jobView.proof.transactionHash ? ` · ${shortenHash(jobView.proof.transactionHash, 8)}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
