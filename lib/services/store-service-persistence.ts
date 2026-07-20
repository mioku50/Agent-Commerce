import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../supabase/server-env.ts";
import {
  getServiceBySlug,
  serviceRegistry,
  type ApiService,
  type ServiceMethod,
  type ServiceSourceType,
  type ServiceStatus,
} from "./registry.ts";

export type StoreServiceStatus = "draft" | "verifying" | "live" | "disabled" | "coming-soon";
export type StoreServiceSourceType = "seller_mock" | "external_placeholder" | "external_seller";

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
  fulfillment_url?: string;
  seller_wallet?: string;
  expected_network?: string;
  expected_asset?: string;
  max_timeout_ms?: number;
  max_response_size_bytes?: number;
  wallet_verification_status?: "unverified" | "verified";
  endpoint_verification_status?: "unverified" | "verified";
  wallet_verification_challenge?: string;
  endpoint_verification_nonce?: string;
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
  fulfillmentUrl?: string;
  sellerWallet?: string;
  expectedNetwork?: string;
  expectedAsset?: string;
  maxTimeoutMs?: number;
  maxResponseSizeBytes?: number;
  walletVerificationStatus?: "unverified" | "verified";
  endpointVerificationStatus?: "unverified" | "verified";
  walletVerificationChallenge?: string;
  endpointVerificationNonce?: string;
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
  fulfillmentUrl?: string;
  sellerWallet?: string;
  expectedNetwork?: string;
  expectedAsset?: string;
  maxTimeoutMs?: number;
  maxResponseSizeBytes?: number;
  walletVerificationStatus?: "unverified" | "verified";
  endpointVerificationStatus?: "unverified" | "verified";
  walletVerificationChallenge?: string;
  endpointVerificationNonce?: string;
};

export const storeServiceStatuses: readonly StoreServiceStatus[] = [
  "draft",
  "verifying",
  "live",
  "coming-soon",
  "disabled",
];

export const storeServiceSourceTypes: readonly StoreServiceSourceType[] = [
  "seller_mock",
  "external_placeholder",
  "external_seller",
];

const storeServiceBaseColumns = [
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

const storeServiceColumns = [
  storeServiceBaseColumns,
  "fulfillment_url",
  "seller_wallet",
  "expected_network",
  "expected_asset",
  "max_timeout_ms",
  "max_response_size_bytes",
  "wallet_verification_status",
  "endpoint_verification_status",
  "wallet_verification_challenge",
  "endpoint_verification_nonce",
].join(",");

const publicDynamicStatuses: readonly StoreServiceStatus[] = [
  "live",
  "verifying",
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
    fulfillmentUrl: row.fulfillment_url || (typeof row.raw?.fulfillmentUrl === "string" ? row.raw.fulfillmentUrl : undefined),
    sellerWallet: row.seller_wallet || (typeof row.raw?.sellerWallet === "string" ? row.raw.sellerWallet : undefined),
    expectedNetwork: row.expected_network || (typeof row.raw?.expectedNetwork === "string" ? row.raw.expectedNetwork : "eip155:5042002"),
    expectedAsset: row.expected_asset || (typeof row.raw?.expectedAsset === "string" ? row.raw.expectedAsset : "0x3600000000000000000000000000000000000000"),
    maxTimeoutMs: typeof row.max_timeout_ms === "number" ? row.max_timeout_ms : (typeof row.raw?.maxTimeoutMs === "number" ? row.raw.maxTimeoutMs : 15000),
    maxResponseSizeBytes: typeof row.max_response_size_bytes === "number" ? row.max_response_size_bytes : (typeof row.raw?.maxResponseSizeBytes === "number" ? row.raw.maxResponseSizeBytes : 1048576),
    walletVerificationStatus: row.wallet_verification_status || (row.raw?.walletVerificationStatus as "unverified" | "verified") || "unverified",
    endpointVerificationStatus: row.endpoint_verification_status || (row.raw?.endpointVerificationStatus as "unverified" | "verified") || "unverified",
    walletVerificationChallenge: row.wallet_verification_challenge || (typeof row.raw?.walletVerificationChallenge === "string" ? row.raw.walletVerificationChallenge : ""),
    endpointVerificationNonce: row.endpoint_verification_nonce || (typeof row.raw?.endpointVerificationNonce === "string" ? row.raw.endpointVerificationNonce : ""),
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
    fulfillmentUrl: service.fulfillmentUrl,
    sellerWallet: service.sellerWallet,
    expectedNetwork: service.expectedNetwork,
    expectedAsset: service.expectedAsset,
    maxTimeoutMs: service.maxTimeoutMs,
    maxResponseSizeBytes: service.maxResponseSizeBytes,
    walletVerificationStatus: service.walletVerificationStatus,
    endpointVerificationStatus: service.endpointVerificationStatus,
    walletVerificationChallenge: service.walletVerificationChallenge,
    endpointVerificationNonce: service.endpointVerificationNonce,
  };
}

function inputToPayload(input: DynamicStoreServiceInput) {
  const base: Record<string, unknown> = {
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
    raw: {
      fulfillmentUrl: input.fulfillmentUrl,
      sellerWallet: input.sellerWallet,
      expectedNetwork: input.expectedNetwork,
      expectedAsset: input.expectedAsset,
      maxTimeoutMs: input.maxTimeoutMs,
      maxResponseSizeBytes: input.maxResponseSizeBytes,
      walletVerificationStatus: input.walletVerificationStatus,
      endpointVerificationStatus: input.endpointVerificationStatus,
      walletVerificationChallenge: input.walletVerificationChallenge,
      endpointVerificationNonce: input.endpointVerificationNonce,
    },
  };
  if (input.fulfillmentUrl !== undefined) base.fulfillment_url = input.fulfillmentUrl;
  if (input.sellerWallet !== undefined) base.seller_wallet = input.sellerWallet;
  if (input.expectedNetwork !== undefined) base.expected_network = input.expectedNetwork;
  if (input.expectedAsset !== undefined) base.expected_asset = input.expectedAsset;
  if (input.maxTimeoutMs !== undefined) base.max_timeout_ms = input.maxTimeoutMs;
  if (input.maxResponseSizeBytes !== undefined) base.max_response_size_bytes = input.maxResponseSizeBytes;
  if (input.walletVerificationStatus !== undefined) base.wallet_verification_status = input.walletVerificationStatus;
  if (input.endpointVerificationStatus !== undefined) base.endpoint_verification_status = input.endpointVerificationStatus;
  if (input.walletVerificationChallenge !== undefined) base.wallet_verification_challenge = input.walletVerificationChallenge;
  if (input.endpointVerificationNonce !== undefined) base.endpoint_verification_nonce = input.endpointVerificationNonce;
  return base;
}

function baseInputPayload(input: DynamicStoreServiceInput) {
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
    raw: {
      fulfillmentUrl: input.fulfillmentUrl,
      sellerWallet: input.sellerWallet,
      expectedNetwork: input.expectedNetwork,
      expectedAsset: input.expectedAsset,
      maxTimeoutMs: input.maxTimeoutMs,
      maxResponseSizeBytes: input.maxResponseSizeBytes,
      walletVerificationStatus: input.walletVerificationStatus,
      endpointVerificationStatus: input.endpointVerificationStatus,
      walletVerificationChallenge: input.walletVerificationChallenge,
      endpointVerificationNonce: input.endpointVerificationNonce,
    },
  };
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || (typeof error.message === "string" && error.message.includes("does not exist"));
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

  let { data, error } = await query;

  if (error && isMissingColumnError(error)) {
    let fallbackQuery = client
      .from("store_services")
      .select(storeServiceBaseColumns)
      .order("created_at", { ascending: false });
    if (publicOnly) fallbackQuery = fallbackQuery.in("status", [...publicDynamicStatuses]);
    const res = await fallbackQuery;
    data = res.data;
    error = res.error;
  }

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

  let { data, error } = await query.maybeSingle();

  if (error && isMissingColumnError(error)) {
    let fallbackQuery = client
      .from("store_services")
      .select(storeServiceBaseColumns)
      .eq("slug", slug);
    if (publicOnly) fallbackQuery = fallbackQuery.in("status", [...publicDynamicStatuses]);
    const res = await fallbackQuery.maybeSingle();
    data = res.data;
    error = res.error;
  }

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

  let { data, error } = await client
    .from("store_services")
    .select(storeServiceColumns)
    .eq("id", id)
    .maybeSingle();

  if (error && isMissingColumnError(error)) {
    const res = await client
      .from("store_services")
      .select(storeServiceBaseColumns)
      .eq("id", id)
      .maybeSingle();
    data = res.data;
    error = res.error;
  }

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
  let { data, error } = await client
    .from("store_services")
    .insert(inputToPayload(input))
    .select(storeServiceColumns)
    .single();

  if (error && isMissingColumnError(error)) {
    const res = await client
      .from("store_services")
      .insert(baseInputPayload(input))
      .select(storeServiceBaseColumns)
      .single();
    data = res.data;
    error = res.error;
  }

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
  let { data, error } = await client
    .from("store_services")
    .update(inputToPayload(input))
    .eq("id", id)
    .select(storeServiceColumns)
    .single();

  if (error && isMissingColumnError(error)) {
    const res = await client
      .from("store_services")
      .update(baseInputPayload(input))
      .eq("id", id)
      .select(storeServiceBaseColumns)
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) {
    throw new Error(safeErrorMessage(error));
  }

  return rowToSellerService(data as unknown as StoreServiceRow);
}

export function categoriesForServices(services: readonly ApiService[]) {
  return Array.from(new Set(services.map((service) => service.category))).sort();
}
