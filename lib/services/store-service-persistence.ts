import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../supabase/server-env";
import {
  getServiceBySlug,
  serviceRegistry,
  type ApiService,
  type ServiceMethod,
  type ServiceSourceType,
  type ServiceStatus,
} from "@/lib/services/registry";

export type StoreServiceStatus = "draft" | "live" | "disabled" | "coming-soon";
export type StoreServiceSourceType = "seller_mock" | "external_placeholder";

export type StoreServiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  short_description: string;
  long_description: string;
  category: string;
  method: ServiceMethod;
  price_usdc: string | number;
  status: StoreServiceStatus;
  source_type: StoreServiceSourceType;
  input_schema: unknown;
  output_schema: unknown;
  example_request: unknown;
  example_response: unknown;
  example_use_case: string;
  agent_reasoning_hint: string;
  raw: Record<string, unknown> | null;
};

export type SellerStoreService = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  method: ServiceMethod;
  endpoint: string;
  priceUsd: number;
  priceLabel: string;
  status: StoreServiceStatus;
  sourceType: StoreServiceSourceType;
  inputSchema: unknown;
  outputSchema: unknown;
  exampleRequest: unknown;
  exampleResponse: unknown;
  exampleUseCase: string;
  agentReasoningHint: string;
};

export type DynamicStoreServiceInput = {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  method: ServiceMethod;
  priceUsd: number;
  status: StoreServiceStatus;
  sourceType: StoreServiceSourceType;
  inputSchema: unknown;
  outputSchema: unknown;
  exampleRequest: unknown;
  exampleResponse: unknown;
  exampleUseCase: string;
  agentReasoningHint: string;
};

export const storeServiceStatuses: readonly StoreServiceStatus[] = [
  "draft",
  "live",
  "coming-soon",
  "disabled",
];

export const storeServiceSourceTypes: readonly StoreServiceSourceType[] = [
  "seller_mock",
  "external_placeholder",
];

const storeServiceColumns = [
  "id",
  "created_at",
  "updated_at",
  "name",
  "slug",
  "short_description",
  "long_description",
  "category",
  "method",
  "price_usdc",
  "status",
  "source_type",
  "input_schema",
  "output_schema",
  "example_request",
  "example_response",
  "example_use_case",
  "agent_reasoning_hint",
  "raw",
].join(",");

const publicDynamicStatuses: readonly StoreServiceStatus[] = [
  "live",
  "coming-soon",
];

let supabase: SupabaseClient | null = null;

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getServiceSupabase({ required = false }: { required?: boolean } = {}) {
  const config = tryGetServerSupabaseConfig();

  if (!config) {
    if (required) {
      throw new Error("Server Supabase env is required for seller services.");
    }
    return null;
  }

  supabase ??= createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

export function isUrlSafeSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isStoreServiceStatus(value: unknown): value is StoreServiceStatus {
  return storeServiceStatuses.includes(value as StoreServiceStatus);
}

export function isStoreServiceSourceType(value: unknown): value is StoreServiceSourceType {
  return storeServiceSourceTypes.includes(value as StoreServiceSourceType);
}

export function isServiceMethod(value: unknown): value is ServiceMethod {
  return value === "GET" || value === "POST";
}

function formatUsdc(amount: number) {
  const formatted = amount.toFixed(6).replace(/\.?0+$/, "");
  return formatted === "" ? "0" : formatted;
}

export function sellerServiceEndpoint(slug: string) {
  return `/api/store/services/${slug}/invoke`;
}

function toPriceUsd(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rowToApiService(row: StoreServiceRow): ApiService {
  const priceUsd = toPriceUsd(row.price_usdc);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    category: row.category,
    method: row.method,
    endpoint: sellerServiceEndpoint(row.slug),
    priceLabel: `${formatUsdc(priceUsd)} USDC`,
    priceUsd,
    status: row.status as ServiceStatus,
    sourceType: row.source_type as ServiceSourceType,
    isPaid: priceUsd > 0 && row.status === "live",
    inputSchema: row.input_schema ?? {},
    outputSchema: row.output_schema ?? {},
    exampleRequest: row.example_request ?? {},
    exampleResponse: row.example_response ?? {},
    exampleUseCase: row.example_use_case,
    agentReasoningHint: row.agent_reasoning_hint,
  };
}

export function rowToSellerService(row: StoreServiceRow): SellerStoreService {
  const service = rowToApiService(row);

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: service.name,
    slug: service.slug,
    shortDescription: service.shortDescription,
    longDescription: service.longDescription,
    category: service.category,
    method: service.method,
    endpoint: service.endpoint,
    priceUsd: service.priceUsd,
    priceLabel: service.priceLabel,
    status: row.status,
    sourceType: row.source_type,
    inputSchema: service.inputSchema,
    outputSchema: service.outputSchema,
    exampleRequest: service.exampleRequest,
    exampleResponse: service.exampleResponse,
    exampleUseCase: service.exampleUseCase,
    agentReasoningHint: service.agentReasoningHint,
  };
}

function inputToPayload(input: DynamicStoreServiceInput) {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    short_description: input.shortDescription.trim(),
    long_description: input.longDescription.trim(),
    category: input.category.trim(),
    method: input.method,
    price_usdc: input.priceUsd,
    status: input.status,
    source_type: input.sourceType,
    input_schema: input.inputSchema,
    output_schema: input.outputSchema,
    example_request: input.exampleRequest,
    example_response: input.exampleResponse,
    example_use_case: input.exampleUseCase.trim(),
    agent_reasoning_hint: input.agentReasoningHint.trim(),
  };
}

function assertNoStaticSlug(slug: string) {
  if (getServiceBySlug(slug)) {
    throw new Error(`Slug "${slug}" is reserved by an official API Store service.`);
  }
}

export async function listDynamicStoreServiceRows({
  publicOnly = false,
}: { publicOnly?: boolean } = {}) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      services: [] as StoreServiceRow[],
      warning: "Supabase service role env is missing; showing official services only.",
    };
  }

  let query = client
    .from("store_services")
    .select(storeServiceColumns)
    .order("created_at", { ascending: false });

  if (publicOnly) {
    query = query.in("status", [...publicDynamicStatuses]);
  }

  const { data, error } = await query;

  if (error) {
    console.warn(`[store-services] Failed to list dynamic services: ${error.message}`);
    return {
      services: [] as StoreServiceRow[],
      warning: "Seller-created services are temporarily unavailable.",
    };
  }

  return {
    services: (data ?? []) as unknown as StoreServiceRow[],
    warning: null,
  };
}

export async function listDynamicStoreServices() {
  const result = await listDynamicStoreServiceRows({ publicOnly: true });

  return {
    services: result.services.map(rowToApiService),
    warning: result.warning,
  };
}

export async function listAllStoreServices() {
  const dynamic = await listDynamicStoreServices();
  const staticSlugs = new Set(serviceRegistry.map((service) => service.slug));
  const safeDynamicServices = dynamic.services.filter(
    (service) => !staticSlugs.has(service.slug),
  );

  return {
    services: [...serviceRegistry, ...safeDynamicServices],
    warning: dynamic.warning,
  };
}

export async function getDynamicStoreServiceRowBySlug(
  slug: string,
  { publicOnly = true }: { publicOnly?: boolean } = {},
) {
  const client = getServiceSupabase();
  if (!client) return null;

  let query = client
    .from("store_services")
    .select(storeServiceColumns)
    .eq("slug", slug);

  if (publicOnly) {
    query = query.in("status", [...publicDynamicStatuses]);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn(`[store-services] Failed to get service by slug: ${error.message}`);
    return null;
  }

  return (data as unknown as StoreServiceRow | null) ?? null;
}

export async function getDynamicStoreServiceBySlug(slug: string) {
  const row = await getDynamicStoreServiceRowBySlug(slug);
  return row ? rowToApiService(row) : null;
}

export async function getDynamicStoreServiceRowById(id: string) {
  const client = getServiceSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from("store_services")
    .select(storeServiceColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn(`[store-services] Failed to get service by id: ${error.message}`);
    return null;
  }

  return (data as unknown as StoreServiceRow | null) ?? null;
}

export async function getStoreServiceBySlug(slug: string) {
  const staticService = getServiceBySlug(slug);
  if (staticService) return staticService;
  return getDynamicStoreServiceBySlug(slug);
}

export async function createDynamicStoreService(input: DynamicStoreServiceInput) {
  assertNoStaticSlug(input.slug);
  const client = getServiceSupabase({ required: true });
  if (!client) throw new Error("Supabase service role env is required for seller services.");
  const { data, error } = await client
    .from("store_services")
    .insert(inputToPayload(input))
    .select(storeServiceColumns)
    .single();

  if (error) {
    throw new Error(safeErrorMessage(error));
  }

  return rowToSellerService(data as unknown as StoreServiceRow);
}

export async function updateDynamicStoreService(
  id: string,
  input: DynamicStoreServiceInput,
) {
  assertNoStaticSlug(input.slug);
  const client = getServiceSupabase({ required: true });
  if (!client) throw new Error("Supabase service role env is required for seller services.");
  const { data, error } = await client
    .from("store_services")
    .update(inputToPayload(input))
    .eq("id", id)
    .select(storeServiceColumns)
    .single();

  if (error) {
    throw new Error(safeErrorMessage(error));
  }

  return rowToSellerService(data as unknown as StoreServiceRow);
}

export function categoriesForServices(services: readonly ApiService[]) {
  return Array.from(new Set(services.map((service) => service.category))).sort();
}
