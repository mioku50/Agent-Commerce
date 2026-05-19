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
import { ArrowRight, BadgeCheck, Bot, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRecentAgentRuns, type PublicAgentRun } from "@/lib/agent/runs-public";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Agent Runs | Arc Agent Commerce",
  description: "Public buyer-agent purchase timelines for Arc Agent Commerce.",
};

function statusVariant(status: string) {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RunCard({ run }: { run: PublicAgentRun }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          <Badge variant="secondary">{run.mode}</Badge>
        </div>
        <CardTitle className="line-clamp-2 text-xl">{run.task}</CardTitle>
        <p className="text-sm text-muted-foreground">{formatDate(run.created_at)}</p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Budget</dt>
            <dd className="font-mono">{run.budget_usdc} USDC</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Spent</dt>
            <dd className="font-mono">{run.spent_usdc} USDC</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="font-mono">{run.paid_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Steps</dt>
            <dd className="font-mono">{run.step_count ?? 0}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          {run.agent_wallet ? (
            <Link
              href={`/agents/${run.agent_wallet}`}
              className="font-mono text-xs text-primary hover:underline"
            >
              {shortenHash(run.agent_wallet, 6)}
            </Link>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">No wallet</p>
          )}
          <Button asChild>
            <Link href={`/runs/${run.id}`}>
              View timeline
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function RunsList() {
  await connection();

  let runs: PublicAgentRun[] = [];
  let error: string | null = null;

  try {
    runs = await fetchRecentAgentRuns(30);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      {error ? (
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <p className="font-medium">Agent runs are not available yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : runs.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Bot size={20} />
            </div>
            <div>
              <p className="font-medium">No agent runs yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Run `npm run agent -- --task &quot;Prepare a market context
                report&quot; --limit 0.05` after applying the Phase 3 migration.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        runs.map((run) => <RunCard key={run.id} run={run} />)
      )}
    </section>
  );
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
              Agent Runs
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Inspect how the scripted buyer-agent discovers services, explains
              each purchase decision, pays through x402/Gateway, and records a
              timeline.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/store">
              <Store />
              Open API Store
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/agents">
              <BadgeCheck />
              Agent Passports
            </Link>
          </Button>
        </div>
      </section>

      <Suspense fallback={<RunsFallback />}>
        <RunsList />
      </Suspense>
    </main>
  );
}
