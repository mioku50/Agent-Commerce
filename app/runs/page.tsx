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
import { Suspense } from "react";
import {
  BadgeCheck,
  Bot,
  ReceiptText,
  Sparkles,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRecentAgentRuns, type PublicAgentRun } from "@/lib/agent/runs-public";
import { RunsListClient } from "./runs-client";

export const metadata = {
  title: "Workflow Activity | Arc Agent Commerce",
  description: "Public hosted and operator buyer-agent activity timelines.",
};

async function RunsList() {
  await connection();

  let runs: PublicAgentRun[] = [];
  let error: string | null = null;

  try {
    runs = await fetchRecentAgentRuns(50); // Increased limit slightly to ensure enough successful runs if many failed
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return <RunsListClient initialRuns={runs} error={error} />;
}

function RunsFallback() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      <Card className="rounded-lg">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading agent runs...
        </CardContent>
      </Card>
    </section>
  );
}

export default function RunsPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Buyer Agent</Badge>
              <Badge variant="outline">Public purchase timeline</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
              Activity
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Inspect how hosted and advanced operator workflows plan, select
              and purchase services through x402/Gateway, publish receipts,
              and record post-settlement Arc proof progress.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline">
              <Link href="/demo">
                <Sparkles />
                Guided Demo
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agent-runner">
                <Bot />
                Run Workflow
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/results">
                <Store />
                Final Reports
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">
                <BadgeCheck />
                Agent Passports
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/receipts">
                <ReceiptText />
                Receipts
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Suspense fallback={<RunsFallback />}>
        <RunsList />
      </Suspense>
    </main>
  );
}
