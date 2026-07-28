import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAddress, isAddress, type Address } from "viem";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";
import { redactHostedWorkflowText, rejectHostedWorkflowSecrets } from "../agent/hosted-workflows.ts";
import { getHostedWorkflowCheckoutConfig } from "../agent/workflow-pricing.ts";
import { validateUrlSsrf, verifyDnsSsrf } from "./ssrf.ts";
import { encryptSellerEndpointSecret } from "./endpoint-secret.ts";
import {
  validateJsonSchemaValue,
  validateSupportedJsonSchema,
  type JsonSchema,
} from "./json-schema.ts";

export type SellerServiceStatus = "draft" | "active" | "paused" | "unavailable" | "archived";
export type SellerServiceMethod = "GET" | "POST";
export type SellerReviewStatus = "draft" | "pending" | "approved" | "changes_requested" | "rejected";
export type SellerAvailabilityStatus = "unknown" | "healthy" | "degraded" | "unavailable";

export type SellerAccountRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  status: "active" | "paused";
  display_name: string | null;
  onboarding_status: "pending" | "active" | "suspended";
  terms_accepted_at: string | null;
  onboarding_completed_at: string | null;
  settlement_mode: "direct_x402";
  created_at: string;
  updated_at: string;
};

export type SellerMarketplaceServiceRow = {
  id: string;
  public_id: string;
  seller_id: string;
  service_version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  name: string;
  slug: string;
  short_description: string;
  long_description: string;
  category: string;
  method: SellerServiceMethod;
  price_usdc: string | number;
  status: SellerServiceStatus;
  source_type: "external_seller";
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  fulfillment_url: string;
  seller_wallet: string;
  max_timeout_ms: number;
  max_response_size_bytes: number;
  review_status: SellerReviewStatus;
  review_submitted_at: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  availability_status: SellerAvailabilityStatus;
  last_health_check_at: string | null;
  last_healthy_at: string | null;
  consecutive_health_failures: number;
  health_check_input: Record<string, unknown>;
};

export type SellerServiceVersionRow = {
  id: string;
  service_id: string;
  seller_id: string;
  service_version: number;
  name: string;
  short_description: string;
  long_description: string;
  category: string;
  method: SellerServiceMethod;
  price_usdc: string | number;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  fulfillment_url: string;
  max_timeout_ms: number;
  max_response_size_bytes: number;
  expected_network: string;
  expected_asset: string;
  endpoint_auth_scheme: "none" | "bearer";
  endpoint_auth_ciphertext: string | null;
  health_check_input: Record<string, unknown>;
  created_at: string;
};

export type SellerServiceInput = {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription?: string;
  category: string;
  method: SellerServiceMethod;
  priceUsdc: string | number;
  status?: SellerServiceStatus;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  healthCheckInput?: Record<string, unknown>;
  fulfillmentUrl: string;
  timeoutMs: number;
  maxResponseSizeBytes?: number;
  sellerWallet?: string;
  authorizationSecret?: string;
  clearAuthorizationSecret?: boolean;
};

export type PublicSellerWorkflow = {
  workflowType: string;
  serviceId: string;
  serviceVersion: number;
  name: string;
  description: string;
  providerType: "external_seller";
  priceUsdc: string;
  category: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  availability: "available" | "unavailable";
};

let clientOverride: SupabaseClient | null = null;

export function setSellerMarketplaceClientForTesting(client: SupabaseClient | null) {
  clientOverride = client;
}

export function getSellerMarketplaceClient() {
  if (clientOverride) return clientOverride;
  const config = getServerSupabaseConfig();
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < min || result.length > max) {
    throw new Error(`${label} must contain ${min}-${max} characters.`);
  }
  return result;
}

function normalizeSlug(value: unknown) {
  if (typeof value !== "string") throw new Error("Service slug must be a string.");
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new Error("Service slug must be URL-safe lowercase text separated by hyphens.");
  }
  return slug;
}

function normalizePrice(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Price must be a positive USDC amount with at most 6 decimals.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Price must be greater than 0 USDC.");
  }
  return amount.toFixed(6).replace(/\.?0+$/, "");
}

function normalizeStatus(value: unknown, fallback: SellerServiceStatus): SellerServiceStatus {
  const status = String(value ?? fallback).trim() as SellerServiceStatus;
  if (!["draft", "active", "paused", "unavailable", "archived"].includes(status)) {
    throw new Error("Status must be draft, active, paused, unavailable, or archived.");
  }
  return status;
}

function normalizeMethod(value: unknown): SellerServiceMethod {
  const method = String(value ?? "").trim().toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("Method must be GET or POST.");
  return method;
}

function formatUsdc(value: string | number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(6).replace(/\.?0+$/, "") || "0"
    : "0";
}

export function sellerWorkflowType(slug: string) {
  return `seller_${slug.replace(/-/g, "_")}`;
}

export function isSellerWorkflowType(value: unknown): value is string {
  return typeof value === "string" && /^seller_[a-z0-9_]{3,80}$/.test(value);
}

export function canonicalSellerInput(input: unknown) {
  if (!isRecord(input)) throw new Error("Seller workflow input must be a JSON object.");
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  };
  return JSON.stringify(sort(input));
}

export function hashSellerInput(input: unknown) {
  return createHash("sha256").update(canonicalSellerInput(input)).digest("hex");
}

export function safeSellerResult(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactHostedWorkflowText(value).slice(0, 4_000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeSellerResult(item, depth + 1));
  if (!isRecord(value)) return String(value);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(?:authorization|cookie|credential|secret|token|private.?key|headers?|endpoint|fulfillment|seller.?wallet|raw)/i.test(key))
      .slice(0, 100)
      .map(([key, item]) => [key, safeSellerResult(item, depth + 1)]),
  );
}

function toPublicWorkflow(row: SellerMarketplaceServiceRow): PublicSellerWorkflow {
  return {
    workflowType: sellerWorkflowType(row.slug),
    serviceId: row.public_id,
    serviceVersion: row.service_version,
    name: row.name,
    description: row.short_description,
    providerType: "external_seller",
    priceUsdc: formatUsdc(row.price_usdc),
    category: row.category,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    availability:
      row.status === "active" &&
      row.review_status === "approved" &&
      ["healthy", "degraded"].includes(row.availability_status) &&
      !row.archived_at
        ? "available"
        : "unavailable",
  };
}

const SERVICE_COLUMNS = [
  "id", "public_id", "seller_id", "service_version", "created_at", "updated_at",
  "archived_at", "name", "slug", "short_description", "long_description", "category",
  "method", "price_usdc", "status", "source_type", "input_schema", "output_schema",
  "fulfillment_url", "seller_wallet", "max_timeout_ms", "max_response_size_bytes",
  "review_status", "review_submitted_at", "reviewed_at", "review_reason",
  "availability_status", "last_health_check_at", "last_healthy_at",
  "consecutive_health_failures", "health_check_input",
].join(",");

export async function ensureSellerAccount(ownerWallet: Address) {
  const client = getSellerMarketplaceClient();
  const wallet = getAddress(ownerWallet);
  const existing = await client
    .from("seller_accounts")
    .select("*")
    .ilike("owner_wallet", wallet)
    .maybeSingle();
  if (existing.error) throw new Error("Unable to load seller account.");
  if (existing.data) return existing.data as SellerAccountRow;
  const created = await client
    .from("seller_accounts")
    .insert({
      owner_wallet: wallet,
      status: "active",
      onboarding_status: "pending",
      settlement_mode: "direct_x402",
    })
    .select("*")
    .single();
  if (created.error) {
    const replay = await client.from("seller_accounts").select("*").ilike("owner_wallet", wallet).maybeSingle();
    if (replay.data) return replay.data as SellerAccountRow;
    throw new Error("Unable to create seller account.");
  }
  return created.data as SellerAccountRow;
}

export async function getSellerAccount(ownerWallet: Address) {
  const seller = await ensureSellerAccount(ownerWallet);
  return {
    publicId: seller.public_id,
    ownerWallet: getAddress(seller.owner_wallet),
    displayName: seller.display_name,
    status: seller.status,
    onboardingStatus: seller.onboarding_status,
    termsAcceptedAt: seller.terms_accepted_at,
    onboardingCompletedAt: seller.onboarding_completed_at,
    settlementMode: seller.settlement_mode,
  };
}

export async function completeSellerOnboarding(
  ownerWallet: Address,
  input: { displayName: unknown; termsAccepted: unknown },
) {
  const seller = await ensureSellerAccount(ownerWallet);
  if (seller.status !== "active" || seller.onboarding_status === "suspended") {
    throw new Error("Seller onboarding is suspended.");
  }
  if (input.termsAccepted !== true) {
    throw new Error("Seller terms must be accepted to complete onboarding.");
  }
  const displayName = cleanText(input.displayName, "Seller display name", 2, 80);
  const completedAt = new Date().toISOString();
  const result = await getSellerMarketplaceClient()
    .from("seller_accounts")
    .update({
      display_name: displayName,
      onboarding_status: "active",
      terms_accepted_at: seller.terms_accepted_at ?? completedAt,
      onboarding_completed_at: seller.onboarding_completed_at ?? completedAt,
      settlement_mode: "direct_x402",
    })
    .eq("id", seller.id)
    .eq("owner_wallet", seller.owner_wallet)
    .select("*")
    .single();
  if (result.error || !result.data) throw new Error("Unable to complete seller onboarding.");
  return getSellerAccount(ownerWallet);
}

function sampleForSchema(schema: JsonSchema, depth = 0): unknown {
  if (depth > 8) return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const type = schema.type;
  if (type === "string") {
    const minimum = typeof schema.minLength === "number" ? Math.max(1, schema.minLength) : 1;
    const maximum = typeof schema.maxLength === "number" ? schema.maxLength : 120;
    return "health-check-input".padEnd(minimum, "x").slice(0, maximum);
  }
  if (type === "number" || type === "integer") {
    const minimum = typeof schema.minimum === "number" ? schema.minimum : 0;
    return type === "integer" ? Math.ceil(minimum) : minimum;
  }
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object" || schema.properties) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [];
    return Object.fromEntries(required.map((key) => [
      key,
      isRecord(properties[key]) ? sampleForSchema(properties[key] as JsonSchema, depth + 1) : null,
    ]));
  }
  return null;
}

function normalizedHealthCheckInput(
  input: SellerServiceInput,
): Record<string, unknown> {
  const candidate = input.healthCheckInput ?? sampleForSchema(input.inputSchema);
  if (!isRecord(candidate)) throw new Error("Health check input must be a JSON object.");
  validateSellerWorkflowInput(candidate, input.inputSchema);
  const serialized = JSON.stringify(candidate);
  if (serialized.length > 10_000) throw new Error("Health check input must be no larger than 10000 characters.");
  return candidate;
}

async function validatedInput(
  input: SellerServiceInput,
  ownerWallet: Address,
  fallbackStatus: SellerServiceStatus,
) {
  const inputSchemaJson = JSON.stringify(input.inputSchema);
  const outputSchemaJson = JSON.stringify(input.outputSchema);
  if (
    typeof inputSchemaJson !== "string" || typeof outputSchemaJson !== "string" ||
    inputSchemaJson.length > 30_000 || outputSchemaJson.length > 30_000
  ) {
    throw new Error("Input and output schemas must each be no larger than 30000 characters.");
  }
  const inputSchemaResult = validateSupportedJsonSchema(input.inputSchema);
  if (!inputSchemaResult.ok) throw new Error(`Input schema ${inputSchemaResult.path}: ${inputSchemaResult.message}.`);
  const outputSchemaResult = validateSupportedJsonSchema(input.outputSchema);
  if (!outputSchemaResult.ok) throw new Error(`Output schema ${outputSchemaResult.path}: ${outputSchemaResult.message}.`);

  const fulfillmentUrl = validateUrlSsrf(cleanText(input.fulfillmentUrl, "HTTPS endpoint", 10, 2048));
  if (fulfillmentUrl.protocol !== "https:" && process.env.NODE_ENV !== "test") {
    throw new Error("Seller endpoints must use HTTPS.");
  }
  await verifyDnsSsrf(fulfillmentUrl.hostname);

  const timeoutMs = Number(input.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("Timeout must be an integer between 1000 and 30000 milliseconds.");
  }
  const maxResponseSizeBytes = Number(input.maxResponseSizeBytes ?? 262_144);
  if (!Number.isInteger(maxResponseSizeBytes) || maxResponseSizeBytes < 1024 || maxResponseSizeBytes > 1_048_576) {
    throw new Error("Maximum response size must be between 1024 and 1048576 bytes.");
  }
  if (input.sellerWallet && (!isAddress(input.sellerWallet) || getAddress(input.sellerWallet) !== getAddress(ownerWallet))) {
    throw new Error("Seller wallet must match the verified owner-wallet session.");
  }
  const priceUsdc = normalizePrice(input.priceUsdc);
  const checkout = getHostedWorkflowCheckoutConfig();
  if (Number(priceUsdc) + checkout.platformFeeUsdc > checkout.maxPriceUsdc) {
    throw new Error(`Service price plus checkout fee must not exceed ${checkout.maxPriceUsdc} USDC.`);
  }
  return {
    name: cleanText(input.name, "Service name", 2, 100),
    slug: normalizeSlug(input.slug),
    shortDescription: cleanText(input.shortDescription, "Short description", 10, 280),
    longDescription: cleanText(input.longDescription || input.shortDescription, "Description", 10, 2000),
    category: cleanText(input.category, "Category", 2, 80),
    method: normalizeMethod(input.method),
    priceUsdc,
    status: normalizeStatus(input.status, fallbackStatus),
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    healthCheckInput: normalizedHealthCheckInput(input),
    fulfillmentUrl: fulfillmentUrl.toString(),
    timeoutMs,
    maxResponseSizeBytes,
    sellerWallet: getAddress(ownerWallet),
    authorizationCiphertext: input.authorizationSecret
      ? encryptSellerEndpointSecret(input.authorizationSecret)
      : null,
    authorizationWasProvided: Boolean(input.authorizationSecret),
    clearAuthorizationSecret: input.clearAuthorizationSecret === true,
  };
}

function managementService(row: SellerMarketplaceServiceRow, version?: SellerServiceVersionRow | null) {
  return {
    id: row.id,
    publicId: row.public_id,
    serviceVersion: row.service_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    category: row.category,
    method: row.method,
    priceUsdc: formatUsdc(row.price_usdc),
    status: row.status,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    fulfillmentUrl: row.fulfillment_url,
    timeoutMs: row.max_timeout_ms,
    maxResponseSizeBytes: row.max_response_size_bytes,
    sellerWallet: getAddress(row.seller_wallet),
    hasAuthorizationSecret: Boolean(version?.endpoint_auth_ciphertext),
    healthCheckInput: version?.health_check_input ?? row.health_check_input,
    reviewStatus: row.review_status,
    reviewSubmittedAt: row.review_submitted_at,
    reviewedAt: row.reviewed_at,
    reviewReason: row.review_reason,
    availabilityStatus: row.availability_status,
    lastHealthCheckAt: row.last_health_check_at,
    lastHealthyAt: row.last_healthy_at,
    consecutiveHealthFailures: row.consecutive_health_failures,
  };
}

export async function listSellerServices(ownerWallet: Address) {
  const seller = await ensureSellerAccount(ownerWallet);
  const result = await getSellerMarketplaceClient()
    .from("store_services")
    .select(SERVICE_COLUMNS)
    .eq("seller_id", seller.id)
    .eq("source_type", "external_seller")
    .order("created_at", { ascending: false });
  if (result.error) throw new Error("Unable to load seller services.");
  const rows = (result.data ?? []) as unknown as SellerMarketplaceServiceRow[];
  return Promise.all(rows.map(async (row) => {
    const version = await getSellerServiceVersion(row.id, row.service_version);
    return managementService(row, version);
  }));
}

export async function getOwnedSellerService(ownerWallet: Address, serviceId: string) {
  const seller = await ensureSellerAccount(ownerWallet);
  const result = await getSellerMarketplaceClient()
    .from("store_services")
    .select(SERVICE_COLUMNS)
    .eq("id", serviceId)
    .eq("seller_id", seller.id)
    .eq("source_type", "external_seller")
    .maybeSingle();
  if (result.error) throw new Error("Unable to load seller service.");
  if (!result.data) return null;
  const row = result.data as unknown as SellerMarketplaceServiceRow;
  const version = await getSellerServiceVersion(row.id, row.service_version);
  return managementService(row, version);
}

export async function createSellerService(ownerWallet: Address, input: SellerServiceInput) {
  const seller = await ensureSellerAccount(ownerWallet);
  if (seller.status !== "active") throw new Error("Seller account is paused.");
  if (seller.onboarding_status !== "active" || !seller.terms_accepted_at) {
    throw new Error("Complete seller onboarding before creating a service.");
  }
  const value = await validatedInput(input, ownerWallet, "draft");
  if (value.status !== "draft") throw new Error("New seller services must start in draft status.");
  const client = getSellerMarketplaceClient();
  const created = await client.rpc("create_seller_service_v2", {
    p_seller_id: seller.id,
    p_name: value.name,
    p_slug: value.slug,
    p_short_description: value.shortDescription,
    p_long_description: value.longDescription,
    p_category: value.category,
    p_method: value.method,
    p_price_usdc: value.priceUsdc,
    p_input_schema: value.inputSchema,
    p_output_schema: value.outputSchema,
    p_health_check_input: value.healthCheckInput,
    p_fulfillment_url: value.fulfillmentUrl,
    p_seller_wallet: value.sellerWallet,
    p_max_timeout_ms: value.timeoutMs,
    p_max_response_size_bytes: value.maxResponseSizeBytes,
    p_endpoint_auth_ciphertext: value.authorizationCiphertext,
  });
  if (created.error || typeof created.data !== "string") {
    if (created.error?.code === "23505") throw new Error("This service slug is already in use.");
    throw new Error("Unable to create seller service.");
  }
  const [rowResult, version] = await Promise.all([
    client.from("store_services").select(SERVICE_COLUMNS).eq("id", created.data).single(),
    getSellerServiceVersion(created.data, 1),
  ]);
  if (rowResult.error || !version) throw new Error("Unable to load the created seller service.");
  return managementService(rowResult.data as unknown as SellerMarketplaceServiceRow, version);
}

function versionedConfigurationChanged(
  row: SellerMarketplaceServiceRow,
  value: Awaited<ReturnType<typeof validatedInput>>,
) {
  return row.name !== value.name ||
    row.short_description !== value.shortDescription ||
    row.long_description !== value.longDescription ||
    row.category !== value.category ||
    row.method !== value.method ||
    formatUsdc(row.price_usdc) !== value.priceUsdc ||
    JSON.stringify(row.input_schema) !== JSON.stringify(value.inputSchema) ||
    JSON.stringify(row.output_schema) !== JSON.stringify(value.outputSchema) ||
    JSON.stringify(row.health_check_input) !== JSON.stringify(value.healthCheckInput) ||
    row.fulfillment_url !== value.fulfillmentUrl ||
    row.max_timeout_ms !== value.timeoutMs ||
    row.max_response_size_bytes !== value.maxResponseSizeBytes ||
    value.authorizationWasProvided || value.clearAuthorizationSecret;
}

export async function updateSellerService(ownerWallet: Address, serviceId: string, input: SellerServiceInput) {
  const seller = await ensureSellerAccount(ownerWallet);
  if (seller.status !== "active") throw new Error("Seller account is paused.");
  if (seller.onboarding_status !== "active") throw new Error("Complete seller onboarding before editing a service.");
  const client = getSellerMarketplaceClient();
  const currentResult = await client.from("store_services").select(SERVICE_COLUMNS)
    .eq("id", serviceId).eq("seller_id", seller.id).eq("source_type", "external_seller").maybeSingle();
  if (currentResult.error) throw new Error("Unable to load seller service.");
  if (!currentResult.data) return null;
  const current = currentResult.data as unknown as SellerMarketplaceServiceRow;
  if (current.archived_at || current.status === "archived") return null;
  const value = await validatedInput(input, ownerWallet, current.status);
  const changed = versionedConfigurationChanged(current, value);
  const nextVersion = changed ? current.service_version + 1 : current.service_version;
  const version = await getSellerServiceVersion(current.id, current.service_version);
  if (!version) throw new Error("Current immutable seller service version is unavailable.");

  const authCiphertext = value.clearAuthorizationSecret
    ? null
    : value.authorizationWasProvided
      ? value.authorizationCiphertext
      : version.endpoint_auth_ciphertext;
  const status = value.status === "archived" ? "archived" : value.status;
  const updated = await client.rpc("update_seller_service_v2", {
    p_service_id: current.id,
    p_seller_id: seller.id,
    p_expected_version: current.service_version,
    p_create_version: changed,
    p_name: value.name,
    p_short_description: value.shortDescription,
    p_long_description: value.longDescription,
    p_category: value.category,
    p_method: value.method,
    p_price_usdc: value.priceUsdc,
    p_status: status,
    p_input_schema: value.inputSchema,
    p_output_schema: value.outputSchema,
    p_health_check_input: value.healthCheckInput,
    p_fulfillment_url: value.fulfillmentUrl,
    p_max_timeout_ms: value.timeoutMs,
    p_max_response_size_bytes: value.maxResponseSizeBytes,
    p_endpoint_auth_ciphertext: authCiphertext,
  });
  if (updated.error) throw new Error("Unable to atomically update the seller service version.");
  if (updated.data !== true) return null;
  const [nextRow, nextVersionRow] = await Promise.all([
    client.from("store_services").select(SERVICE_COLUMNS).eq("id", serviceId).eq("seller_id", seller.id).maybeSingle(),
    getSellerServiceVersion(serviceId, nextVersion),
  ]);
  if (nextRow.error || !nextRow.data || !nextVersionRow) throw new Error("Unable to load the updated seller service.");
  return managementService(nextRow.data as unknown as SellerMarketplaceServiceRow, nextVersionRow);
}

export async function archiveSellerService(ownerWallet: Address, serviceId: string) {
  const seller = await ensureSellerAccount(ownerWallet);
  const result = await getSellerMarketplaceClient().from("store_services").update({
    status: "archived",
    archived_at: new Date().toISOString(),
  }).eq("id", serviceId).eq("seller_id", seller.id).eq("source_type", "external_seller")
    .select("id").maybeSingle();
  if (result.error) throw new Error("Unable to archive seller service.");
  return Boolean(result.data);
}

export async function listPublicSellerWorkflows({ includeUnavailable = false } = {}) {
  let query = getSellerMarketplaceClient().from("store_services").select(SERVICE_COLUMNS)
    .eq("source_type", "external_seller").not("seller_id", "is", null).is("archived_at", null)
    .order("created_at", { ascending: true });
  if (!includeUnavailable) {
    query = query
      .eq("status", "active")
      .eq("review_status", "approved")
      .in("availability_status", ["healthy", "degraded"]);
  }
  const result = await query;
  if (result.error) throw new Error("Seller workflows are temporarily unavailable.");
  const rows = (result.data ?? []) as unknown as SellerMarketplaceServiceRow[];
  if (rows.length === 0) return [];
  const accounts = await getSellerMarketplaceClient().from("seller_accounts")
    .select("id").in("id", [...new Set(rows.map((row) => row.seller_id))])
    .eq("status", "active").eq("onboarding_status", "active");
  if (accounts.error) throw new Error("Seller workflows are temporarily unavailable.");
  const activeSellerIds = new Set((accounts.data ?? []).map((account) => account.id as string));
  return rows.filter((row) => activeSellerIds.has(row.seller_id)).map(toPublicWorkflow);
}

export async function getPublicSellerWorkflow(identifier: string) {
  let query = getSellerMarketplaceClient().from("store_services").select(SERVICE_COLUMNS)
    .eq("source_type", "external_seller").not("seller_id", "is", null).is("archived_at", null);
  if (/^svc_[a-f0-9]{20}$/.test(identifier)) query = query.eq("public_id", identifier);
  else if (isSellerWorkflowType(identifier)) query = query.eq("slug", identifier.slice(7).replace(/_/g, "-"));
  else return null;
  const result = await query.maybeSingle();
  if (result.error) throw new Error("Unable to load seller workflow.");
  if (!result.data) return null;
  const row = result.data as unknown as SellerMarketplaceServiceRow;
  const seller = await getSellerAccountById(row.seller_id);
  return seller?.status === "active" &&
    seller.onboarding_status === "active" &&
    row.status === "active" &&
    row.review_status === "approved" &&
    ["healthy", "degraded"].includes(row.availability_status)
      ? toPublicWorkflow(row)
      : null;
}

export async function getSellerServiceRowByPublicId(publicId: string) {
  const result = await getSellerMarketplaceClient().from("store_services").select(SERVICE_COLUMNS)
    .eq("public_id", publicId).eq("source_type", "external_seller").not("seller_id", "is", null).is("archived_at", null).maybeSingle();
  if (result.error) throw new Error("Unable to load seller workflow.");
  return (result.data as unknown as SellerMarketplaceServiceRow | null) ?? null;
}

export async function getSellerServiceRowById(serviceId: string) {
  const result = await getSellerMarketplaceClient().from("store_services").select(SERVICE_COLUMNS)
    .eq("id", serviceId).eq("source_type", "external_seller").not("seller_id", "is", null).maybeSingle();
  if (result.error) throw new Error("Unable to load seller workflow.");
  return (result.data as unknown as SellerMarketplaceServiceRow | null) ?? null;
}

export async function getSellerServiceRowByWorkflowType(workflowType: string) {
  if (!isSellerWorkflowType(workflowType)) return null;
  const slug = workflowType.slice("seller_".length).replace(/_/g, "-");
  const result = await getSellerMarketplaceClient().from("store_services").select(SERVICE_COLUMNS)
    .eq("slug", slug).eq("source_type", "external_seller").not("seller_id", "is", null).is("archived_at", null).maybeSingle();
  if (result.error) throw new Error("Unable to load seller workflow.");
  return (result.data as unknown as SellerMarketplaceServiceRow | null) ?? null;
}

export async function getSellerServiceVersion(serviceId: string, serviceVersion: number) {
  const result = await getSellerMarketplaceClient().from("seller_service_versions").select("*")
    .eq("service_id", serviceId).eq("service_version", serviceVersion).maybeSingle();
  if (result.error) throw new Error("Unable to load immutable seller service version.");
  return (result.data as SellerServiceVersionRow | null) ?? null;
}

export async function getSellerAccountById(sellerId: string) {
  const result = await getSellerMarketplaceClient().from("seller_accounts").select("*")
    .eq("id", sellerId).maybeSingle();
  if (result.error) throw new Error("Unable to load seller account.");
  return (result.data as SellerAccountRow | null) ?? null;
}

export function isSellerServiceRunnable(service: SellerMarketplaceServiceRow) {
  return service.status === "active" &&
    !service.archived_at &&
    service.review_status === "approved" &&
    ["healthy", "degraded"].includes(service.availability_status);
}

export function isSellerAccountRunnable(seller: SellerAccountRow) {
  return seller.status === "active" && seller.onboarding_status === "active";
}

export function validateSellerWorkflowInput(input: unknown, schema: JsonSchema) {
  const result = validateJsonSchemaValue(input, schema);
  if (!result.ok) throw new Error(`Seller workflow input ${result.path}: ${result.message}.`);
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 20) throw new Error("Seller workflow input nesting exceeds 20 levels.");
    if (typeof value === "string") rejectHostedWorkflowSecrets(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (/(?:authorization|api.?key|cookie|credential|private.?key|secret|token|headers?|seed.?phrase|mnemonic)/i.test(key)) {
        throw new Error(`Seller workflow input ${path}.${key}: sensitive fields are not accepted.`);
      }
      visit(item, `${path}.${key}`, depth + 1);
    }
  };
  visit(input, "$", 0);
}

export function validateSellerWorkflowOutput(output: unknown, schema: JsonSchema) {
  const result = validateJsonSchemaValue(output, schema);
  if (!result.ok) throw new Error(`Seller workflow output ${result.path}: ${result.message}.`);
}

export async function listSellerRevenue(ownerWallet: Address) {
  const seller = await ensureSellerAccount(ownerWallet);
  const result = await getSellerMarketplaceClient().from("seller_revenue_ledger")
    .select("id,service_id,service_version,quote_id,job_id,user_payment_id,receipt_id,payment_event_id,buyer_payment_usdc,gross_amount_usdc,platform_fee_usdc,seller_net_amount_usdc,settlement_status,settlement_mode,settlement_reference,destination_wallet,transaction_hash,earned_at,settled_at,created_at,store_services!inner(name,public_id)")
    .eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(250);
  if (result.error) throw new Error("Unable to load seller revenue ledger.");
  return result.data ?? [];
}

export async function listSellerSettlements(ownerWallet: Address) {
  const seller = await ensureSellerAccount(ownerWallet);
  const result = await getSellerMarketplaceClient().from("seller_settlements")
    .select("public_id,ledger_id,payment_event_id,settlement_mode,amount_usdc,destination_wallet,gateway_transaction,status,confirmed_at,created_at")
    .eq("seller_id", seller.id).order("confirmed_at", { ascending: false }).limit(250);
  if (result.error) throw new Error("Unable to load seller settlements.");
  return result.data ?? [];
}

export async function listSellerServiceReviews(ownerWallet: Address, serviceId?: string) {
  const seller = await ensureSellerAccount(ownerWallet);
  let query = getSellerMarketplaceClient().from("seller_service_reviews")
    .select("id,service_id,service_version,status,reviewer_type,checks,reason,created_at")
    .eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(100);
  if (serviceId) query = query.eq("service_id", serviceId);
  const result = await query;
  if (result.error) throw new Error("Unable to load seller service reviews.");
  return result.data ?? [];
}

export async function listSellerHealthChecks(ownerWallet: Address, serviceId?: string) {
  const seller = await ensureSellerAccount(ownerWallet);
  let query = getSellerMarketplaceClient().from("seller_service_health_checks")
    .select("id,service_id,service_version,status,latency_ms,error_code,checked_at")
    .eq("seller_id", seller.id).order("checked_at", { ascending: false }).limit(100);
  if (serviceId) query = query.eq("service_id", serviceId);
  const result = await query;
  if (result.error) throw new Error("Unable to load seller availability history.");
  return result.data ?? [];
}
