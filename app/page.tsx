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
import {
  BookOpen,
  Bot,
  BadgeCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Fuel,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  ReceiptText,
  Sparkles,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArcWalletWidget } from "@/components/wallet/arc-wallet-widget";

const features = [
  {
    title: "API Store",
    icon: Store,
    body: "A service catalog with endpoint metadata, categories, prices, and example use cases for agent-buyable APIs.",
  },
  {
    title: "Buyer Agent",
    icon: Bot,
    body: "A buyer flow for discovering services, paying with USDC through x402, and recording why each paid call was useful.",
  },
  {
    title: "Seller Dashboard",
    icon: ChartNoAxesCombined,
    body: "A seller surface for API revenue, agent purchases, Gateway balance, and withdraw earnings.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-20">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Agent Commerce on Arc
          </p>
          <h1 className="max-w-4xl text-5xl font-bold leading-[0.96] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
            Arc Agent Commerce
          </h1>
          <p className="mt-6 max-w-2xl text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            An x402-powered API Store where AI agents buy services with USDC on
            Arc.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            This demo reframes Arc Nanopayments as an API marketplace: agents
            discover paid services, inspect prices, pay per request, and receive
            useful responses instantly.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link href="/review">
                <ClipboardCheck />
                Review Pack
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/demo">
                <Sparkles />
                Start guided demo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/store">
                <Store />
                Open API Store
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">
                <LayoutDashboard />
                Open Seller Dashboard
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/seller">
                <PlusCircle />
                Create API Service
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/agent-control">
                <Bot />
                Agent Control
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/agent-launch">
                <Fuel />
                Fund Agent
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/runs">
                <ListChecks />
                View Agent Runs
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/agents">
                <BadgeCheck />
                Agent Passports
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/receipts">
                <ReceiptText />
                Commerce Receipts
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="https://github.com/mioku50/Agent-Commerce#readme">
                <BookOpen />
                View README
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <span className="text-sm font-semibold">API Store preview</span>
              <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                Arc Testnet
              </span>
            </div>
            <div className="divide-y">
              {[
                ["Premium Quote", "0.001 USDC", "GET"],
                ["Market Snapshot", "0.01 USDC", "GET"],
                ["Agent Task", "0.03 USDC", "GET"],
              ].map(([name, price, method]) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-5" key={name}>
                  <div>
                    <p className="font-semibold text-foreground">{name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      x402 payment required
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-primary">{price}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{method}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t bg-muted/35 px-5 py-4 text-sm text-muted-foreground sm:grid-cols-2">
              <span>Gateway balance visible to sellers</span>
              <span>Agent purchases tracked in Supabase</span>
            </div>
          </div>
          <ArcWalletWidget />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Agent discovers APIs", "The API Store exposes paid services, prices, schemas, and machine-readable discovery metadata."],
            ["2", "Agent pays with USDC on Arc", "The local buyer-agent uses the existing x402/Gateway flow to satisfy HTTP 402 payment requirements."],
            ["3", "Proof updates publicly", "Run timelines, commerce receipts, Agent Passports, and seller analytics make the purchase auditable."],
          ].map(([step, title, body]) => (
            <article className="rounded-lg border bg-card p-5 shadow-sm" key={title}>
              <span className="flex size-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
                {step}
              </span>
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            API marketplace demo
          </p>
          <h2 className="text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
            USDC payments for AI agents
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Phase 1 keeps the product surface focused: a clear landing page,
            a metadata-backed API Store, buyer-agent timelines, public Agent
            Passports, and a seller dashboard that preserves the existing x402,
            Gateway, and Supabase payment foundation.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="rounded-lg border bg-card p-6 shadow-sm" key={feature.title}>
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {feature.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
