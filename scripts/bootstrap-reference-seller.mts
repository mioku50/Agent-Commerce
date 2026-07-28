import { getAddress, isAddress } from "viem";
import {
  completeSellerOnboarding,
  createSellerService,
  getSellerServiceRowByWorkflowType,
  getOwnedSellerService,
  updateSellerService,
} from "../lib/seller/marketplace.ts";
import {
  checkOwnedSellerServiceAvailability,
  submitSellerServiceReview,
} from "../lib/seller/lifecycle.ts";

const sellerAddressValue = process.env.SELLER_ADDRESS?.trim();
if (!sellerAddressValue || !isAddress(sellerAddressValue)) {
  throw new Error("SELLER_ADDRESS must be configured for the x402 reference seller.");
}
const ownerValue = process.env.REFERENCE_SELLER_WALLET?.trim() || sellerAddressValue;
if (!isAddress(ownerValue)) {
  throw new Error("REFERENCE_SELLER_WALLET must be a valid EVM address when configured.");
}
const baseValue = process.env.REFERENCE_SELLER_BASE_URL?.trim()
  || process.env.HOSTED_AGENT_BASE_URL?.trim()
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
if (!baseValue) throw new Error("REFERENCE_SELLER_BASE_URL or HOSTED_AGENT_BASE_URL must be configured.");
const baseUrl = new URL(baseValue);
if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") {
  throw new Error("Reference seller base URL must use HTTPS.");
}

const ownerWallet = getAddress(ownerValue);
const serviceInput = {
  name: "Project Update Intelligence",
  slug: "project-update-intelligence",
  shortDescription: "Turns a raw project update into shipping highlights, risks, next milestones, and confidence.",
  longDescription: "A production reference external seller workflow that analyzes a project update through the same versioned checkout, x402 fulfillment, schema validation, receipt, revenue, and Arc proof pipeline used by community sellers.",
  category: "Project Intelligence",
  method: "POST" as const,
  priceUsdc: "0.002",
  status: "active" as const,
  fulfillmentUrl: new URL("/api/reference-seller/project-update-intelligence", baseUrl).toString(),
  timeoutMs: 15_000,
  maxResponseSizeBytes: 131_072,
  inputSchema: {
    type: "object",
    properties: {
      projectName: { type: "string", minLength: 2, maxLength: 120 },
      updateText: { type: "string", minLength: 20, maxLength: 4500 },
    },
    required: ["projectName", "updateText"],
    additionalProperties: false,
  },
  healthCheckInput: {
    projectName: "Agent Commerce Reference",
    updateText: "Availability review confirms the production reference seller can issue an exact Arc Testnet x402 challenge.",
  },
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      shippingHighlights: { type: "array", items: { type: "string" }, maxItems: 5 },
      risks: { type: "array", items: { type: "string" }, maxItems: 5 },
      nextMilestones: { type: "array", items: { type: "string" }, maxItems: 5 },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["summary", "shippingHighlights", "risks", "nextMilestones", "confidence"],
    additionalProperties: false,
  },
};

await completeSellerOnboarding(ownerWallet, {
  displayName: "Agent Commerce Reference Seller",
  termsAccepted: true,
});

const existing = await getSellerServiceRowByWorkflowType("seller_project_update_intelligence");
let service;
if (!existing) {
  service = await createSellerService(ownerWallet, { ...serviceInput, status: "draft" });
} else {
  const owned = await getOwnedSellerService(ownerWallet, existing.id);
  if (!owned) throw new Error("Reference seller slug is owned by another seller account.");
  service = await updateSellerService(ownerWallet, existing.id, {
    ...serviceInput,
    status: owned.reviewStatus === "approved" ? "active" : "draft",
  });
  if (!service) throw new Error("Reference seller service update failed.");
}

if (service.reviewStatus !== "approved") {
  const review = await submitSellerServiceReview(ownerWallet, service.id);
  if (!review || review.reviewStatus !== "approved") {
    throw new Error(`Reference seller review failed (${review?.reason ?? "unknown"}).`);
  }
} else {
  const health = await checkOwnedSellerServiceAvailability(ownerWallet, service.id);
  if (!health?.healthy) throw new Error(`Reference seller health check failed (${health?.errorCode ?? "unknown"}).`);
}
const ready = await getOwnedSellerService(ownerWallet, service.id);
if (!ready || ready.status !== "active" || ready.reviewStatus !== "approved" || ready.availabilityStatus !== "healthy") {
  throw new Error("Reference seller service did not pass the P2.2 lifecycle gate.");
}
console.log(`Reference seller workflow ready: ${ready.publicId} v${ready.serviceVersion}`);
