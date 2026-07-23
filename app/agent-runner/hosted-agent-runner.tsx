/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Bot, Calculator, Check, CreditCard, LoaderCircle, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { shortenHash } from "@/lib/utils";
import { humanizeError } from "@/lib/errors/humanize-error";
import {
  HOSTED_REQUESTER_IDENTITY_LABEL,
  HOSTED_REQUESTER_NOT_CHARGED_COPY,
  HOSTED_REQUESTER_PAYMENT_COPY,
  hostedInputPreviewHelper,
} from "@/lib/agent/hosted-ui";
import {
  getHostedWorkflowTemplate,
  hostedWorkflowTemplates,
} from "@/lib/agent/workflow-templates";
import type {
  HostedPlannerSnapshot,
  HostedWorkflowQuote,
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
  const budget = "0.005";
  const [plan, setPlan] = useState<HostedPlannerSnapshot | null>(null);
  const [quote, setQuote] = useState<HostedWorkflowQuote | null>(null);
  const [sponsoredAuthorizationMessage, setSponsoredAuthorizationMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [historyFilter, setHistoryFilter] = useState<HostedWorkflowType | "all">("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const paymentTransactionHash = useRef<string | null>(null);
  const sponsoredSignature = useRef<string | null>(null);
  const inputHelper = hostedInputPreviewHelper(inputText);

  function invalidatePlan() {
    setPlan(null);
    setQuote(null);
    setSponsoredAuthorizationMessage(null);
    setError(null);
    idempotencyKey.current = null;
    paymentTransactionHash.current = null;
    sponsoredSignature.current = null;
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
    if (!wallet.address) {
      setError("Connect a wallet before creating the immutable workflow quote.");
      return null;
    }
    setPreviewing(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/hosted-agent/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({ ...requestBody(), requesterWallet: wallet.address }),
      });
      const data = (await response.json()) as {
        quote?: HostedWorkflowQuote;
        sponsoredAuthorizationMessage?: string | null;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok || !data.quote) {
        const retry = data.retryAfterSeconds ? ` Retry in about ${data.retryAfterSeconds}s.` : "";
        throw new Error(`${data.error ?? "Unable to create workflow quote."}${retry}`);
      }
      setPlan(data.quote.plan);
      setQuote(data.quote);
      setSponsoredAuthorizationMessage(data.sponsoredAuthorizationMessage ?? null);
      return data.quote.plan;
    } catch (caught) {
      setPlan(null);
      setQuote(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setPreviewing(false);
    }
  }

  async function launch() {
    if (!plan || !quote || !wallet.address || !idempotencyKey.current) return;
    setLaunching(true);
    setError(null);
    try {
      if (Date.parse(quote.expiresAt) <= Date.now()) {
        throw new Error("The workflow quote expired. Refresh the exact price before paying.");
      }
      if (wallet.address.toLowerCase() !== quote.requesterWallet.toLowerCase()) {
        throw new Error("The connected wallet differs from the wallet bound to this quote.");
      }

      if (quote.paymentMode === "paid" && !paymentTransactionHash.current) {
        if (!wallet.isArcTestnet) await wallet.switchToArc();
        paymentTransactionHash.current = await wallet.sendWorkflowPayment({
          treasuryAddress: quote.treasuryAddress,
          amountUsdc: quote.pricing.amountDueUsdc,
        });
      }
      if (quote.paymentMode === "sponsored" && !sponsoredSignature.current) {
        if (!sponsoredAuthorizationMessage) {
          throw new Error("Sponsored workflow authorization is unavailable.");
        }
        sponsoredSignature.current = await wallet.signMessage(
          sponsoredAuthorizationMessage,
        );
      }

      const response = await fetch(`/api/hosted-agent/quotes/${quote.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          ...requestBody(),
          transactionHash: paymentTransactionHash.current,
          signature: sponsoredSignature.current,
        }),
      });
      const data = (await response.json()) as {
        jobId?: string | null;
        error?: string;
        retryAfterSeconds?: number;
        creditIssued?: boolean;
      };
      if (data.creditIssued) {
        throw new Error(data.error ?? "The payment was converted to a workflow credit.");
      }
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

  const humanized = error ? humanizeError(error) : null;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Badge className="mb-4">Create verified agent report · Arc Testnet</Badge>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">New Report</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Select a workflow, provide your input, preview the total price, and generate a verified report.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Workflow input</CardTitle></CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="workflow-type">Workflow</Label>
              <select
                id="workflow-type"
                value={workflowType}
                onChange={(event) => selectWorkflow(event.target.value as HostedWorkflowType)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                {hostedWorkflowTemplates.map((workflow) => (
                  <option key={workflow.value} value={workflow.value}>{workflow.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{getHostedWorkflowTemplate(workflowType)?.description}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hosted-input">Input text</Label>
              <textarea
                id="hosted-input"
                aria-describedby="hosted-input-description hosted-input-helper external-llm-processing-notice"
                value={inputText}
                onChange={(event) => { setInputText(event.target.value); invalidatePlan(); }}
                placeholder={getHostedWorkflowTemplate(workflowType)?.placeholder}
                minLength={20}
                maxLength={5000}
                required
                className="min-h-36 max-w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <p id="hosted-input-description" className="text-xs text-muted-foreground">
                {inputText.length}/5000 · Required. Obvious credentials and private keys are rejected. Only a redacted preview and SHA-256 are published.
              </p>
              <div id="external-llm-processing-notice" role="note" className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
                External LLM processing: after paid API calls succeed, the validated input text and those API responses may be sent to FreeModel for optional synthesis. If FreeModel is unavailable, the deterministic report is preserved.
              </div>
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
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{HOSTED_REQUESTER_IDENTITY_LABEL} <span className="font-normal text-muted-foreground">(required)</span></p>
                  <p className="mt-1 text-xs font-semibold">{HOSTED_REQUESTER_NOT_CHARGED_COPY}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{HOSTED_REQUESTER_PAYMENT_COPY}</p>
                </div>
                {wallet.address ? (
                  <Badge variant="secondary" className="font-mono">{shortenHash(wallet.address, 6)}</Badge>
                ) : (
                  <Button type="button" variant="outline" onClick={() => void wallet.connect()} disabled={!wallet.providerAvailable || wallet.connecting}>
                    <Wallet />{wallet.connecting ? "Connecting…" : "Connect Wallet"}
                  </Button>
                )}
              </div>
            </div>
            {humanized ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex flex-col gap-2">
                  <h4 className="font-semibold text-destructive">{humanized.title}</h4>
                  <p className="text-sm text-destructive/90">{humanized.message}</p>
                  {humanized.actionLabel ? (
                    <div className="mt-1">
                      {humanized.actionHref ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={humanized.actionHref}>{humanized.actionLabel}</Link>
                        </Button>
                      ) : humanized.actionLabel === "Switch Wallet" ? (
                        <Button size="sm" variant="outline" onClick={() => void wallet.switchToArc()}>
                          Switch Wallet
                        </Button>
                      ) : humanized.actionLabel === "Refresh Price" ? (
                        <Button size="sm" variant="outline" onClick={() => void preview()}>
                          Refresh Price
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setError(null)}>
                          {humanized.actionLabel}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {inputHelper ? <p id="hosted-input-helper" role="status" className="text-sm font-medium text-amber-300">{inputHelper}</p> : <span id="hosted-input-helper" className="sr-only">Input is ready for workflow preview.</span>}
            <Button
              size="lg"
              variant={plan ? "outline" : "default"}
              onClick={() => void preview()}
              disabled={previewing || launching || !diagnostic.configured || !diagnostic.checkout.configured || !wallet.address || inputText.trim().length < 20}
            >
              {previewing ? <LoaderCircle className="animate-spin" /> : <Calculator />}
              {previewing ? "Locking exact quote…" : quote ? "Refresh workflow quote" : "Preview exact workflow price"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Report Quote</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {!quote || !plan ? (
                <p className="text-sm text-muted-foreground">
                  Select a workflow and add your input to see the final price.
                </p>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold">{plan.workflowLabel}</h3>
                  </div>
                  <div className="rounded-md border bg-secondary/20 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Includes</p>
                    <ul className="grid gap-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        <span>Live market data / compute</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        <span>Text analysis</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        <span>Shareable report</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        <span>Arc verification</span>
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-md bg-secondary/30 p-4">
                    <p className="text-2xl font-bold">
                      {quote.paymentMode === "sponsored"
                        ? "Total: 0 USDC · Sponsored run"
                        : `Total: ${quote.pricing.amountDueUsdc.toFixed(3)} USDC`}
                    </p>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => void launch()}
                    disabled={launching || previewing || plan.selectedServices.length === 0}
                  >
                    {launching ? (
                      <LoaderCircle className="animate-spin" />
                    ) : quote.paymentMode === "sponsored" ? (
                      <Bot />
                    ) : (
                      <CreditCard />
                    )}
                    {launching
                      ? paymentTransactionHash.current
                        ? "Confirming existing payment…"
                        : "Confirming workflow checkout…"
                      : quote.paymentMode === "sponsored"
                      ? "Generate Sponsored Report"
                      : `Pay ${quote.pricing.amountDueUsdc.toFixed(3)} USDC & Generate Report`}
                  </Button>

                  <details className="mt-4 rounded-md border p-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
                      Technical details
                    </summary>
                    <div className="mt-3 grid gap-2 text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Project Payer:</span>{" "}
                        <code className="break-all">{diagnostic.payerAddress ?? "Unavailable"}</code>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Treasury Address:</span>{" "}
                        <code className="break-all">{quote.treasuryAddress}</code>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Provider Cost:</span>{" "}
                        <span className="font-mono">{quote.pricing.estimatedProviderCostUsdc.toFixed(4)} USDC</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Platform Fee:</span>{" "}
                        <span className="font-mono">{quote.pricing.platformFeeUsdc.toFixed(4)} USDC</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Quote Expiration:</span>{" "}
                        <span>{new Date(quote.expiresAt).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Input Hash (SHA-256):</span>{" "}
                        <code className="break-all">{plan.inputSha256}</code>
                      </div>
                      {idempotencyKey.current ? (
                        <div>
                          <span className="font-medium text-foreground">Idempotency Key:</span>{" "}
                          <code className="break-all">{idempotencyKey.current}</code>
                        </div>
                      ) : null}
                      <div>
                        <span className="font-medium text-foreground">Arc Chain ID:</span>{" "}
                        <span>{quote.chainId}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Raw Service Methods & Endpoints ({plan.selectedServices.length}):</span>
                        <ul className="mt-1 grid gap-1 font-mono text-[11px]">
                          {plan.selectedServices.map((service) => (
                            <li key={service.slug} className="break-all">
                              {service.name} ({service.priceUsdc.toFixed(4)} USDC) — {service.method} {service.endpoint}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {plan.skippedServices.length ? (
                        <div>
                          <span className="font-medium text-foreground">Skipped Services:</span>{" "}
                          <span>{plan.skippedServices.map((s) => s.name).join(", ")}</span>
                        </div>
                      ) : null}
                      {error ? (
                        <div>
                          <span className="font-medium text-destructive">Raw Error:</span>{" "}
                          <code className="break-all text-destructive">{error}</code>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Recent hosted workflows</CardTitle>
                <select
                  aria-label="Filter hosted results by workflow"
                  value={historyFilter}
                  onChange={(event) => void filterHistory(event.target.value as HostedWorkflowType | "all")}
                  disabled={historyLoading}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="all">All workflows</option>
                  {hostedWorkflowTemplates.map((workflow) => (
                    <option key={workflow.value} value={workflow.value}>{workflow.label}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {historyLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />Filtering history…
                </p>
              ) : history.length ? (
                history.map((job) => (
                  <Link key={job.id} href={job.href} className="rounded-md border p-3 transition-colors hover:bg-secondary/30">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{workflowLabel(job.workflowType)}</p>
                      <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{job.inputPreview || job.task}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{job.spentUsdc} USDC · {job.receiptCount} receipts · {job.proofCount} Arc proofs</p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hosted workflow history for this filter.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

