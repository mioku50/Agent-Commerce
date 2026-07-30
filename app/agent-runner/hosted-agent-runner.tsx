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
  curatedHostedWorkflowTemplates,
} from "@/lib/agent/workflow-templates";
import { parseGitHubRepositoryInput } from "@/lib/providers/github-repository-ref";
import type {
  HostedPlannerSnapshot,
  HostedWorkflowQuote,
  PythMarketSymbol,
  HostedRunnerDiagnostic,
  HostedWorkflowType,
  RecentHostedJob,
} from "./types";

export function HostedAgentRunner({
  diagnostic,
  initialHistory: _initialHistory,
  initialWorkflowType,
  initialMarketSymbol,
  initialRepository,
}: {
  diagnostic: HostedRunnerDiagnostic;
  initialHistory?: RecentHostedJob[];
  initialWorkflowType: HostedWorkflowType;
  initialMarketSymbol: PythMarketSymbol;
  initialRepository?: string;
}) {
  const router = useRouter();
  const wallet = useArcWallet();
  const initial =
    curatedHostedWorkflowTemplates.find(
      (workflow) => workflow.value === initialWorkflowType,
    ) ?? curatedHostedWorkflowTemplates[0];
  const [workflowType, setWorkflowType] = useState<HostedWorkflowType>(initial.value);
  const [task, setTask] = useState(initial.task);
  const [inputText, setInputText] = useState(initialRepository ?? "");
  const [agentId, setAgentId] = useState("");
  const [agentWallet, setAgentWallet] = useState("");
  const [agentRepositoryUrl, setAgentRepositoryUrl] = useState(
    initialWorkflowType === "agent_trust_report" ? initialRepository ?? "" : "",
  );
  const [contractAddress, setContractAddress] = useState("");
  const [serviceEndpoint, setServiceEndpoint] = useState("");
  const [marketSymbol, setMarketSymbol] = useState<PythMarketSymbol>(initialMarketSymbol);
  const budget = "0.005";
  const [plan, setPlan] = useState<HostedPlannerSnapshot | null>(null);
  const [quote, setQuote] = useState<HostedWorkflowQuote | null>(null);
  const [sponsoredAuthorizationMessage, setSponsoredAuthorizationMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const paymentTransactionHash = useRef<string | null>(null);
  const sponsoredSignature = useRef<string | null>(null);

  let repositoryRef: ReturnType<typeof parseGitHubRepositoryInput> | null = null;
  if (workflowType === "github_due_diligence" && inputText.trim()) {
    try {
      repositoryRef = parseGitHubRepositoryInput(inputText);
    } catch {
      repositoryRef = null;
    }
  }

  let agentRepositoryRef: ReturnType<typeof parseGitHubRepositoryInput> | null = null;
  if (workflowType === "agent_trust_report" && agentRepositoryUrl.trim()) {
    try {
      agentRepositoryRef = parseGitHubRepositoryInput(agentRepositoryUrl);
    } catch {
      agentRepositoryRef = null;
    }
  }
  const agentIdValid = !agentId.trim() || /^agt_[a-z0-9]{20}$/.test(agentId.trim());
  const agentWalletValid =
    !agentWallet.trim() || /^0x[0-9a-fA-F]{40}$/.test(agentWallet.trim());
  const contractAddressValid =
    !contractAddress.trim() || /^0x[0-9a-fA-F]{40}$/.test(contractAddress.trim());
  const serviceEndpointValid = (() => {
    if (!serviceEndpoint.trim()) return true;
    try {
      const url = new URL(serviceEndpoint.trim());
      return url.protocol === "https:" && !/^(?:localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(url.hostname);
    } catch {
      return false;
    }
  })();
  const hasAgentTrustPrimaryInput =
    Boolean(agentId.trim()) ||
    Boolean(agentWallet.trim()) ||
    Boolean(agentRepositoryUrl.trim());
  const isInputValid =
    workflowType === "github_due_diligence"
      ? Boolean(repositoryRef)
      : workflowType === "agent_trust_report"
        ? hasAgentTrustPrimaryInput &&
          agentIdValid &&
          agentWalletValid &&
          contractAddressValid &&
          serviceEndpointValid &&
          (!agentRepositoryUrl.trim() || Boolean(agentRepositoryRef))
        : inputText.trim().length >= 20;

  const inputHelper = workflowType === "agent_trust_report"
    ? !hasAgentTrustPrimaryInput
      ? "Provide at least one Agent ID, agent wallet, or public GitHub repository."
      : !agentIdValid
        ? "Check the public Agent ID. Use the agt_ identifier shown in Veyra."
        : !agentWalletValid
          ? "Check the agent wallet. It must be a valid EVM address."
          : agentRepositoryUrl.trim() && !agentRepositoryRef
            ? "Check the public GitHub repository URL."
            : !contractAddressValid
              ? "Check the Arc Testnet contract address."
              : !serviceEndpointValid
                ? "Use a public HTTPS service endpoint. Local and private networks are blocked."
                : null
    : workflowType === "github_due_diligence"
    ? !inputText.trim()
      ? "Enter a public GitHub repository URL (e.g. github.com/owner/repository)."
      : !repositoryRef
      ? "Enter a valid public GitHub repository in owner/repository format."
      : null
    : hostedInputPreviewHelper(inputText);

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
    const workflow =
      curatedHostedWorkflowTemplates.find(
        (template) => template.value === value,
      ) ?? curatedHostedWorkflowTemplates[0];
    setWorkflowType(workflow.value);
    setTask(workflow.task);
    invalidatePlan();
  }

  function requestBody() {
    return {
      workflowType,
      task,
      inputText,
      agentTrustInput:
        workflowType === "agent_trust_report"
          ? {
              agentId: agentId.trim() || undefined,
              agentWallet: agentWallet.trim() || undefined,
              repositoryUrl: agentRepositoryUrl.trim() || undefined,
              contractAddress: contractAddress.trim() || undefined,
              serviceEndpoint: serviceEndpoint.trim() || undefined,
            }
          : undefined,
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
                {curatedHostedWorkflowTemplates.map((workflow) => (
                  <option key={workflow.value} value={workflow.value}>{workflow.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{getHostedWorkflowTemplate(workflowType)?.description}</p>
            </div>
            {workflowType === "agent_trust_report" ? (
              <div className="grid gap-4">
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="font-semibold">Verify an AI agent before you use, pay, or integrate it.</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Start with any one primary identifier. Add optional public signals for a broader, evidence-backed report.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="agent-trust-agent-id">Agent ID</Label>
                  <input
                    id="agent-trust-agent-id"
                    value={agentId}
                    onChange={(event) => { setAgentId(event.target.value); invalidatePlan(); }}
                    placeholder="agt_…"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Public Veyra Agent ID. One primary identifier is required.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="agent-trust-wallet">Agent wallet</Label>
                  <input
                    id="agent-trust-wallet"
                    value={agentWallet}
                    onChange={(event) => { setAgentWallet(event.target.value); invalidatePlan(); }}
                    placeholder="0x…"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Public EVM address associated with the agent.</p>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="agent-trust-repository">GitHub repository</Label>
                    {agentRepositoryRef ? <Badge variant="secondary" className="font-mono text-xs">{agentRepositoryRef.fullName}</Badge> : null}
                  </div>
                  <input
                    id="agent-trust-repository"
                    value={agentRepositoryUrl}
                    onChange={(event) => { setAgentRepositoryUrl(event.target.value); invalidatePlan(); }}
                    placeholder="https://github.com/owner/repository"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Public repository only. Enables the full GitHub Due Diligence evidence pipeline.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="agent-trust-contract">Arc contract <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <input
                      id="agent-trust-contract"
                      value={contractAddress}
                      onChange={(event) => { setContractAddress(event.target.value); invalidatePlan(); }}
                      placeholder="0x…"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="agent-trust-endpoint">Service endpoint <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <input
                      id="agent-trust-endpoint"
                      value={serviceEndpoint}
                      onChange={(event) => { setServiceEndpoint(event.target.value); invalidatePlan(); }}
                      placeholder="https://api.example.com/health"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
                <div id="external-llm-processing-notice" role="note" className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
                  <p className="font-semibold">Public evidence only</p>
                  <p className="mt-1">Do not submit secrets or credentials. Private and local endpoints are blocked, and tenant-private history is never exposed.</p>
                </div>
              </div>
            ) : workflowType === "github_due_diligence" ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="hosted-input">Repository URL</Label>
                  {repositoryRef ? (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {repositoryRef.fullName}
                    </Badge>
                  ) : null}
                </div>
                <input
                  type="text"
                  id="hosted-input"
                  aria-describedby="hosted-input-description hosted-input-helper external-llm-processing-notice"
                  value={inputText}
                  onChange={(event) => { setInputText(event.target.value); invalidatePlan(); }}
                  placeholder="https://github.com/owner/repository"
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div id="hosted-input-description" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Public GitHub repositories only.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const demoRepo = process.env.NEXT_PUBLIC_GITHUB_DEMO_REPOSITORY || "https://github.com/circlefin/developer-controlled-wallets-web-sdk";
                      setInputText(demoRepo);
                      invalidatePlan();
                    }}
                    className="font-medium text-primary hover:underline cursor-pointer"
                  >
                    Try Example
                  </button>
                </div>
                {repositoryRef ? (
                  <div className="text-xs text-muted-foreground">
                    Normalized: <code className="font-mono">github.com/{repositoryRef.fullName}</code>
                  </div>
                ) : null}
              </div>
            ) : (
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
                  {inputText.length}/5000 · Required. Credentials and private keys are rejected. Sensitive details are automatically redacted.
                </p>
                <div id="external-llm-processing-notice" role="note" className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
                  <p className="font-semibold">AI processing</p>
                  <p className="mt-1">Your input may be processed by an external AI provider to prepare the report. Do not submit private keys, passwords, API keys, or other secrets.</p>
                </div>
              </div>
            )}
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
                  Choose the market asset to include in your report.
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
                      ) : humanized.action === "switch_network" || humanized.actionLabel === "Switch Network" ? (
                        <Button size="sm" variant="outline" onClick={() => void wallet.switchToArc()}>
                          {humanized.actionLabel}
                        </Button>
                      ) : humanized.action === "switch_wallet" || humanized.actionLabel === "How to Switch Wallet" || humanized.actionLabel === "Switch Wallet" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            alert("Open your wallet extension (MetaMask/Rabby) and select the registered account.");
                          }}
                        >
                          {humanized.actionLabel}
                        </Button>
                      ) : humanized.action === "refresh_price" || humanized.actionLabel === "Refresh Price" ? (
                        <Button size="sm" variant="outline" onClick={() => void preview()}>
                          {humanized.actionLabel}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setError(null)}>
                          {humanized.actionLabel}
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {humanized.technicalCode ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
                      <code>{humanized.technicalCode}</code>
                    </details>
                  ) : null}
                </div>
              </div>
            ) : null}
            {inputHelper ? <p id="hosted-input-helper" role="status" className="text-sm font-medium text-amber-300">{inputHelper}</p> : <span id="hosted-input-helper" className="sr-only">Input is ready for workflow preview.</span>}
            <Button
              size="lg"
              variant={plan ? "outline" : "default"}
              onClick={() => void preview()}
              disabled={previewing || launching || !diagnostic.configured || !diagnostic.checkout.configured || !wallet.address || !isInputValid}
            >
              {previewing ? <LoaderCircle className="animate-spin" /> : <Calculator />}
              {previewing ? "Preparing Price…" : quote ? "Refresh Price" : "See Final Price"}
            </Button>
            <div className="pt-1">
              <Link href="/results" className="text-xs text-muted-foreground hover:text-foreground">
                View previous reports →
              </Link>
            </div>
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
                      {workflowType === "agent_trust_report" ? (
                        <>
                          {agentId.trim() || agentWallet.trim() ? (
                            <li className="flex items-center gap-2">
                              <Check className="size-4 text-emerald-500" />
                              <span>Veyra registry identity and policy signals</span>
                            </li>
                          ) : null}
                          {agentRepositoryRef ? (
                            <li className="flex items-center gap-2">
                              <Check className="size-4 text-emerald-500" />
                              <span>GitHub repository intelligence and due diligence</span>
                            </li>
                          ) : (
                            <li className="text-xs">GitHub evidence will be marked unavailable because no repository was provided.</li>
                          )}
                          {contractAddress.trim() ? (
                            <li className="flex items-center gap-2">
                              <Check className="size-4 text-emerald-500" />
                              <span>Read-only Arc Testnet contract snapshot</span>
                            </li>
                          ) : (
                            <li className="text-xs">Contract transparency will be excluded from scoring.</li>
                          )}
                          {serviceEndpoint.trim() ? (
                            <li className="flex items-center gap-2">
                              <Check className="size-4 text-emerald-500" />
                              <span>Protected endpoint availability snapshot</span>
                            </li>
                          ) : (
                            <li className="text-xs">Endpoint availability will be marked not provided.</li>
                          )}
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Deterministic Trust Score, receipts, and real Arc proof status</span>
                          </li>
                        </>
                      ) : workflowType === "github_due_diligence" ? (
                        <>
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Live repository data</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Activity and contributor analysis</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Documentation and release review</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Shareable report</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-500" />
                            <span>Arc verification</span>
                          </li>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
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
                      <p className="mb-2 font-medium text-amber-300/80">These details are intended for developers and auditors.</p>
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
        </div>
      </section>
    </main>
  );
}
