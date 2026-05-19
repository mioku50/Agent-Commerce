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
import { ArrowRight, BadgeCheck, Bot, ListChecks, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listAgentProfiles,
  type PublicAgentProfile,
} from "@/lib/agent/passport-persistence";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Agent Passports | Arc Agent Commerce",
  description: "Public buyer-agent identity and reputation passports.",
};

function formatDate(value: string | null) {
  if (!value) return "n/a";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ProfileCard({ profile }: { profile: PublicAgentProfile }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Agent Passport</Badge>
          <Badge variant={profile.trust_score >= 60 ? "default" : "outline"}>
            Trust {profile.trust_score}/100
          </Badge>
        </div>
        <CardTitle className="break-all font-mono text-xl">
          {shortenHash(profile.wallet, 8)}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Last run: {formatDate(profile.last_run_at)}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Runs</dt>
            <dd className="font-mono">{profile.total_runs}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="font-mono">{profile.paid_requests}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seller APIs</dt>
            <dd className="font-mono">{profile.seller_created_services_used}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Spent</dt>
            <dd className="font-mono">{profile.total_usdc_spent} USDC</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Reputation is derived from public run and purchase-step history.
          </p>
          <Button asChild>
            <Link href={`/agents/${profile.wallet}`}>
              View passport
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function AgentsList() {
  await connection();

  let profiles: PublicAgentProfile[] = [];
  let error: string | null = null;

  try {
    profiles = await listAgentProfiles(30);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      {error ? (
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <p className="font-medium">Agent passports are not available yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : profiles.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Bot size={20} />
            </div>
            <div>
              <p className="font-medium">No agent passports yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Run the buyer-agent after applying the Phase 5 migration to create
                the first public wallet passport.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        profiles.map((profile) => (
          <ProfileCard key={profile.wallet} profile={profile} />
        ))
      )}
    </section>
  );
}

function AgentsFallback() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      <Card className="rounded-lg">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading agent passports...
        </CardContent>
      </Card>
    </section>
  );
}

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Agent Identity</Badge>
              <Badge variant="outline">Reputation Passport</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
              Agent Passports
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Public buyer-agent profiles derived from real API Store runs,
              paid x402 requests, seller-created service usage, and budget
              discipline.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/runs">
                <ListChecks />
                View Runs
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/store">
                <Store />
                Open Store
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pt-8 sm:px-6 md:grid-cols-3">
        {[
          ["Trust score", "Deterministic demo score from activity"],
          ["Usage stats", "Runs, paid requests, skipped and failed calls"],
          ["Service mix", "Official sample and seller-created APIs used"],
        ].map(([title, body]) => (
          <Card key={title} className="rounded-lg">
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <BadgeCheck size={20} />
              </div>
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {body}
            </CardContent>
          </Card>
        ))}
      </section>

      <Suspense fallback={<AgentsFallback />}>
        <AgentsList />
      </Suspense>
    </main>
  );
}
