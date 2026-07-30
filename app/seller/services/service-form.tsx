"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND } from "@/lib/brand";

type ManagementService = {
  id: string;
  publicId: string;
  serviceVersion: number;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  method: "GET" | "POST";
  priceUsdc: string;
  status: "draft" | "active" | "paused" | "unavailable" | "archived";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  fulfillmentUrl: string;
  timeoutMs: number;
  maxResponseSizeBytes: number;
  sellerWallet: string;
  hasAuthorizationSecret: boolean;
  healthCheckInput: Record<string, unknown>;
  reviewStatus: "draft" | "pending" | "approved" | "changes_requested" | "rejected";
  availabilityStatus: "unknown" | "healthy" | "degraded" | "unavailable";
};

const textareaClass = "min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function defaultState() {
  return {
    name: "",
    slug: "",
    shortDescription: "",
    longDescription: "",
    category: "Productivity",
    method: "POST" as "GET" | "POST",
    priceUsdc: "0.002",
    status: "draft" as ManagementService["status"],
    fulfillmentUrl: "https://",
    timeoutMs: "15000",
    inputSchema: JSON.stringify({
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 4000 } },
      required: ["text"],
      additionalProperties: false,
    }, null, 2),
    outputSchema: JSON.stringify({
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
      additionalProperties: false,
    }, null, 2),
    healthCheckInput: JSON.stringify({ text: `${BRAND.name} seller availability check` }, null, 2),
    authorizationSecret: "",
    clearAuthorizationSecret: false,
  };
}

export function SellerServiceForm({ serviceId }: { serviceId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState(defaultState);
  const [service, setService] = useState<ManagementService | null>(null);
  const [loading, setLoading] = useState(Boolean(serviceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    fetch(`/api/seller/services/${serviceId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.service) throw new Error(body.error ?? "Service not found.");
        return body.service as ManagementService;
      })
      .then((value) => {
        if (cancelled) return;
        setService(value);
        setForm({
          name: value.name,
          slug: value.slug,
          shortDescription: value.shortDescription,
          longDescription: value.longDescription,
          category: value.category,
          method: value.method,
          priceUsdc: value.priceUsdc,
          status: value.status,
          fulfillmentUrl: value.fulfillmentUrl,
          timeoutMs: String(value.timeoutMs),
          inputSchema: JSON.stringify(value.inputSchema, null, 2),
          outputSchema: JSON.stringify(value.outputSchema, null, 2),
          healthCheckInput: JSON.stringify(value.healthCheckInput, null, 2),
          authorizationSecret: "",
          clearAuthorizationSecret: false,
        });
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [serviceId]);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function parseSchema(value: string, label: string) {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be an object");
      return parsed;
    } catch (caught) {
      throw new Error(`${label} must be valid JSON: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        shortDescription: form.shortDescription,
        longDescription: form.longDescription || form.shortDescription,
        category: form.category,
        method: form.method,
        priceUsdc: form.priceUsdc,
        status: serviceId ? form.status : "draft",
        inputSchema: parseSchema(form.inputSchema, "Input schema"),
        outputSchema: parseSchema(form.outputSchema, "Output schema"),
        healthCheckInput: parseSchema(form.healthCheckInput, "Health check input"),
        fulfillmentUrl: form.fulfillmentUrl,
        timeoutMs: Number(form.timeoutMs),
        maxResponseSizeBytes: service?.maxResponseSizeBytes ?? 262144,
        ...(form.authorizationSecret ? { authorizationSecret: form.authorizationSecret } : {}),
        clearAuthorizationSecret: form.clearAuthorizationSecret,
      };
      const response = await fetch(serviceId ? `/api/seller/services/${serviceId}` : "/api/seller/services", {
        method: serviceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.service) throw new Error(body.error ?? "Unable to save seller service.");
      router.push("/console/seller");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!serviceId || !window.confirm("Archive this service? Existing quotes and reports remain available.")) return;
    setSaving(true);
    const response = await fetch(`/api/seller/services/${serviceId}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/console/seller");
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Unable to archive service.");
      setSaving(false);
    }
  }

  if (loading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading seller service…</CardContent></Card>;

  return (
    <form onSubmit={submit} className="grid gap-5">
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {service ? (
        <div className="flex flex-wrap gap-3 rounded-md border bg-secondary/10 p-4 text-sm">
          <span>Public ID: <code>{service.publicId}</code></span>
          <span>Current immutable version: <strong>v{service.serviceVersion}</strong></span>
          <span>Seller wallet: <code>{service.sellerWallet}</code></span>
          <span>Review: <strong>{service.reviewStatus}</strong></span>
          <span>Availability: <strong>{service.availabilityStatus}</strong></span>
        </div>
      ) : (
        <p className="rounded-md border bg-secondary/10 p-4 text-sm text-muted-foreground">The verified owner wallet becomes the seller wallet. New services start as drafts.</p>
      )}
      <Card className="rounded-lg">
        <CardHeader><CardTitle>Service listing</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="name">Service Name</Label><Input id="name" value={form.name} onChange={(event) => { update("name", event.target.value); if (!serviceId) update("slug", slugify(event.target.value)); }} required /></div>
            <div className="grid gap-2"><Label htmlFor="slug">Service Slug</Label><Input id="slug" value={form.slug} onChange={(event) => update("slug", event.target.value)} disabled={Boolean(serviceId)} required /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="short">Short Description</Label><Input id="short" value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} required /></div>
          <div className="grid gap-2"><Label htmlFor="long">Description</Label><textarea id="long" className={textareaClass} value={form.longDescription} onChange={(event) => update("longDescription", event.target.value)} /></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2"><Label htmlFor="category">Service Category</Label><Input id="category" value={form.category} onChange={(event) => update("category", event.target.value)} required /></div>
            <div className="grid gap-2"><Label>Request Method</Label><Select value={form.method} onValueChange={(value) => update("method", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="price">Price in USDC</Label><Input id="price" inputMode="decimal" value={form.priceUsdc} onChange={(event) => update("priceUsdc", event.target.value)} required /></div>
            <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => update("status", value)} disabled={!serviceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem>{service?.reviewStatus === "approved" && ["healthy", "degraded"].includes(service.availabilityStatus) ? <SelectItem value="active">Active</SelectItem> : null}<SelectItem value="paused">Paused</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">A reviewed, available service may be activated. Configuration changes create a new draft version.</p></div>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>External fulfillment</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="endpoint">HTTPS Endpoint</Label><Input id="endpoint" type="url" value={form.fulfillmentUrl} onChange={(event) => update("fulfillmentUrl", event.target.value)} required /><p className="text-xs text-muted-foreground">DNS and network ranges are validated server-side. Redirects are rejected.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="timeout">Timeout (ms)</Label><Input id="timeout" type="number" min="1000" max="30000" value={form.timeoutMs} onChange={(event) => update("timeoutMs", event.target.value)} required /></div>
            <div className="grid gap-2"><Label htmlFor="secret">Endpoint authorization secret</Label><Input id="secret" type="password" autoComplete="new-password" value={form.authorizationSecret} onChange={(event) => update("authorizationSecret", event.target.value)} placeholder={service?.hasAuthorizationSecret ? "Stored — enter only to replace" : "Optional bearer secret"} /><p className="text-xs text-muted-foreground">Encrypted server-side and never returned after save.</p></div>
          </div>
          {service?.hasAuthorizationSecret ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.clearAuthorizationSecret} onChange={(event) => update("clearAuthorizationSecret", event.target.checked)} />Remove the stored endpoint secret in the next version</label> : null}
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>JSON Schemas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="input-schema">Input JSON Schema</Label><textarea id="input-schema" className={`${textareaClass} min-h-72 font-mono`} value={form.inputSchema} onChange={(event) => update("inputSchema", event.target.value)} spellCheck={false} /></div>
          <div className="grid gap-2"><Label htmlFor="output-schema">Output JSON Schema</Label><textarea id="output-schema" className={`${textareaClass} min-h-72 font-mono`} value={form.outputSchema} onChange={(event) => update("outputSchema", event.target.value)} spellCheck={false} /></div>
          <div className="grid gap-2 lg:col-span-2"><Label htmlFor="health-input">Health-check JSON input</Label><textarea id="health-input" className={`${textareaClass} min-h-40 font-mono`} value={form.healthCheckInput} onChange={(event) => update("healthCheckInput", event.target.value)} spellCheck={false} /><p className="text-xs text-muted-foreground">Stored with the immutable version and used only for unpaid review and availability preflight. Do not include secrets.</p></div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-3">
        {serviceId ? <Button type="button" variant="destructive" onClick={() => void archive()} disabled={saving}><Archive />Archive</Button> : null}
        <Button type="button" variant="outline" onClick={() => router.push("/console/seller")}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Saving…" : serviceId ? "Save new version" : "Create draft"}</Button>
      </div>
    </form>
  );
}
