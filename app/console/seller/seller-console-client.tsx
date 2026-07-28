"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowRight, BadgeDollarSign, FileCheck2, LoaderCircle, PlusCircle, ShieldCheck, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SellerWithdrawalClient } from "./seller-withdrawal-client";

type SellerAccount = {
  publicId: string;
  ownerWallet: string;
  displayName: string | null;
  status: string;
  onboardingStatus: "pending" | "active" | "suspended";
  termsAcceptedAt: string | null;
  settlementMode: "direct_x402";
};

type Service = {
  id: string;
  publicId: string;
  serviceVersion: number;
  name: string;
  shortDescription: string;
  priceUsdc: string;
  status: string;
  method: string;
  category: string;
  reviewStatus: string;
  reviewReason: string | null;
  availabilityStatus: string;
  lastHealthCheckAt: string | null;
  consecutiveHealthFailures: number;
};

type LedgerRow = {
  id: string;
  service_version: number;
  job_id: string;
  receipt_id: string | null;
  buyer_payment_usdc: string;
  gross_amount_usdc: string;
  platform_fee_usdc: string;
  seller_net_amount_usdc: string;
  settlement_status: string;
  settlement_mode: string;
  settlement_reference: string | null;
  transaction_hash: string | null;
  created_at: string;
  store_services: { name?: string; public_id?: string } | Array<{ name?: string; public_id?: string }>;
};

type Settlement = {
  public_id: string;
  ledger_id: string;
  amount_usdc: string;
  destination_wallet: string;
  gateway_transaction: string | null;
  status: string;
  confirmed_at: string;
};

function serviceName(row: LedgerRow) {
  const value = Array.isArray(row.store_services) ? row.store_services[0] : row.store_services;
  return value?.name ?? "External Service";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function jsonResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  return body;
}

export function SellerConsoleClient() {
  const [account, setAccount] = useState<SellerAccount | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [needsSession, setNeedsSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountResponse, servicesResponse, revenueResponse] = await Promise.all([
        fetch("/api/seller/account", { cache: "no-store" }),
        fetch("/api/seller/services", { cache: "no-store" }),
        fetch("/api/seller/revenue", { cache: "no-store" }),
      ]);
      if ([accountResponse, servicesResponse, revenueResponse].some((response) => response.status === 401)) {
        setNeedsSession(true);
        return;
      }
      const [accountBody, servicesBody, revenueBody] = await Promise.all([
        jsonResponse(accountResponse), jsonResponse(servicesResponse), jsonResponse(revenueResponse),
      ]);
      const nextAccount = accountBody.account as SellerAccount;
      setAccount(nextAccount);
      setDisplayName(nextAccount.displayName ?? "");
      setServices((servicesBody.services ?? []) as Service[]);
      setLedger((revenueBody.ledger ?? []) as LedgerRow[]);
      setSettlements((revenueBody.settlements ?? []) as Settlement[]);
      setNeedsSession(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function completeOnboarding(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = await jsonResponse(await fetch("/api/seller/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, termsAccepted }),
      }));
      setAccount(body.account as SellerAccount);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(false);
    }
  }

  async function lifecycleAction(serviceId: string, action: "review" | "availability") {
    setBusyServiceId(serviceId);
    setError(null);
    try {
      await jsonResponse(await fetch(`/api/seller/services/${serviceId}/${action}`, { method: "POST" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyServiceId(null);
    }
  }

  const gross = ledger.reduce((sum, row) => sum + Number(row.gross_amount_usdc || 0), 0);
  const net = ledger.reduce((sum, row) => sum + Number(row.seller_net_amount_usdc || 0), 0);
  const settled = settlements.reduce((sum, row) => sum + Number(row.amount_usdc || 0), 0);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex flex-wrap gap-2"><Badge>Seller Console</Badge><Badge variant="outline">Arc Testnet</Badge><Badge variant="outline">Direct x402 settlement</Badge></div><h1 className="mt-4 text-4xl font-bold sm:text-5xl">Operate services for buying agents</h1><p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Onboard a verified seller, publish reviewed HTTPS services, monitor availability, reconcile direct x402 revenue, and withdraw seller-owned Gateway USDC.</p></div>
            <div className="flex flex-wrap gap-2">{account?.onboardingStatus === "active" ? <Button asChild><Link href="/seller/services/new"><PlusCircle />Create Service</Link></Button> : null}<Button asChild variant="outline"><Link href="/agent-runner"><Store />Public Workflows</Link></Button></div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-8 sm:px-6">
        {loading ? <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" />Loading seller lifecycle…</CardContent></Card> : null}
        {needsSession ? <Card className="border-amber-400/30"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck />Verify your owner wallet</CardTitle></CardHeader><CardContent className="grid gap-4"><p className="text-sm leading-6 text-muted-foreground">Seller accounts, services, settlement records, and withdrawals are scoped to the verified owner-wallet session.</p><Button asChild className="w-fit"><Link href="/console/agents">Verify owner wallet <ArrowRight /></Link></Button></CardContent></Card> : null}
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
        {!loading && !needsSession && account?.onboardingStatus !== "active" ? <Card className="border-primary/30"><CardHeader><CardTitle>Complete seller onboarding</CardTitle></CardHeader><CardContent><form className="grid max-w-xl gap-4" onSubmit={completeOnboarding}><div className="grid gap-2"><Label htmlFor="seller-display-name">Public seller name</Label><Input id="seller-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required /></div><label className="flex items-start gap-2 text-sm leading-6"><input className="mt-1" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I confirm that service endpoints contain no secrets in public metadata, use Arc Testnet x402, and may be suspended after failed availability checks.</span></label><Button className="w-fit" disabled={!termsAccepted || displayName.trim().length < 2}>Complete onboarding</Button></form></CardContent></Card> : null}
        {!loading && !needsSession && account?.onboardingStatus === "active" ? (
          <>
            <section className="grid gap-4 md:grid-cols-5">
              {["Services", "Discoverable", "Gross Revenue", "Seller Net", "Directly Settled"].map((label, index) => {
                const values = [services.length, services.filter((item) => item.status === "active" && item.reviewStatus === "approved" && ["healthy", "degraded"].includes(item.availabilityStatus)).length, `${gross.toFixed(6)} USDC`, `${net.toFixed(6)} USDC`, `${settled.toFixed(6)} USDC`];
                return <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-mono text-xl font-semibold">{values[index]}</p></CardContent></Card>;
              })}
            </section>
            <section>
              <div className="mb-4 flex items-center gap-2"><Store className="size-5 text-primary" /><h2 className="text-2xl font-bold">Your services</h2></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {services.length ? services.map((service) => <Card key={service.id}><CardHeader><div className="flex flex-wrap gap-2"><Badge variant={service.status === "active" ? "default" : "secondary"}>{service.status}</Badge><Badge variant={service.reviewStatus === "approved" ? "default" : "outline"}>review: {service.reviewStatus}</Badge><Badge variant={["healthy", "degraded"].includes(service.availabilityStatus) ? "default" : "secondary"}>health: {service.availabilityStatus}</Badge><Badge variant="outline">v{service.serviceVersion}</Badge></div><CardTitle className="mt-3">{service.name}</CardTitle><p className="text-sm leading-6 text-muted-foreground">{service.shortDescription}</p></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap justify-between gap-3 text-sm"><span>{service.priceUsdc} USDC</span><span>{service.category}</span><span>{service.method}</span></div><p className="text-xs text-muted-foreground">Last check: {formatDate(service.lastHealthCheckAt)}{service.reviewReason ? ` · ${service.reviewReason}` : ""}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/seller/services/${service.id}`}>Manage & version <ArrowRight /></Link></Button>{service.reviewStatus !== "pending" && service.reviewStatus !== "approved" ? <Button type="button" onClick={() => void lifecycleAction(service.id, "review")} disabled={busyServiceId === service.id}>{busyServiceId === service.id ? <LoaderCircle className="animate-spin" /> : <FileCheck2 />}Submit review</Button> : null}{service.reviewStatus === "approved" ? <Button type="button" variant="secondary" onClick={() => void lifecycleAction(service.id, "availability")} disabled={busyServiceId === service.id}>{busyServiceId === service.id ? <LoaderCircle className="animate-spin" /> : <Activity />}Check availability</Button> : null}</div></CardContent></Card>) : <Card className="lg:col-span-2"><CardContent className="p-6 text-sm text-muted-foreground">No external services yet. Create a draft, save a safe health-check input, then submit it for review.</CardContent></Card>}
              </div>
            </section>
            <section>
              <div className="mb-4 flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-2xl font-bold">Revenue and direct settlement</h2></div>
              <Card><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Run</TableHead><TableHead>Date</TableHead><TableHead>Buyer payment</TableHead><TableHead>Platform fee</TableHead><TableHead>Seller net</TableHead><TableHead>Settlement</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader><TableBody>{ledger.length ? ledger.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{serviceName(row)}</div><div className="text-xs text-muted-foreground">v{row.service_version}</div></TableCell><TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/agent-runner/${row.job_id}`}>{row.job_id.slice(0, 8)}…</Link></TableCell><TableCell className="min-w-36 text-xs">{formatDate(row.created_at)}</TableCell><TableCell className="font-mono">{row.buyer_payment_usdc}</TableCell><TableCell className="font-mono">{row.platform_fee_usdc}</TableCell><TableCell className="font-mono">{row.seller_net_amount_usdc}</TableCell><TableCell><Badge variant={row.settlement_status === "settled" ? "default" : "secondary"}>{row.settlement_status}</Badge><div className="mt-1 text-xs text-muted-foreground">{row.settlement_mode === "direct_x402" ? "paid by x402" : row.settlement_mode}</div></TableCell><TableCell>{row.receipt_id ? <Link className="text-primary hover:underline" href={`/receipts/${row.receipt_id}`}>Receipt</Link> : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="p-6 text-muted-foreground">Revenue appears only after valid JSON, successful endpoint execution, and verified Arc proof. Idempotent replay cannot create a second settlement.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            </section>
            <SellerWithdrawalClient ownerWallet={account.ownerWallet} />
          </>
        ) : null}
      </section>
    </main>
  );
}
