import {
  isServiceMethod,
  isStoreServiceSourceType,
  isStoreServiceStatus,
  isUrlSafeSlug,
  normalizeSlug,
  sellerServiceEndpoint,
  type DynamicStoreServiceInput,
} from "@/lib/services/store-service-persistence";

type ValidationResult =
  | { input: DynamicStoreServiceInput; context: ValidationContext }
  | { error: string; status: number; context: ValidationContext };

export type ValidationContext = {
  slug: string | null;
  normalizedStatus: string | null;
  normalizedSourceType: string | null;
  normalizedMethod: string | null;
  price: number | null;
};

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

const emptyContext: ValidationContext = {
  slug: null,
  normalizedStatus: null,
  normalizedSourceType: null,
  normalizedMethod: null,
  price: null,
};

function isJsonObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readValue(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (body[key] !== undefined) return body[key];
  }
  return undefined;
}

function readString(body: Record<string, unknown>, ...keys: string[]) {
  const value = readValue(body, ...keys);
  return typeof value === "string" ? value.trim() : "";
}

function readJsonObject(
  body: Record<string, unknown>,
  keys: string[],
  fallback: Record<string, unknown> = {},
) {
  const value = readValue(body, ...keys);
  if (value === undefined) return fallback;
  return isJsonObject(value) ? value : null;
}

function normalizeEnumText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function normalizeStatus(value: unknown) {
  const normalized = normalizeEnumText(value);
  if (normalized === "coming-soon" || normalized === "comingsoon") {
    return "coming-soon";
  }
  return normalized;
}

function normalizeSourceType(value: unknown) {
  const normalized = normalizeEnumText(value);
  if (
    normalized === "seller-mock" ||
    normalized === "seller-mock-response" ||
    normalized === "seller-created" ||
    normalized === "seller-created-demo-service"
  ) {
    return "seller_mock";
  }
  if (
    normalized === "external-placeholder" ||
    normalized === "external-fulfillment" ||
    normalized === "external-api"
  ) {
    return "external_placeholder";
  }
  return normalized.replace(/-/g, "_");
}

function normalizeMethod(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePrice(value: unknown) {
  const raw = String(value ?? "").trim().replace(",", ".");

  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) {
    return null;
  }

  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function fail(
  error: string,
  context: ValidationContext,
  status = 400,
): ValidationResult {
  return { error, status, context };
}

export async function parseSellerServiceRequest(
  request: Request,
): Promise<ValidationResult> {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON.", emptyContext);
  }

  const name = readString(body, "name");
  const slug = readString(body, "slug");
  const shortDescription = readString(body, "shortDescription", "short_description");
  const longDescription =
    readString(body, "longDescription", "long_description") || shortDescription;
  const category = readString(body, "category");
  const exampleUseCase = readString(body, "exampleUseCase", "example_use_case");
  const agentReasoningHint =
    readString(body, "agentReasoningHint", "agent_reasoning_hint") || exampleUseCase;
  const method = normalizeMethod(readValue(body, "method"));
  const status = normalizeStatus(readValue(body, "status"));
  const sourceType = normalizeSourceType(readValue(body, "sourceType", "source_type"));
  const priceUsd = normalizePrice(readValue(body, "priceUsd", "price_usd", "price_usdc"));
  const context: ValidationContext = {
    slug: slug || null,
    normalizedStatus: status || null,
    normalizedSourceType: sourceType || null,
    normalizedMethod: method || null,
    price: priceUsd,
  };

  if (!name) return fail("name is required.", context);
  if (!slug) return fail("slug is required.", context);
  if (slug !== normalizeSlug(slug) || !isUrlSafeSlug(slug)) {
    return fail(
      "slug must be lowercase, URL-safe, and use hyphens between words.",
      context,
    );
  }
  if (!shortDescription) {
    return fail("shortDescription is required.", context);
  }
  if (!category) return fail("category is required.", context);
  if (!isServiceMethod(method)) {
    return fail("method must be GET or POST.", context);
  }
  if (priceUsd === null) {
    return fail("Price must be a valid number like 0.002", context);
  }
  if (!isStoreServiceStatus(status)) {
    return fail("status must be draft, live, coming-soon, or disabled.", context);
  }
  if (!isStoreServiceSourceType(sourceType)) {
    return fail("sourceType must be seller_mock or external_placeholder.", context);
  }

  const inputSchema = readJsonObject(body, ["inputSchema", "input_schema"]);
  const outputSchema = readJsonObject(body, ["outputSchema", "output_schema"]);
  const exampleRequest = readJsonObject(body, ["exampleRequest", "example_request"], {
    method,
    endpoint: sellerServiceEndpoint(slug),
  });
  const exampleResponse = readJsonObject(body, ["exampleResponse", "example_response"]);

  if (!inputSchema) return fail("inputSchema must be a JSON object.", context);
  if (!outputSchema) return fail("outputSchema must be a JSON object.", context);
  if (!exampleRequest) {
    return fail("exampleRequest must be a JSON object.", context);
  }
  if (!exampleResponse) {
    return fail("exampleResponse must be a JSON object.", context);
  }

  return {
    context,
    input: {
      name,
      slug,
      shortDescription,
      longDescription,
      category,
      method,
      priceUsd,
      status,
      sourceType,
      inputSchema,
      outputSchema,
      exampleRequest,
      exampleResponse,
      exampleUseCase,
      agentReasoningHint,
    },
  };
}
