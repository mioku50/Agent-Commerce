"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BadgeDollarSign, LoaderCircle, PlusCircle, ShieldCheck, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  createdAt: string;
  updatedAt: string;
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
  transaction_hash: string | null;
  created_at: string;
  store_services: { name?: string; public_id?: string } | Array<{ name?: string; public_id?: string }>;
};

function serviceName(row: LedgerRow) {
  const value = Array.isArray(row.store_services) ? row.store_services[0] : row.store_services;
  return value?.name ?? "External Service";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SellerConsoleClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSession, setNeedsSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [servicesResponse, revenueResponse] = await Promise.all([
        fetch("/api/seller/services", { cache: "no-store" }),
        fetch("/api/seller/revenue", { cache: "no-store" }),
      ]);
      if (servicesResponse.status === 401 || revenueResponse.status === 401) {
        setNeedsSession(true);
        return;
      }
      const [servicesBody, revenueBody] = await Promise.all([servicesResponse.json(), revenueResponse.json()]);
      if (!servicesResponse.ok) throw new Error(servicesBody.error ?? "Unable to load seller services.");
      if (!revenueResponse.ok) throw new Error(revenueBody.error ?? "Unable to load seller revenue.");
      setServices(servicesBody.services ?? []);
      setLedger(revenueBody.ledger ?? []);
      setNeedsSession(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const gross = ledger.reduce((sum, row) => sum + Number(row.gross_amount_usdc || 0), 0);
  const net = ledger.reduce((sum, row) => sum + Number(row.seller_net_amount_usdc || 0), 0);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex flex-wrap gap-2"><Badge>Seller Console</Badge><Badge variant="outline">External Service Marketplace</Badge></div><h1 className="mt-4 text-4xl font-bold sm:text-5xl">Publish services for buying agents</h1><p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Register a real HTTPS service, version its commercial configuration, and review revenue linked to completed buyer runs.</p></div>
            <div className="flex flex-wrap gap-2"><Button asChild><Link href="/seller/services/new"><PlusCircle />Create Service</Link></Button><Button asChild variant="outline"><Link href="/agent-runner"><Store />Public Workflows</Link></Button></div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-8 sm:px-6">
        {loading ? <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" />Loading seller account…</CardContent></Card> : null}
        {needsSession ? <Card className="border-amber-400/30"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck />Verify your owner wallet</CardTitle></CardHeader><CardContent className="grid gap-4"><p className="text-sm leading-6 text-muted-foreground">Seller services and revenue are scoped to the verified owner-wallet session. Verify the wallet in Agent Accounts, then return here.</p><Button asChild className="w-fit"><Link href="/console/agents">Verify owner wallet <ArrowRight /></Link></Button></CardContent></Card> : null}
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
        {!loading && !needsSession && !error ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              {[["Services", services.length], ["Active", services.filter((item) => item.status === "active").length], ["Gross Revenue", `${gross.toFixed(6)} USDC`], ["Net Revenue", `${net.toFixed(6)} USDC`]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-mono text-2xl font-semibold">{value}</p></CardContent></Card>)}
            </section>
            <section>
              <div className="mb-4 flex items-center gap-2"><Store className="size-5 text-primary" /><h2 className="text-2xl font-bold">Your Services</h2></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {services.length ? services.map((service) => <Card key={service.id}><CardHeader><div className="flex flex-wrap gap-2"><Badge variant={service.status === "active" ? "default" : "secondary"}>{service.status}</Badge><Badge variant="outline">External Service</Badge><Badge variant="outline">v{service.serviceVersion}</Badge></div><CardTitle className="mt-3">{service.name}</CardTitle><p className="text-sm leading-6 text-muted-foreground">{service.shortDescription}</p></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap justify-between gap-3 text-sm"><span>{service.priceUsdc} USDC</span><span>{service.category}</span><span>{service.method}</span></div><Button asChild variant="outline"><Link href={`/seller/services/${service.id}`}>Manage & version <ArrowRight /></Link></Button></CardContent></Card>) : <Card className="lg:col-span-2"><CardContent className="p-6 text-sm text-muted-foreground">No external services yet. Create a draft to begin.</CardContent></Card>}
              </div>
            </section>
            <section>
              <div className="mb-4 flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-2xl font-bold">Seller Revenue Ledger</h2></div>
              <Card><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Run ID</TableHead><TableHead>Date</TableHead><TableHead>Buyer payment</TableHead><TableHead>Gross</TableHead><TableHead>Platform fee</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead><TableHead>Transaction / receipt</TableHead></TableRow></TableHeader><TableBody>{ledger.length ? ledger.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{serviceName(row)}</div><div className="text-xs text-muted-foreground">v{row.service_version}</div></TableCell><TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/agent-runner/${row.job_id}`}>{row.job_id.slice(0, 8)}…</Link></TableCell><TableCell className="min-w-36 text-xs">{formatDate(row.created_at)}</TableCell><TableCell className="font-mono">{row.buyer_payment_usdc}</TableCell><TableCell className="font-mono">{row.gross_amount_usdc}</TableCell><TableCell className="font-mono">{row.platform_fee_usdc}</TableCell><TableCell className="font-mono">{row.seller_net_amount_usdc}</TableCell><TableCell><Badge variant={row.settlement_status === "settled" || row.settlement_status === "earned" ? "default" : "secondary"}>{row.settlement_status}</Badge></TableCell><TableCell>{row.receipt_id ? <Link className="text-primary hover:underline" href={`/receipts/${row.receipt_id}`}>Receipt</Link> : row.transaction_hash ? <span className="font-mono text-xs">{row.transaction_hash.slice(0, 10)}…</span> : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="p-6 text-muted-foreground">Revenue appears only after a schema-valid completed seller workflow.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
