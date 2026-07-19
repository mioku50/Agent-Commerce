/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fetchRecentReceipts,
  type CommerceReceipt,
} from "@/lib/commerce/receipts";
import { shortenHash } from "@/lib/utils";

export const metadata = {
  title: "Arc Proofs | Arc Agent Commerce",
  description:
    "Verified, pending, and failed app-owned AgentCommerceProofRegistry records on Arc Testnet.",
};

function statusLabel(status: "pending" | "verified" | "failed") {
  if (status === "verified") return "Verified on Arc";
  if (status === "failed") return "Proof failed";
  return "Onchain proof pending";
}

function statusVariant(status: "pending" | "verified" | "failed") {
  if (status === "verified") return "default" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function formatDate(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ProviderProofMetadata({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (result.provider !== "Pyth Network") return null;
  const interval = result.confidenceInterval as Record<string, unknown> | undefined;
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap gap-2"><Badge>Live Provider</Badge><Badge variant="secondary">Pyth Network</Badge><Badge variant="outline">{String(result.symbol ?? "unknown symbol")}</Badge></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-muted-foreground">Normalized price</dt><dd className="font-mono">{String(result.price ?? "n/a")}</dd></div>
        <div><dt className="text-muted-foreground">Confidence interval</dt><dd className="font-mono">{String(interval?.low ?? "n/a")} – {String(interval?.high ?? "n/a")}</dd></div>
        <div><dt className="text-muted-foreground">Provider publish time</dt><dd>{String(result.publishTime ?? "n/a")}</dd></div>
        <div><dt className="text-muted-foreground">Age at server fetch</dt><dd>{String(result.priceAgeSeconds ?? "n/a")} seconds</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">This registry proof belongs to an Arc Agent Commerce receipt for a 0.001 USDC provider-backed API call. Pyth supplied the underlying market data and did not receive the x402 payment directly.</p>
    </div>
  );
}

export default async function ProofsPage() {
  await connection();
  let receipts: CommerceReceipt[] = [];
  let warning: string | null = null;
  try {
    receipts = await fetchRecentReceipts({ limit: 100 });
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }
  const proofReceipts = receipts.filter((receipt) => receipt.onchainProof);
  const counts = {
    verified: proofReceipts.filter((receipt) => receipt.onchainProof?.status === "verified").length,
    pending: proofReceipts.filter((receipt) => receipt.onchainProof?.status === "pending").length,
    failed: proofReceipts.filter((receipt) => receipt.onchainProof?.status === "failed").length,
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-4">AgentCommerceProofRegistry</Badge>
            <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">Arc Proofs</h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              App-owned proof records created after successful x402 settlement.
              The registry stores commerce hashes and parties; it never holds
              funds or duplicates Circle Gateway settlement.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/receipts">
              Commerce Receipts
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 pt-8 sm:grid-cols-3 sm:px-6">
        {[
          ["Verified on Arc", counts.verified, "text-emerald-300"],
          ["Pending", counts.pending, "text-amber-300"],
          ["Failed", counts.failed, "text-red-300"],
        ].map(([label, value, color]) => (
          <Card key={label} className="rounded-lg">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`mt-2 font-mono text-3xl font-semibold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 sm:px-6">
        {warning ? (
          <Card className="rounded-lg">
            <CardContent className="flex gap-3 p-5 text-sm text-muted-foreground">
              <CircleAlert className="size-5 shrink-0 text-amber-400" />
              Proof index is temporarily unavailable: {warning}
            </CardContent>
          </Card>
        ) : proofReceipts.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No registry proofs yet."
            description="Complete a hosted paid workflow to create receipts and publish app-owned Arc proofs."
            action={{ label: "Run Workflow", href: "/agent-runner" }}
          />
        ) : (
          proofReceipts.map((receipt) => {
            const proof = receipt.onchainProof;
            if (!proof) return null;
            return (
              <Card key={receipt.id} className="command-card rounded-lg">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{receipt.serviceName}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Receipt {shortenHash(receipt.id, 8)} · {receipt.amountUsdc} USDC
                      </p>
                    </div>
                    <Badge variant={statusVariant(proof.status)}>{statusLabel(proof.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <ProviderProofMetadata value={receipt.responsePreview} />
                  <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Transaction hash</dt>
                      <dd className="mt-1 break-all font-mono text-xs">
                        {proof.transactionHash ?? "Awaiting transaction"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Block</dt>
                      <dd className="mt-1 font-mono">{proof.blockNumber ?? "pending"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Contract</dt>
                      <dd className="mt-1 break-all font-mono text-xs">
                        {proof.contractAddress ?? "n/a"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Verified</dt>
                      <dd className="mt-1">{formatDate(proof.verifiedAt)}</dd>
                    </div>
                  </dl>
                  {proof.error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {proof.error}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/receipts/${receipt.id}`}>
                        <ReceiptText /> Receipt
                      </Link>
                    </Button>
                    {proof.transactionExplorerUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={proof.transactionExplorerUrl} target="_blank" rel="noreferrer">
                          <ExternalLink /> Transaction on Arcscan
                        </a>
                      </Button>
                    ) : null}
                    {proof.contractExplorerUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={proof.contractExplorerUrl} target="_blank" rel="noreferrer">
                          <ExternalLink /> Registry contract
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </main>
  );
}
