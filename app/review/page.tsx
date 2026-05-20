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
  Fuel,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  Store,
  XCircle,
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
import {
  listAllStoreServices,
} from "@/lib/services/store-service-persistence";
import type { ApiService } from "@/lib/services/registry";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Reviewer Pack | Arc Agent Commerce",
  description:
    "Arc Agent Commerce public review pack with demo links, health status, technical proof, and testnet notes.",
};

const productionUrl = getProductionUrl();
const demoTask = "Analyze tone and sentiment for a short builder update";
const demoCommand = `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${demoTask}" --limit 0.005`;

type ReviewData = {
  latestRun: PublicAgentRun | null;
  latestReceipt: CommerceReceipt | null;
  mainProfile: PublicAgentProfile | null;
  services: ApiService[];
  warnings: string[];
};

const reviewChecklist = [
  {
    title: "Open the Guided Demo",
    body: "Read the story and copy the sentiment/tone CLI command.",
    href: "/demo",
  },
  {
    title: "Open the API Store",
    body: "Confirm this is a marketplace with official and seller-created APIs.",
    href: "/store",
  },
  {
    title: "Check the latest proof",
    body: "Open the latest run, receipt, Agent Passport, and seller analytics links.",
    href: "/review#live-links",
  },
  {
    title: "Verify unpaid protection",
    body: "Call `/api/premium/quote` without payment and confirm HTTP 402.",
    href: "/api/premium/quote",
  },
];

const differenceItems = [
  "Marketplace instead of one endpoint.",
  "Buyer-agent planner with task and budget decisions.",
  "Wallet-funded agent launch for Arc Testnet users.",
  "Seller-created services with safe mock fulfillment.",
  "Public receipts for paid API purchases.",
  "Agent Passports and reputation stats.",
  "Seller analytics for revenue-style usage proof.",
];

const technicalProofItems = [
  "Unpaid protected endpoints return HTTP 402.",
  "Paid runs create public reasoning timelines.",
  "Paid steps create shareable receipts.",
  "Passport and reputation stats rebuild from public run history.",
  "Seller analytics aggregates paid calls, buyer wallets, request IDs, and estimated USDC revenue.",
];

const testnetNotes = [
  "Arc Testnet only.",
  "The browser never receives private keys.",
  "The browser only funds buyer-agent wallets through explicit user-confirmed transactions.",
  "The local CLI buyer-agent still owns x402 signing and paid protected API requests.",
  "Occasional Supabase, Gateway, or network timeouts are handled with retry/backoff or safe empty states.",
];

function getProductionUrl() {
  const publicUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  return (publicUrl ?? "https://agent-commerce-six.vercel.app").replace(/\/$/, "");
}

function absoluteUrl(path: string) {
  return `${productionUrl}${path}`;
}

function resultWarning(label: string, result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return null;
  const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return `${label}: ${reason}`;
}

async function getReviewData(): Promise<ReviewData> {
  await connection();

  const [runsResult, receiptsResult, profilesResult, servicesResult] =
    await Promise.allSettled([
      fetchRecentAgentRuns(30),
      fetchRecentReceipts({ limit: 1 }),
      listAgentProfiles(1),
      listAllStoreServices(),
    ]);

  const runs =
    runsResult.status === "fulfilled" ? runsResult.value : ([] as PublicAgentRun[]);
  const receipts =
    receiptsResult.status === "fulfilled" ? receiptsResult.value : ([] as CommerceReceipt[]);
  const profiles =
    profilesResult.status === "fulfilled" ? profilesResult.value : ([] as PublicAgentProfile[]);
  const services =
    servicesResult.status === "fulfilled" ? servicesResult.value.services : ([] as ApiService[]);

  const warnings = [
    resultWarning("Runs", runsResult),
    resultWarning("Receipts", receiptsResult),
    resultWarning("Agent Passports", profilesResult),
    resultWarning("API Store services", servicesResult),
  ].filter(Boolean) as string[];

  return {
    latestRun:
      runs.find((run) => run.status === "completed" && (run.paid_count ?? 0) > 0) ??
      runs.find((run) => run.status === "completed") ??
      runs[0] ??
      null,
    latestReceipt: receipts[0] ?? null,
    mainProfile: profiles[0] ?? null,
    services,
    warnings,
  };
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
  const data = await getReviewData();
  const liveSellerServices = data.services.filter(
    (service) => service.sourceType !== "static" && service.status === "live",
  );
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
              <Badge variant="secondary">Reviewer Readiness</Badge>
              <Badge variant="outline">Public submission pack</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-6xl">
              Review Arc Agent Commerce in under 2 minutes
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              Arc Agent Commerce is an x402-powered API Store where AI agents
              discover paid services, pay with USDC on Arc, and leave public
              proof through timelines, receipts, Agent Passports, and seller
              analytics.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/demo">
                  Guided Demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/store">
                  API Store
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
                Use this local command after funding the buyer-agent wallet.
                Browser pages never contain private keys or x402 signatures.
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

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Latest successful run"
            ok={Boolean(data.latestRun)}
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
            title="Seller-created live service"
            ok={liveSellerServices.length > 0}
            detail={
              liveSellerServices.length > 0
                ? `${liveSellerServices.length} live seller-created service(s) in discovery.`
                : "No live seller-created service is visible to the public store."
            }
          />
          <StatusCard
            title="API Store services"
            ok={data.services.length > 0}
            detail={`${data.services.length} public service(s) available. Disabled smoke-test services are hidden from public discovery.`}
          />
        </section>

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
            title="API Store"
            href="/store"
            detail="Marketplace of official and seller-created services."
            icon={Store}
          />
          <LinkCard
            title="Agent Control"
            href="/agent-control"
            detail="Dry-run buyer-agent planning."
            icon={Bot}
          />
          <LinkCard
            title="Agent Launch"
            href="/agent-launch"
            detail="Wallet-funded local buyer-agent launch flow."
            icon={Fuel}
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
