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
  | { input: DynamicStoreServiceInput }
  | { error: string; status: number };

function isJsonObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function readJsonObject(
  body: Record<string, unknown>,
  key: string,
  fallback: Record<string, unknown> = {},
) {
  const value = body[key];
  if (value === undefined) return fallback;
  return isJsonObject(value) ? value : null;
}

export async function parseSellerServiceRequest(
  request: Request,
): Promise<ValidationResult> {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return { error: "Request body must be valid JSON.", status: 400 };
  }

  const name = readString(body, "name");
  const slug = readString(body, "slug");
  const shortDescription = readString(body, "shortDescription");
  const longDescription = readString(body, "longDescription") || shortDescription;
  const category = readString(body, "category");
  const exampleUseCase = readString(body, "exampleUseCase");
  const agentReasoningHint =
    readString(body, "agentReasoningHint") || exampleUseCase;
  const method = body.method;
  const status = body.status;
  const sourceType = body.sourceType;
  const priceUsd = Number(body.priceUsd);

  if (!name) return { error: "name is required.", status: 400 };
  if (!slug) return { error: "slug is required.", status: 400 };
  if (slug !== normalizeSlug(slug) || !isUrlSafeSlug(slug)) {
    return {
      error: "slug must be lowercase, URL-safe, and use hyphens between words.",
      status: 400,
    };
  }
  if (!shortDescription) {
    return { error: "shortDescription is required.", status: 400 };
  }
  if (!category) return { error: "category is required.", status: 400 };
  if (!isServiceMethod(method)) {
    return { error: "method must be GET or POST.", status: 400 };
  }
  if (!Number.isFinite(priceUsd) || priceUsd < 0) {
    return { error: "priceUsd must be a number greater than or equal to 0.", status: 400 };
  }
  if (!isStoreServiceStatus(status)) {
    return {
      error: "status must be draft, live, coming-soon, or disabled.",
      status: 400,
    };
  }
  if (!isStoreServiceSourceType(sourceType)) {
    return {
      error: "sourceType must be seller_mock or external_placeholder.",
      status: 400,
    };
  }

  const inputSchema = readJsonObject(body, "inputSchema");
  const outputSchema = readJsonObject(body, "outputSchema");
  const exampleRequest = readJsonObject(body, "exampleRequest", {
    method,
    endpoint: sellerServiceEndpoint(slug),
  });
  const exampleResponse = readJsonObject(body, "exampleResponse");

  if (!inputSchema) return { error: "inputSchema must be a JSON object.", status: 400 };
  if (!outputSchema) return { error: "outputSchema must be a JSON object.", status: 400 };
  if (!exampleRequest) {
    return { error: "exampleRequest must be a JSON object.", status: 400 };
  }
  if (!exampleResponse) {
    return { error: "exampleResponse must be a JSON object.", status: 400 };
  }

  return {
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
