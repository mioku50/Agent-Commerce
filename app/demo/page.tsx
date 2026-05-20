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
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Fuel,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchRecentAgentRuns,
  type PublicAgentRun,
} from "@/lib/agent/runs-public";
import {
  listAgentProfiles,
  type PublicAgentProfile,
} from "@/lib/agent/passport-persistence";
import {
  fetchRecentReceipts,
  type CommerceReceipt,
} from "@/lib/commerce/receipts";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Guided Demo | Arc Agent Commerce",
  description:
    "A two-minute guided showcase for Arc Agent Commerce, buyer-agent paid API purchases, public receipts, and Agent Passports.",
};

const demoTask = "Analyze tone and sentiment for a short builder update";
const demoBudget = "0.005";
const demoCommand = `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${demoTask}" --limit ${demoBudget}`;

type LiveProof = {
  run: PublicAgentRun | null;
  receipt: CommerceReceipt | null;
  profile: PublicAgentProfile | null;
  warning: string | null;
};

const walkthrough = [
  {
    step: "Step 1",
    title: "Browse API Store",
    href: "/store",
    icon: Store,
    body: "Inspect official and seller-created APIs, prices, endpoints, schemas, and x402 payment expectations.",
  },
  {
    step: "Step 2",
    title: "Plan a buyer-agent run",
    href: "/agent-control",
    icon: Bot,
    body: "Dry-run the task and budget so the planner explains which services it would buy or skip.",
  },
  {
    step: "Step 3",
    title: "Fund buyer-agent wallet",
    href: "/agent-launch",
    icon: Fuel,
    body: "Connect an Arc Testnet wallet, check USDC balances, and send testnet USDC to the local buyer-agent wallet.",
  },
  {
    step: "Step 4",
    title: "Run local CLI agent",
    href: "#demo-command",
    icon: ClipboardList,
    body: "Run the existing CLI flow locally. x402 signing, Gateway payment, and protected API calls stay outside the browser.",
  },
  {
    step: "Step 5",
    title: "Inspect public timeline",
    href: "/runs",
    icon: ListChecks,
    body: "Open the agent run timeline to see selected, paid, skipped, and failed decisions with reasoning.",
  },
  {
    step: "Step 6",
    title: "Inspect commerce receipts",
    href: "/receipts",
    icon: ReceiptText,
    body: "Review public receipts that link paid steps to services, request IDs, buyer wallets, and payment events when available.",
  },
  {
    step: "Step 7",
    title: "Inspect agent passport",
    href: "/agents",
    icon: BadgeCheck,
    body: "See the buyer-agent wallet reputation profile update from real runs and purchase steps.",
  },
  {
    step: "Step 8",
    title: "Inspect seller analytics",
    href: "/seller/analytics",
    icon: ChartNoAxesCombined,
    body: "See seller-visible usage, estimated revenue, buyer-agent wallets, request IDs, and receipt links.",
  },
];

const reviewerNotes = [
  "API marketplace, not only one premium endpoint.",
  "Buyer-agent planner with task and budget reasoning.",
  "Seller-created services with safe mock fulfillment.",
  "Wallet funding flow for Arc Testnet users.",
  "Public commerce receipts for paid API purchases.",
  "Agent Passport reputation derived from run history.",
  "Seller analytics for usage, revenue, wallets, and request IDs.",
];

async function getLiveProof(): Promise<LiveProof> {
  await connection();

  try {
    const [runs, receipts, profiles] = await Promise.all([
      fetchRecentAgentRuns(30),
      fetchRecentReceipts({ limit: 1 }),
      listAgentProfiles(1),
    ]);

    return {
      run:
        runs.find((run) => run.status === "completed" && (run.paid_count ?? 0) > 0) ??
        runs.find((run) => run.status === "completed") ??
        runs[0] ??
        null,
      receipt: receipts[0] ?? null,
      profile: profiles[0] ?? null,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      run: null,
      receipt: null,
      profile: null,
      warning: message,
    };
  }
}

function EmptyProof({ label }: { label: string }) {
  return (
    <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
      {label} will appear after a successful buyer-agent run.
    </p>
  );
}

function LiveProofCards({ proof }: { proof: LiveProof }) {
  return (
    <section className="grid gap-4 lg:grid-cols-4">
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="size-5" />
            Latest successful run
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proof.run ? (
            <div className="grid gap-4">
              <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                {proof.run.task}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Spent</dt>
                  <dd className="font-mono">{proof.run.spent_usdc} USDC</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-mono">{proof.run.paid_count ?? 0}</dd>
                </div>
              </dl>
              <Button asChild>
                <Link href={`/runs/${proof.run.id}`}>
                  Open timeline
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyProof label="A public run timeline" />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ReceiptText className="size-5" />
            Latest receipt
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proof.receipt ? (
            <div className="grid gap-4">
              <p className="font-medium">{proof.receipt.serviceName}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-mono">{proof.receipt.amountUsdc} USDC</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Request</dt>
                  <dd className="font-mono">
                    {proof.receipt.requestId
                      ? shortenHash(proof.receipt.requestId, 5)
                      : "n/a"}
                  </dd>
                </div>
              </dl>
              <Button asChild>
                <Link href={`/receipts/${proof.receipt.id}`}>
                  Open receipt
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyProof label="A commerce receipt" />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeCheck className="size-5" />
            Main Agent Passport
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proof.profile ? (
            <div className="grid gap-4">
              <p className="font-mono text-sm">
                {shortenHash(proof.profile.wallet, 6)}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Trust</dt>
                  <dd className="font-mono">{proof.profile.trust_score}/100</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-mono">{proof.profile.paid_requests}</dd>
                </div>
              </dl>
              <Button asChild>
                <Link href={`/agents/${proof.profile.wallet}`}>
                  Open passport
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyProof label="An Agent Passport" />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChartNoAxesCombined className="size-5" />
            Seller analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Seller proof updates after paid agent purchases: revenue estimate,
            buyer wallets, recent purchases, request IDs, and receipt links.
          </p>
          <Button asChild>
            <Link href="/seller/analytics">
              Open analytics
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function DemoPage() {
  const proof = await getLiveProof();

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Guided Showcase</Badge>
              <Badge variant="outline">2-minute demo story</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-6xl">
              Watch an agent buy useful APIs with USDC on Arc
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              An AI agent analyzes the tone and sentiment of a short builder
              update by discovering paid APIs, selecting useful services,
              paying with USDC on Arc through x402/Gateway, and producing public
              receipts plus Agent Passport updates.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/review">
                  Review Pack
                  <ClipboardCheck />
                </Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/agent-control">
                  Plan the run
                  <Bot />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/agent-launch">
                  Fund buyer-agent
                  <Fuel />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/receipts">
                  View receipts
                  <ReceiptText />
                </Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-lg shadow-sm" id="demo-command">
            <CardHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="default">Demo command</Badge>
                <Badge variant="outline">No private keys</Badge>
              </div>
              <CardTitle>Sentiment and tone scenario</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Run this locally after funding the buyer-agent wallet. The
                browser copy text never includes private keys or payment
                signatures.
              </p>
              <div className="rounded-md border bg-muted/40 p-4">
                <code className="break-all font-mono text-sm">{demoCommand}</code>
              </div>
              <CopyButton value={demoCommand} label="Copy command" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-10 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              "Agent commerce",
              "Agents can discover APIs, reason about utility, and spend tiny USDC budgets without account setup.",
            ],
            [
              "Public proof",
              "Runs, receipts, Agent Passports, and seller analytics turn invisible API calls into audit-friendly artifacts.",
            ],
            [
              "Payment core preserved",
              "The browser story is read-only. Paid x402 requests still happen through the existing CLI and Gateway flow.",
            ],
          ].map(([title, body]) => (
            <Card className="rounded-lg shadow-sm" key={title}>
              <CardContent className="p-5">
                <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <ShieldCheck size={20} />
                </div>
                <p className="font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>What this demo proves</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2">
            <p>
              A real agent-commerce product needs more than a protected
              endpoint. It needs discovery, planning, funding, receipts,
              identity, and seller visibility.
            </p>
            <p>
              This flow shows the full loop: API Store discovery, buyer-agent
              choice, x402/Gateway payment on Arc, public purchase timeline,
              receipts, Agent Passport stats, and seller analytics.
            </p>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2">
          {walkthrough.map((item) => {
            const Icon = item.icon;

            return (
              <Card className="rounded-lg shadow-sm" key={item.title}>
                <CardContent className="grid gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <Icon size={20} />
                    </div>
                    <div>
                      <Badge variant="outline">{item.step}</Badge>
                      <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="justify-self-start">
                    <Link href={item.href}>
                      Open
                      <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Live proof</Badge>
              <Badge variant="outline">Best-effort public metadata</Badge>
            </div>
            <h2 className="text-3xl font-bold tracking-normal">Proof after a paid run</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              These cards read existing public run, receipt, passport, and
              analytics data. If the demo database has no successful run yet,
              the page stays usable and shows what will appear.
            </p>
          </div>
          {proof.warning ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Live proof is unavailable right now: {proof.warning}
            </p>
          ) : null}
          <LiveProofCards proof={proof} />
        </section>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">For Arc/Circle reviewers</Badge>
              <Badge variant="outline">Beyond a basic nanopayment example</Badge>
            </div>
            <CardTitle>What is different here</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reviewerNotes.map((note) => (
              <div className="flex gap-3 rounded-md border bg-background p-4" key={note}>
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-muted-foreground">{note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>Why it matters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <p className="text-sm leading-6 text-muted-foreground">
              Agent commerce needs a trustworthy trail from intent to payment
              to output. Arc Agent Commerce demonstrates a simple pattern:
              agents buy useful APIs with USDC, sellers see demand, and anyone
              can inspect the run, receipt, and wallet reputation afterward.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/store">
                  Explore Store
                  <Store />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="https://github.com/mioku50/Agent-Commerce#readme">
                  README
                  <ExternalLink />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
