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
  Clapperboard,
  ExternalLink,
  Fuel,
  ListChecks,
  Megaphone,
  ReceiptText,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  type LucideIcon,
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
  title: "Launch Pack | Arc Agent Commerce",
  description:
    "Submission-ready summary, public demo links, proof links, recording checklist, and copy for Arc Agent Commerce.",
};

const productionUrl = getDefaultProductionUrl();
const demoTask = "Analyze tone and sentiment for a short builder update";
const demoCommand = `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${demoTask}" --limit 0.005`;
const reviewSmokeCommand = "npm run review:smoke";

const submissionCopy =
  "Arc Agent Commerce turns Arc Nanopayments into an x402-powered API marketplace where AI agents discover paid services, buy useful API calls with USDC on Arc, and leave public proof through run timelines, commerce receipts, Agent Passports, and seller analytics. The browser never handles private keys or x402 signing; live paid calls still run through the local buyer-agent CLI.";

const xThreadOutline = [
  "1/ Arc Agent Commerce is an API Store for AI agents on Arc.",
  "2/ Agents discover paid APIs, plan around a budget, and pay with USDC through x402/Gateway.",
  "3/ Sellers can publish safe mock API services, then inspect usage and revenue-style analytics.",
  "4/ Every paid call becomes public proof: run timeline, receipt, buyer Agent Passport, and seller analytics.",
  "5/ Browser wallet UX is limited to Arc Testnet visibility and funding; private keys and x402 signing stay local.",
  "6/ Review the live demo: https://agent-commerce-six.vercel.app/review",
].join("\n");

const featureItems = [
  "API marketplace instead of a single paid endpoint.",
  "Buyer-agent planner with task, budget, and skip/buy reasoning.",
  "Seller-created safe mock services for marketplace expansion.",
  "Wallet-funded local agent launch on Arc Testnet.",
  "Public run timelines, receipts, Agent Passports, and seller analytics.",
  "Production smoke script that verifies public pages and decoded x402 challenges.",
];

const proofItems = [
  "Unpaid protected endpoints return HTTP 402 with a payment-required challenge.",
  "Paid CLI runs create public timelines with selected, paid, skipped, and failed steps.",
  "Paid steps become shareable receipts with service, wallet, endpoint, request ID, and payment-event status.",
  "Agent Passports rebuild reputation from public run and purchase history.",
  "Seller analytics aggregates paid calls, estimated USDC revenue, buyer wallets, and request IDs.",
];

const reviewerChecklist = [
  "Open the Review Pack and confirm live health cards.",
  "Open the Guided Demo and copy the sentiment/tone command.",
  "Open the API Store and inspect official plus seller-created services.",
  "Run Agent Control as a dry-run planner with a 0.005 USDC budget.",
  "Open Agent Launch and confirm browser wallet funding stays separate from x402 signing.",
  "Open latest run, latest receipt, Agent Passport, and seller analytics proof links.",
  "Run npm run review:smoke and confirm the x402 challenge decodes for Arc Testnet.",
];

const recordingChecklist = [
  { label: "Open /review", href: "/review" },
  { label: "Open /demo", href: "/demo" },
  { label: "Show /store", href: "/store" },
  { label: "Show /agent-control dry-run", href: "/agent-control" },
  { label: "Show /agent-launch", href: "/agent-launch" },
  { label: "Show latest /runs", href: "/runs" },
  { label: "Show latest /receipts", href: "/receipts" },
  { label: "Show /agents passport", href: "/agents" },
  { label: "Show /seller/analytics", href: "/seller/analytics" },
  { label: "Run npm run review:smoke", href: "#smoke" },
];

const demoLinks = [
  { title: "Review Pack", href: "/review", icon: ClipboardCheck },
  { title: "Guided Demo", href: "/demo", icon: Sparkles },
  { title: "API Store", href: "/store", icon: Store },
  { title: "Agent Control", href: "/agent-control", icon: Bot },
  { title: "Agent Launch", href: "/agent-launch", icon: Fuel },
  { title: "Agent Runs", href: "/runs", icon: ListChecks },
  { title: "Receipts", href: "/receipts", icon: ReceiptText },
  { title: "Agent Passports", href: "/agents", icon: BadgeCheck },
  { title: "Seller Analytics", href: "/seller/analytics", icon: ChartNoAxesCombined },
];

function absoluteUrl(path: string) {
  return `${productionUrl}${path}`;
}

function LinkTile({
  title,
  href,
  icon: Icon,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
}) {
  const fullUrl = absoluteUrl(href);

  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="size-5" />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="break-all text-xs text-muted-foreground">{fullUrl}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="sm">
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

function BulletList({ items, icon: Icon }: { items: string[]; icon: LucideIcon }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <p className="flex gap-3 text-sm leading-6 text-muted-foreground" key={item}>
          <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
          {item}
        </p>
      ))}
    </div>
  );
}

export default async function LaunchPage() {
  await connection();
  const data = await getReviewHealthStatus(productionUrl);
  const latestRunHref = data.latestRun ? `/runs/${data.latestRun.id}` : "/runs";
  const latestReceiptHref = data.latestReceipt
    ? `/receipts/${data.latestReceipt.id}`
    : "/receipts";
  const mainPassportHref = data.mainProfile
    ? `/agents/${data.mainProfile.wallet}`
    : "/agents";

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Final Launch Pack</Badge>
              <Badge variant="outline">Submission ready</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-6xl">
              Arc Agent Commerce launch summary
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              A screenshot-friendly submission pack for Arc/Circle/community
              reviewers: product pitch, proof links, reviewer checklist,
              public posting copy, and demo recording steps.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/review">
                  Review Pack
                  <ClipboardCheck />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/demo">
                  Guided Demo
                  <Sparkles />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/api/review/status">
                  Status JSON
                  <ExternalLink />
                </Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="default">Product pitch</Badge>
                <Badge variant="outline">Copy-ready</Badge>
              </div>
              <CardTitle>One sentence</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Arc Agent Commerce turns Arc Nanopayments into an API
                marketplace where buyer-agents discover paid services, pay with
                USDC through x402/Gateway, and leave public proof through
                timelines, receipts, Agent Passports, and seller analytics.
              </p>
              <CopyButton value={submissionCopy} label="Copy submission copy" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
        {data.warnings.length > 0 ? (
          <Card className="rounded-lg">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Some live proof metadata is unavailable right now: {data.warnings.join("; ")}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>Key features</CardTitle>
            </CardHeader>
            <CardContent>
              <BulletList items={featureItems} icon={CheckCircle2} />
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>Technical proof</CardTitle>
            </CardHeader>
            <CardContent>
              <BulletList items={proofItems} icon={ShieldCheck} />
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle>Reviewer checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <BulletList items={reviewerChecklist} icon={ClipboardCheck} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <LinkTile title="Latest Run" href={latestRunHref} icon={ListChecks} />
          <LinkTile title="Latest Receipt" href={latestReceiptHref} icon={ReceiptText} />
          <LinkTile title="Main Agent Passport" href={mainPassportHref} icon={BadgeCheck} />
          <LinkTile title="Seller Analytics" href="/seller/analytics" icon={ChartNoAxesCombined} />
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {demoLinks.map((link) => (
            <LinkTile key={link.href} {...link} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="size-5" />
                Submission copy
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="rounded-md border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
                {submissionCopy}
              </p>
              <CopyButton value={submissionCopy} label="Copy submission copy" />
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="size-5" />
                X thread outline
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-mono text-xs leading-6 text-muted-foreground">
                {xThreadOutline}
              </pre>
              <CopyButton value={xThreadOutline} label="Copy X outline" />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clapperboard className="size-5" />
                Demo recording checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {recordingChecklist.map((item, index) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex gap-3 rounded-md border bg-background p-4 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs text-secondary-foreground">
                    {index + 1}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm" id="smoke">
            <CardHeader>
              <CardTitle>Launch smoke commands</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Recommended demo command</p>
                <div className="mt-2 rounded-md border bg-muted/40 p-4">
                  <code className="break-all font-mono text-sm">{demoCommand}</code>
                </div>
                <div className="mt-3">
                  <CopyButton value={demoCommand} label="Copy demo command" />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Production QA smoke</p>
                <div className="mt-2 rounded-md border bg-muted/40 p-4">
                  <code className="break-all font-mono text-sm">{reviewSmokeCommand}</code>
                </div>
                <div className="mt-3">
                  <CopyButton value={reviewSmokeCommand} label="Copy smoke command" />
                </div>
              </div>
              <div className="rounded-md border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                Current proof snapshot:{" "}
                {data.latestRun
                  ? `run ${shortenHash(data.latestRun.id, 6)}`
                  : "no run yet"}
                ,{" "}
                {data.latestReceipt
                  ? `receipt ${shortenHash(data.latestReceipt.id, 6)}`
                  : "no receipt yet"}
                ,{" "}
                {data.mainProfile
                  ? `passport ${shortenHash(data.mainProfile.wallet, 6)}`
                  : "no passport yet"}
                .
              </div>
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
