/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  ListChecks,
  ReceiptText,
  Rocket,
  ShieldCheck,
  Store,
  XCircle,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDefaultProductionUrl,
  getReviewHealthStatus,
} from "@/lib/review/status";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Reviewer Pack | Arc Agent Commerce",
  description:
    "Arc Agent Commerce public review pack with demo links, health status, technical proof, and testnet notes.",
};

const productionUrl = getDefaultProductionUrl();
const demoTask = "Analyze tone and sentiment for a short builder update";
const demoCommand = `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${demoTask}" --limit 0.005`;
const reviewSmokeCommand = "npm run review:smoke";

const reviewChecklist = [
  {
    title: "Run a hosted workflow",
    body: "Choose Market Context, explicitly select BTC/USD, ETH/USD, or SOL/USD, preview the 0.001 USDC Pyth-backed service, and launch once.",
    href: "/agent-runner",
  },
  {
    title: "Read the Final Report",
    body: "Confirm it uses actual purchased API responses and exposes spend and reasoning.",
    href: "/results",
  },
  {
    title: "Verify the Arc proofs",
    body: "Inspect receipt, transaction hash, block, registry contract, and Arcscan links.",
    href: "/proofs",
  },
  {
    title: "Verify unpaid protection",
    body: "Call `/api/provider/pyth/price` without payment and confirm HTTP 402.",
    href: "/api/provider/pyth/price",
  },
];

const differenceItems = [
  "One connected-wallet USDC checkout for the complete workflow, followed by server-side downstream x402 purchases.",
  "Hosted workflow outcomes instead of a fixed paid smoke.",
  "Real user input with planner preview and budget decisions.",
  "Actual purchased API responses assembled into Final Reports.",
  "Optional FreeModel synthesis after deterministic paid API execution, with a fail-open structured fallback.",
  "A live provider-backed crypto price service sourced from Pyth Network.",
  "Seller-created services with safe mock fulfillment.",
  "Public receipts for paid API purchases.",
  "Agent Passports with workflows, reports, calls, proofs, spend, and success rate.",
  "Seller analytics for revenue-style usage proof.",
];

const technicalProofItems = [
  "Immutable server quotes separate the user payment, downstream provider cost, platform fee, and net revenue.",
  "Sponsored quota and paid transaction replay both resolve to one job; paid workflows that cannot start receive a workflow credit.",
  "Unpaid protected endpoints return HTTP 402.",
  "Paid runs create public reasoning timelines.",
  "Paid steps create shareable receipts.",
  "Passport and reputation stats rebuild from public run history.",
  "Seller analytics aggregates paid calls, buyer wallets, request IDs, and estimated USDC revenue.",
  "Each settled receipt is asynchronously attested in the app-owned AgentCommerceProofRegistry on Arc Testnet.",
];

const testnetNotes = [
  "Arc Testnet only.",
  "The browser never receives private keys.",
  "The connected browser wallet is the requester and confirms at most one native-USDC payment for a paid hosted workflow; sponsored quota remains free.",
  "The project-owned hosted payer separately buys downstream APIs through x402 after the user checkout settles.",
  "Hosted x402 signing runs only on the server with the project demo wallet; the local CLI remains the advanced own-wallet flow.",
  "The proof registry is an app-owned contract, not an infrastructure USDC, CCTP, or Gateway address.",
  "Validated workflow text may be processed by the external FreeModel LLM provider; keys and full prompts are never published.",
  "Occasional Supabase, Gateway, or network timeouts are handled with retry/backoff or safe empty states.",
];

function absoluteUrl(path: string) {
  return `${productionUrl}${path}`;
}

function StatusCard({
  title,
  ok,
  detail,
}: {
  title: string;
  ok: boolean;
  detail: string;
}) {
  const Icon = ok ? CheckCircle2 : XCircle;

  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon size={20} />
          </div>
          <Badge variant={ok ? "default" : "outline"}>{ok ? "Ready" : "Empty"}</Badge>
        </div>
        <p className="font-semibold">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LinkCard({
  title,
  href,
  detail,
  icon: Icon,
}: {
  title: string;
  href: string;
  detail: string;
  icon: typeof Store;
}) {
  const fullUrl = absoluteUrl(href);

  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon size={20} />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
          </div>
        </div>
        <p className="break-all rounded-md bg-muted/35 p-3 font-mono text-xs text-muted-foreground">
          {fullUrl}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={href}>
              Open
              <ArrowRight />
            </Link>
          </Button>
          <CopyButton value={fullUrl} label="Copy link" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ReviewPage() {
  await connection();
  const data = await getReviewHealthStatus(productionUrl);
  const latestRunHref = data.latestRun ? `/runs/${data.latestRun.id}` : "/runs";
  const latestReceiptHref = data.latestReceipt
    ? `/receipts/${data.latestReceipt.id}`
    : "/receipts";
  const mainPassportHref = data.mainProfile
    ? `/agents/${data.mainProfile.wallet}`
    : "/agents";
  const latestHostedWorkflowHref = data.latestHostedWorkflow?.href ?? "/agent-runner";

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Reviewer Readiness</Badge>
              <Badge variant="outline">Public submission pack</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-6xl">
              Review Arc Agent Commerce in under 2 minutes
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              Submit real input and the hosted agent selects and purchases
              allowlisted APIs through x402, generates a Final Report, creates
              commerce receipts, updates its Passport, and registers verified
              proofs in the app-owned registry on Arc.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/agent-runner">
                  Run a real-input agent workflow
                  <Bot />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/demo">
                  Guided Demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/launch">
                  Launch Pack
                  <Rocket />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/workflows">
                  Workflow Templates
                  <Store />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/receipts">
                  Receipts
                  <ReceiptText />
                </Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="default">Latest demo command</Badge>
                <Badge variant="outline">No private keys</Badge>
              </div>
              <CardTitle>Sentiment/tone review run</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Advanced own-wallet option. Reviewers can use the one-click
                hosted runner without cloning; neither browser flow exposes
                private keys or x402 signatures.
              </p>
              <div className="rounded-md border bg-muted/40 p-4">
                <code className="break-all font-mono text-sm">{demoCommand}</code>
              </div>
              <CopyButton value={demoCommand} label="Copy command" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
        {data.warnings.length > 0 ? (
          <Card className="rounded-lg">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Some live metadata is unavailable right now: {data.warnings.join("; ")}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatusCard
            title="Single workflow checkout"
            ok={data.checks.userPaidCheckoutEnabled}
            detail={data.checks.userPaidCheckoutEnabled ? `Immutable Arc Testnet quotes combine internal API cost with a ${data.checkout.platformFeeUsdc.toFixed(4)} USDC platform fee. ${data.checkout.sponsoredQuota} sponsored run(s) per requester wallet remain available before paid checkout.` : "Hosted user checkout is not configured."}
          />
          <StatusCard
            title="Latest successful run"
            ok={data.checks.latestSuccessfulRunExists}
            detail={
              data.latestRun
                ? `${data.latestRun.status}; spent ${data.latestRun.spent_usdc} USDC`
                : "No run visible yet. Run the demo command to create one."
            }
          />
          <StatusCard
            title="Latest receipt"
            ok={Boolean(data.latestReceipt)}
            detail={
              data.latestReceipt
                ? `${data.latestReceipt.serviceName}; ${data.latestReceipt.amountUsdc} USDC`
                : "No paid receipt visible yet. Paid steps become receipts."
            }
          />
          <StatusCard
            title="Verified on Arc"
            ok={data.checks.verifiedProofExists}
            detail={
              data.checks.verifiedProofExists
                ? `${data.checks.verifiedProofCount} verified proof(s); ${data.checks.pendingProofCount} pending, ${data.checks.failedProofCount} failed.`
                : "No verified proof is visible yet. Run the paid smoke flow."
            }
          />
          <StatusCard
            title="Workflow-first product"
            ok={
              data.checks.hostedRealInputWorkflowsEnabled &&
              data.checks.hostedInputPrivacyEnabled &&
              data.checks.workflowFirstProductEnabled &&
              data.checks.publicWorkflowPagesEnabled
            }
            detail="Hosted browser execution is primary; templates, Final Reports, and Arc proofs have dedicated public pages while full input remains ephemeral."
          />
          <StatusCard
            title="Seller-created live service"
            ok={data.checks.sellerCreatedLiveServiceExists}
            detail={
              data.checks.sellerCreatedLiveServiceExists
                ? `${data.checks.sellerCreatedLiveServiceCount} live seller-created service(s) in discovery.`
                : "No live seller-created service is visible to the public store."
            }
          />
          <StatusCard
            title="API Store services"
            ok={data.checks.apiStoreServiceCount > 0}
            detail={`${data.checks.apiStoreServiceCount} public service(s) available. Disabled smoke-test services are hidden from public discovery.`}
          />
          <StatusCard
            title="Live Provider · Pyth Network"
            ok={data.checks.liveProviderEnabled}
            detail={data.checks.liveProviderEnabled ? "Authenticated server-side Hermes adapter maps explicit BTC/USD, ETH/USD, and SOL/USD choices to fixed feeds, rejects stale updates, and reports confidence interval plus price age. The agent pays Arc Agent Commerce through x402; Pyth supplies the underlying data." : "Pyth provider key or hosted service allowlist is not configured."}
          />
          <StatusCard
            title="AI synthesis · FreeModel"
            ok={data.checks.llmSynthesisConfigured}
            detail={data.checks.llmSynthesisConfigured ? `OpenAI-compatible external synthesis is configured with ${data.llm.model ?? "the configured model"}. Service selection, x402 payment, receipts, and Arc proofs remain deterministic; model failures preserve the structured fallback.` : "FreeModel synthesis is not configured. Hosted workflows keep the deterministic structured report."}
          />
        </section>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={data.proofRegistry.configured ? "default" : "outline"}>
                {data.proofRegistry.configured ? "Registry active" : "Registry unavailable"}
              </Badge>
              <Badge variant="secondary">Arc Testnet {data.proofRegistry.chainId}</Badge>
            </div>
            <CardTitle>App-owned AgentCommerceProofRegistry</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <dl className="grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Contract address</dt>
                <dd className="mt-1 break-all font-mono">
                  {data.proofRegistry.registryAddress ?? "n/a"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attester address</dt>
                <dd className="mt-1 break-all font-mono">
                  {data.proofRegistry.attesterAddress ?? "n/a"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {data.proofRegistry.registryAddress ? (
                <Button asChild variant="outline">
                  <a
                    href={`${data.proofRegistry.explorerUrl}/address/${data.proofRegistry.registryAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    Contract on Arcscan
                  </a>
                </Button>
              ) : null}
              {data.proofRegistry.registryAddress ? (
                <CopyButton
                  value={data.proofRegistry.registryAddress}
                  label="Copy contract"
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Demo health</Badge>
              {data.checks.recentInsufficientBalanceFailures > 0 ? (
                <Badge variant="outline">Recent balance warning</Badge>
              ) : (
                <Badge variant="default">Reviewer-safe</Badge>
              )}
            </div>
            <CardTitle>Recommended reviewer run</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-3 text-sm leading-6 text-muted-foreground">
              <p>
                Successful run: {data.checks.latestSuccessfulRunExists ? "available" : "not yet"} /
                latest receipt: {data.checks.latestReceiptExists ? "available" : "not yet"} /
                seller-created service: {data.checks.sellerCreatedLiveServiceExists ? "live" : "missing"}.
              </p>
              {data.checks.recentInsufficientBalanceFailures > 0 ? (
                <p>
                  Recent failed run(s) appear to be testnet/Gateway balance
                  failures. Use the stable sentiment command below or fund more
                  Gateway balance through the advanced Developer Tools flow.
                </p>
              ) : null}
              <div className="rounded-md border bg-muted/40 p-4">
                <code className="break-all font-mono text-sm">{data.recommendedCommand}</code>
              </div>
            </div>
            <CopyButton value={data.recommendedCommand} label="Copy command" />
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>Run local review smoke</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm leading-6 text-muted-foreground">
                This command checks the public pages, JSON endpoints, unpaid
                HTTP 402 behavior, and the decoded x402 payment challenge.
              </p>
              <div className="mt-3 rounded-md border bg-muted/40 p-4">
                <code className="break-all font-mono text-sm">{reviewSmokeCommand}</code>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <CopyButton value={reviewSmokeCommand} label="Copy command" />
              <Button asChild variant="outline">
                <Link href="/api/review/status">
                  Status JSON
                  <ExternalLink />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>How to review this demo in 2 minutes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {reviewChecklist.map((item, index) => (
              <div className="flex gap-3 rounded-md border bg-background p-4" key={item.title}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs text-secondary-foreground">
                  {index + 1}
                </span>
                <div>
                  <Link href={item.href} className="font-semibold text-primary hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <section id="live-links" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <LinkCard
            title="Guided Demo"
            href="/demo"
            detail="Narrative two-minute walkthrough."
            icon={ClipboardCheck}
          />
          <LinkCard
            title="Launch Pack"
            href="/launch"
            detail="Submission copy, X thread outline, and recording checklist."
            icon={Rocket}
          />
          <LinkCard
            title="Workflow Templates"
            href="/workflows"
            detail="Supported inputs, estimated prices, paid services, and expected reports."
            icon={Store}
          />
          <LinkCard
            title="Results"
            href="/results"
            detail="Hosted Final Reports assembled from paid API responses."
            icon={Bot}
          />
          <LinkCard
            title="Arc Proofs"
            href="/proofs"
            detail="Verified, pending, and failed registry records with Arcscan links."
            icon={ShieldCheck}
          />
          <LinkCard
            title="Developer Tools"
            href="/developer-tools"
            detail="API Store, planner inspection, wallet launch, and local CLI setup."
            icon={Store}
          />
          <LinkCard
            title="Latest Hosted Report"
            href={latestHostedWorkflowHref}
            detail={
              data.latestHostedWorkflow
                ? `${data.latestHostedWorkflow.spentUsdc} USDC · ${data.latestHostedWorkflow.proofCount} Arc proof(s)`
                : "Launch a useful hosted workflow."
            }
            icon={Bot}
          />
          <LinkCard
            title="Latest Run"
            href={latestRunHref}
            detail={
              data.latestRun
                ? shortenHash(data.latestRun.id, 6)
                : "Fallback to all public runs."
            }
            icon={ListChecks}
          />
          <LinkCard
            title="Latest Receipt"
            href={latestReceiptHref}
            detail={
              data.latestReceipt
                ? data.latestReceipt.serviceName
                : "Fallback to all public receipts."
            }
            icon={ReceiptText}
          />
          <LinkCard
            title="Main Agent Passport"
            href={mainPassportHref}
            detail={
              data.mainProfile
                ? shortenHash(data.mainProfile.wallet, 6)
                : "Fallback to Agent Passport list."
            }
            icon={BadgeCheck}
          />
          <LinkCard
            title="Seller Analytics / Login"
            href="/seller/analytics"
            detail="Protected seller analytics surface; redirects to login without session."
            icon={ChartNoAxesCombined}
          />
          <LinkCard
            title="Review Status API"
            href="/api/review/status"
            detail="Public read-only health JSON for automated smoke checks."
            icon={ShieldCheck}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>What makes this different</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {differenceItems.map((item) => (
                <p className="flex gap-3 text-sm leading-6 text-muted-foreground" key={item}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>Technical proof</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {technicalProofItems.map((item) => (
                <p className="flex gap-3 text-sm leading-6 text-muted-foreground" key={item}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>Known testnet notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {testnetNotes.map((item) => (
                <p className="flex gap-3 text-sm leading-6 text-muted-foreground" key={item}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </p>
              ))}
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
