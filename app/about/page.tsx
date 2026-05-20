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
import { ArrowRight, Globe, LockKeyhole, ReceiptText, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "About | Arc Agent Commerce",
  description: "Learn how AI agents buy data directly from web APIs without subscriptions.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section - The Hook */}
      <section className="relative overflow-hidden border-b bg-secondary/20 py-20 sm:py-32">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6">
          <Badge variant="outline" className="bg-background px-4 py-1 text-sm text-muted-foreground shadow-sm">
            <Sparkles className="mr-2 size-4 text-primary" />
            Designed for Humans & Machines
          </Badge>
          <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight text-foreground sm:text-7xl">
            What is Arc Agent Commerce?
          </h1>
          <p className="max-w-2xl text-xl leading-8 text-muted-foreground">
            It is a platform where AI agents can buy data directly from web APIs using micro-amounts of digital currency (USDC), without needing credit cards, user accounts, or monthly subscriptions.
          </p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link href="/demo">
                See the Demo
                <ArrowRight className="ml-2" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base bg-background">
              <Link href="/store">
                Browse APIs
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How It Works</h2>
          <p className="mt-4 text-lg text-muted-foreground">A seamless, 3-step process for machine-to-machine commerce.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Step 1 */}
          <Card className="relative overflow-hidden border-slate-100 shadow-sm">
            <div className="absolute top-0 h-1 w-full bg-primary/20"></div>
            <CardContent className="pt-8">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Globe size={28} />
              </div>
              <h3 className="mb-3 text-2xl font-bold">Step 1: Discover</h3>
              <p className="text-muted-foreground leading-relaxed">
                Agents scan our public catalog to find machine-readable endpoints that provide the exact data or capability they need right now.
              </p>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card className="relative overflow-hidden border-slate-100 shadow-sm">
            <div className="absolute top-0 h-1 w-full bg-primary/50"></div>
            <CardContent className="pt-8">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Zap size={28} />
              </div>
              <h3 className="mb-3 text-2xl font-bold">Step 2: Pay-per-Request</h3>
              <p className="text-muted-foreground leading-relaxed">
                Instead of asking a human for a credit card, the agent instantly signs a tiny, sub-cent payment on the Arc blockchain network.
              </p>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card className="relative overflow-hidden border-slate-100 shadow-sm">
            <div className="absolute top-0 h-1 w-full bg-primary"></div>
            <CardContent className="pt-8">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <LockKeyhole size={28} />
              </div>
              <h3 className="mb-3 text-2xl font-bold">Step 3: Access</h3>
              <p className="text-muted-foreground leading-relaxed">
                The API verifies the payment, unlocks instantly, and returns the requested data while creating an immutable, public receipt.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Why It Matters Section */}
      <section className="border-t bg-secondary/10 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <ReceiptText className="mx-auto mb-6 size-12 text-muted-foreground opacity-50" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Why does this matter?</h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-muted-foreground">
            <p>
              The current internet is built for humans holding credit cards. When automated AI software tries to solve complex problems, it frequently hits paywalls or requires humans to preemptively create accounts and buy expensive SaaS subscriptions.
            </p>
            <p>
              By giving agents their own programmatic wallets and an open marketplace that accepts instant, tiny payments, we enable software to act autonomously. Agents can now "hire" other specialized tools on the fly, paying exactly for what they use, unlocking a new economy of machine-to-machine commerce.
            </p>
          </div>
          <div className="mt-10">
             <Button asChild variant="outline" className="bg-background">
              <Link href="/">
                Return to Home
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
