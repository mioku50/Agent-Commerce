import type {
  ApiService,
  ServiceSourceType,
} from "./registry.ts";

export type ServiceProviderType =
  | "live_provider"
  | "internal_deterministic"
  | "seller_mock"
  | "external_placeholder"
  | "external_seller";

export type ServicePresentationMetadata = {
  providerType: ServiceProviderType;
  providerName: string | null;
  providerStatus: "live" | "deterministic" | "mock" | "placeholder" | "external";
  assetSymbol: string | null;
  dataFreshness: string | null;
  billingLabel: string;
};

export function defaultServicePresentation(
  sourceType: ServiceSourceType,
): ServicePresentationMetadata {
  if (sourceType === "provider_backed") {
    return {
      providerType: "live_provider",
      providerName: "External provider",
      providerStatus: "live",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: "USDC pays Arc Agent Commerce for access to its provider-backed API.",
    };
  }
  if (sourceType === "seller_mock") {
    return {
      providerType: "seller_mock",
      providerName: null,
      providerStatus: "mock",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: "Seller-created mock response fulfilled by Arc Agent Commerce.",
    };
  }
  if (sourceType === "external_placeholder") {
    return {
      providerType: "external_placeholder",
      providerName: null,
      providerStatus: "placeholder",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: "External fulfillment is not enabled for this placeholder service.",
    };
  }
  if (sourceType === "external_seller") {
    return {
      providerType: "external_seller",
      providerName: "Real external seller",
      providerStatus: "external",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: "Arc Agent Commerce validates the payment challenge and pays the external seller via x402.",
    };
  }
  return {
    providerType: "internal_deterministic",
    providerName: null,
    providerStatus: "deterministic",
    assetSymbol: null,
    dataFreshness: null,
    billingLabel: "USDC pays Arc Agent Commerce for this deterministic API service.",
  };
}

export function servicePresentationMetadata(
  service: Pick<ApiService, "sourceType" | "presentation">,
  assetSymbol?: string | null,
) {
  const presentation = service.presentation ?? defaultServicePresentation(service.sourceType);
  return {
    ...presentation,
    assetSymbol:
      presentation.providerType === "live_provider"
        ? assetSymbol ?? presentation.assetSymbol
        : presentation.assetSymbol,
  } satisfies ServicePresentationMetadata;
}

export function servicePresentationLabel(metadata: ServicePresentationMetadata) {
  if (metadata.providerType === "live_provider") {
    return `Live Provider · ${metadata.providerName ?? "External provider"}`;
  }
  if (metadata.providerType === "seller_mock") return "Seller-created mock";
  if (metadata.providerType === "external_placeholder") return "External placeholder";
  if (metadata.providerType === "external_seller") return "External Seller API";
  return "Internal deterministic";
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function providerResponsePresentation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const providerName = safeString(result.provider);
  if (!providerName) return null;
  const interval =
    result.confidenceInterval && typeof result.confidenceInterval === "object"
      ? result.confidenceInterval as Record<string, unknown>
      : null;
  return {
    providerName,
    assetSymbol: safeString(result.symbol),
    price: safeString(result.price),
    confidence: safeString(result.confidence),
    confidenceLow: safeString(interval?.low),
    confidenceHigh: safeString(interval?.high),
    publishTime: safeString(result.publishTime),
    fetchedAt: safeString(result.fetchedAt),
    priceAgeSeconds: safeNumber(result.priceAgeSeconds),
    paidAmountUsdc: safeString(result.paidAmountUsdc),
  };
}
