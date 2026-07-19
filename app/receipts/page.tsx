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
  ArrowRight,
  BadgeCheck,
  Bot,
  FileSearch,
  ListChecks,
  ReceiptText,
  Sparkles,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { USDCAmount } from "@/components/wallet/USDCAmount";
import { WalletAddress } from "@/components/wallet/WalletAddress";
import {
  fetchRecentReceipts,
  type CommerceReceipt,
} from "@/lib/commerce/receipts";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Commerce Receipts | Arc Agent Commerce",
  description: "Public audit trail for paid x402 API purchases.",
};

type ReceiptsPageProps = {
  searchParams?: Promise<{
    wallet?: string;
    serviceSlug?: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function onchainStatusLabel(receipt: CommerceReceipt) {
  if (receipt.onchainProof?.status === "verified") return "Verified on Arc";
  if (receipt.onchainProof?.status === "pending") return "Onchain proof pending";
  if (receipt.onchainProof?.status === "failed") return "Proof failed";
  return "Onchain unavailable";
}

function ReceiptCard({ receipt }: { receipt: CommerceReceipt }) {
  return (
    <Card className="command-card rounded-lg shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status="paid" />
              <Badge
                variant={
                  receipt.serviceSourceType === "seller_mock" ? "secondary" : "outline"
                }
              >
                {receipt.sourceLabel}
              </Badge>
              <Badge variant={receipt.paymentEvent ? "default" : "outline"}>
                {receipt.paymentEventStatusLabel}
              </Badge>
              <Badge
                variant={
                  receipt.onchainProof?.status === "verified"
                    ? "default"
                    : receipt.onchainProof?.status === "failed"
                      ? "destructive"
                      : "outline"
                }
              >
                {onchainStatusLabel(receipt)}
              </Badge>
            </div>
            <h2 className="truncate text-lg font-semibold">{receipt.serviceName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(receipt.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <USDCAmount value={receipt.amountUsdc} size="lg" />
            <Button asChild>
              <Link href={`/receipts/${receipt.id}`}>
                View
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Method</dt>
            <dd className="font-mono">{receipt.method ?? "n/a"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Request ID</dt>
            <dd className="font-mono">
              {receipt.requestId ? shortenHash(receipt.requestId, 6) : "n/a"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Buyer agent</dt>
            <dd className="min-w-0">
              {receipt.buyerWallet ? (
                <WalletAddress address={receipt.buyerWallet} chars={5} copyable={false} />
              ) : (
                "n/a"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Proof status</dt>
            <dd>{onchainStatusLabel(receipt)}</dd>
          </div>
        </dl>
        {receipt.endpoint ? (
          <p className="break-all rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
            {receipt.endpoint}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline">
            <Link href={receipt.links.run}>
              Run timeline
              <ListChecks />
            </Link>
          </Button>
          {receipt.links.agent ? (
            <Button asChild variant="outline">
              <Link href={receipt.links.agent}>
                Agent Passport
                <BadgeCheck />
              </Link>
            </Button>
          ) : null}
          {receipt.links.service ? (
            <Button asChild variant="outline">
              <Link href={receipt.links.service}>
                Service
                <Store />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

async function ReceiptList({
  wallet,
  serviceSlug,
}: {
  wallet?: string | null;
  serviceSlug?: string | null;
}) {
  await connection();

  let receipts: CommerceReceipt[] = [];
  let error: string | null = null;

  try {
    receipts = await fetchRecentReceipts({ limit: 30, wallet, serviceSlug });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      {wallet || serviceSlug ? (
        <Card className="rounded-lg">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing receipts
              {wallet ? (
                <>
                  {" "}for wallet <span className="font-mono text-foreground">{wallet}</span>
                </>
              ) : null}
              {serviceSlug ? (
                <>
                  {" "}for service <span className="font-mono text-foreground">{serviceSlug}</span>
                </>
              ) : null}
              .
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/receipts">Clear filters</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {error ? (
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <p className="font-medium">Commerce receipts are not available yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : receipts.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="No paid commerce receipts yet."
          description="Run a hosted workflow with real input to create the first paid receipt and Arc proof."
          action={{ label: "Run Workflow", href: "/agent-runner" }}
        />
      ) : (
        receipts.map((receipt) => (
          <ReceiptCard key={receipt.id} receipt={receipt} />
        ))
      )}
    </section>
  );
}

function ReceiptsFallback() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
      <Card className="rounded-lg">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading commerce receipts...
        </CardContent>
      </Card>
    </section>
  );
}

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const wallet = resolvedSearchParams.wallet ?? null;
  const serviceSlug = resolvedSearchParams.serviceSlug ?? null;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Public audit trail</Badge>
              <Badge variant="outline">Commerce receipts</Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
              Commerce Receipts
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Each hosted workflow turns successful paid API calls into
              shareable receipts linked to its Final Report, buyer Passport,
              activity timeline, payment event, and app-owned Arc proof.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
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
              <Link href="/runs">
                <ListChecks />
                Activity
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/proofs">
                <Store />
                Arc Proofs
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pt-8 sm:px-6 md:grid-cols-3">
        {[
          ["x402 paid", "Only successful paid purchase steps become receipts"],
          ["Agent-linked", "Every receipt links to a buyer wallet and Passport"],
          ["Onchain proof", "Receipt hashes are attested on Arc after settlement"],
        ].map(([title, body]) => (
          <Card key={title} className="rounded-lg">
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <ReceiptText size={20} />
              </div>
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {body}
            </CardContent>
          </Card>
        ))}
      </section>

      <Suspense fallback={<ReceiptsFallback />}>
        <ReceiptList wallet={wallet} serviceSlug={serviceSlug} />
      </Suspense>
    </main>
  );
}
