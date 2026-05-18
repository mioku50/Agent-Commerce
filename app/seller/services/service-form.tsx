"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SellerStoreService,
  StoreServiceSourceType,
  StoreServiceStatus,
} from "@/lib/services/store-service-persistence";
import type { ServiceMethod } from "@/lib/services/registry";

type SellerServiceFormProps = {
  initialService?: SellerStoreService;
};

const textareaClassName =
  "flex min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

type JsonField =
  | "inputSchema"
  | "outputSchema"
  | "exampleRequest"
  | "exampleResponse";

const jsonFields: Array<[JsonField, string]> = [
  ["inputSchema", "Input schema"],
  ["outputSchema", "Output schema"],
  ["exampleRequest", "Example request"],
  ["exampleResponse", "Example response"],
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function jsonString(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function defaultService() {
  return {
    name: "",
    slug: "",
    shortDescription: "",
    longDescription: "",
    category: "Signals",
    method: "GET" as ServiceMethod,
    priceUsd: "0.002",
    status: "draft" as StoreServiceStatus,
    sourceType: "seller_mock" as StoreServiceSourceType,
    exampleUseCase:
      "An agent buys this service when the task matches the category and the price fits the remaining budget.",
    agentReasoningHint:
      "Select this service when the task asks for this category and a concise paid response is useful.",
    inputSchema: jsonString({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    outputSchema: jsonString({
      type: "object",
      properties: {
        result: { type: "string" },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["result", "generated_at"],
    }),
    exampleRequest: jsonString({
      method: "GET",
      endpoint: "/api/store/services/my-service/invoke",
    }),
    exampleResponse: jsonString({
      result: "Seller-created demo response for a paid mock API service.",
      generated_at: "2026-05-18T10:00:00.000Z",
    }),
  };
}

function initialFormState(service?: SellerStoreService) {
  if (!service) return defaultService();

  return {
    name: service.name,
    slug: service.slug,
    shortDescription: service.shortDescription,
    longDescription: service.longDescription,
    category: service.category,
    method: service.method,
    priceUsd: String(service.priceUsd),
    status: service.status,
    sourceType: service.sourceType,
    exampleUseCase: service.exampleUseCase,
    agentReasoningHint: service.agentReasoningHint,
    inputSchema: jsonString(service.inputSchema),
    outputSchema: jsonString(service.outputSchema),
    exampleRequest: jsonString(service.exampleRequest),
    exampleResponse: jsonString(service.exampleResponse),
  };
}

function parseJsonField(value: string, label: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error) throw new Error(`${label}: ${error.message}`);
    throw new Error(`${label} must be valid JSON.`);
  }
}

export function SellerServiceForm({ initialService }: SellerServiceFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialFormState(initialService));
  const [slugTouched, setSlugTouched] = useState(Boolean(initialService));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleNameChange(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        shortDescription: form.shortDescription,
        longDescription: form.longDescription,
        category: form.category,
        method: form.method,
        priceUsd: Number(form.priceUsd),
        status: form.status,
        sourceType: form.sourceType,
        exampleUseCase: form.exampleUseCase,
        agentReasoningHint: form.agentReasoningHint,
        inputSchema: parseJsonField(form.inputSchema, "Input schema"),
        outputSchema: parseJsonField(form.outputSchema, "Output schema"),
        exampleRequest: parseJsonField(form.exampleRequest, "Example request"),
        exampleResponse: parseJsonField(form.exampleResponse, "Example response"),
      };

      const response = await fetch(
        initialService
          ? `/api/seller/services/${initialService.id}`
          : "/api/seller/services",
        {
          method: initialService ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to save seller service.",
        );
      }

      router.refresh();
      router.push(`/store/${body.service.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Service listing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Risk Signal"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  update("slug", event.target.value);
                }}
                placeholder="risk-signal"
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="shortDescription">Short description</Label>
            <Input
              id="shortDescription"
              value={form.shortDescription}
              onChange={(event) => update("shortDescription", event.target.value)}
              placeholder="A paid mock signal for agent workflows."
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="longDescription">Long description</Label>
            <textarea
              id="longDescription"
              value={form.longDescription}
              onChange={(event) => update("longDescription", event.target.value)}
              className={textareaClassName}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Method</Label>
              <Select
                value={form.method}
                onValueChange={(value) => update("method", value as ServiceMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priceUsd">Price in USDC</Label>
              <Input
                id="priceUsd"
                type="number"
                min="0"
                step="0.000001"
                value={form.priceUsd}
                onChange={(event) => update("priceUsd", event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => update("status", value as StoreServiceStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="coming-soon">Coming soon</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Source type</Label>
            <Select
              value={form.sourceType}
              onValueChange={(value) =>
                update("sourceType", value as StoreServiceSourceType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seller_mock">Seller mock response</SelectItem>
                <SelectItem value="external_placeholder">
                  External placeholder
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Agent context</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="exampleUseCase">Example use case</Label>
            <textarea
              id="exampleUseCase"
              value={form.exampleUseCase}
              onChange={(event) => update("exampleUseCase", event.target.value)}
              className={textareaClassName}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agentReasoningHint">Agent reasoning hint</Label>
            <textarea
              id="agentReasoningHint"
              value={form.agentReasoningHint}
              onChange={(event) => update("agentReasoningHint", event.target.value)}
              className={textareaClassName}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Schemas and examples</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {jsonFields.map(([key, label]) => (
            <div className="grid gap-2" key={key}>
              <Label htmlFor={key}>{label}</Label>
              <textarea
                id={key}
                value={form[key]}
                onChange={(event) => update(key, event.target.value)}
                className={`${textareaClassName} min-h-48 font-mono`}
                spellCheck={false}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push("/seller")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {saving ? "Saving..." : "Publish service"}
        </Button>
      </div>
    </form>
  );
}
