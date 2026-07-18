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
  Fuel,
  ListChecks,
  ReceiptText,
  Sparkles,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { USDCAmount } from "@/components/wallet/USDCAmount";
import { fetchRecentAgentRuns } from "@/lib/agent/runs-public";
import { listAgentProfiles } from "@/lib/agent/passport-persistence";
import { listAllStoreServices } from "@/lib/services/store-service-persistence";
import { shortenHash } from "@/lib/utils";

const quickActions = [
  { href: "/agent-runner", label: "Run live demo agent", icon: Bot },
  { href: "/demo", label: "Start guided demo", icon: Sparkles },
  { href: "/agent-launch", label: "Fund buyer-agent", icon: Fuel },
  { href: "/agents", label: "Agent Passports", icon: BadgeCheck },
  { href: "/receipts", label: "Commerce Receipts", icon: ReceiptText },
  { href: "/seller/analytics", label: "Seller Analytics", icon: ChartNoAxesCombined },
];

export default async function Home() {
  await connection();

  const [servicesResult, runsResult, profilesResult] = await Promise.allSettled([
    listAllStoreServices(),
    fetchRecentAgentRuns(5),
    listAgentProfiles(5),
  ]);

  const services =
    servicesResult.status === "fulfilled" ? servicesResult.value.services : [];
  const runs = runsResult.status === "fulfilled" ? runsResult.value : [];
  const profiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const spent = runs.reduce((sum, run) => sum + Number(run.spent_usdc || 0), 0);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
          <div className="min-w-0">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Arc Command Center
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-normal text-foreground sm:text-6xl">
              Agent commerce control center for paid APIs on Arc
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Discover x402-powered services, launch a hosted buyer-agent or use
              the advanced local wallet flow, and inspect the public proof trail:
              timelines, receipts, passports, and seller analytics.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/agent-runner">
                  <Bot />
                  Run live demo agent
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/demo">
                  <Sparkles />
                  Guided demo
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/store">
                  <Store />
                  Open Store
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/agent-setup">
                  <ClipboardCheck />
                  Local setup
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["API Store", services.length.toString(), "services"],
              ["Agent Runs", `${runs.length} total`, `${completedRuns} done`],
              ["Spent", spent.toFixed(4), "USDC tracked"],
              ["Agents", profiles.length.toString(), "active passports"],
            ].map(([label, value, detail]) => (
              <Card className="command-card rounded-lg" key={label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 font-mono text-3xl font-semibold tabular-usdc text-foreground">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 xl:grid-cols-[1fr_0.85fr]">
        <Card className="command-card rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5" />
              API Store Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(services.length > 0 ? services.slice(0, 5) : []).map((service) => (
              <Link
                key={service.slug}
                href={`/store/${service.slug}`}
                className="grid min-w-0 gap-3 rounded-md border bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{service.name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {service.endpoint}
                  </p>
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="rounded-md border px-2 py-1 font-mono text-xs">
                    {service.method}
                  </span>
                  <USDCAmount value={service.priceUsd} />
                </div>
              </Link>
            ))}
            <Button asChild variant="outline">
              <Link href="/store">
                Browse all services
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="command-card rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-5" />
              Recent Agent Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {runs.slice(0, 3).map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="grid min-w-0 gap-3 rounded-md border bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <StatusBadge status={run.status} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortenHash(run.id, 4)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium">{run.task}</p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{run.spent_usdc} USDC</span>
                  <span>{run.paid_count ?? 0} paid</span>
                  <span>{run.step_count ?? 0} steps</span>
                </div>
              </Link>
            ))}
            <Button asChild variant="outline">
              <Link href="/runs">
                View all runs
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6">
        <Card className="rounded-lg">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:flex-wrap">
            {quickActions.map(({ href, label, icon: Icon }) => (
              <Button key={href} asChild variant="outline">
                <Link href={href}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
