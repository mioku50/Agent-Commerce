import { getAddress, isAddress, type Address } from "viem";
import type { HostedPlannerSnapshot } from "./hosted-workflows.ts";
import { ARC_TESTNET_CHAIN_ID } from "../wallet/arc.ts";

export const HOSTED_WORKFLOW_DEFAULT_PLATFORM_FEE_USDC = 0.0007;
export const HOSTED_WORKFLOW_DEFAULT_MAX_PRICE_USDC = 0.005;
export const HOSTED_WORKFLOW_DEFAULT_SPONSORED_QUOTA = 1;
export const HOSTED_WORKFLOW_DEFAULT_QUOTE_EXPIRY_SECONDS = 600;

export type HostedWorkflowPricing = {
  estimatedProviderCostUsdc: number;
  platformFeeUsdc: number;
  listPriceUsdc: number;
};

function atomicUsdc(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative USDC amount.`);
  }
  const atomic = Math.round(value * 1_000_000);
  if (Math.abs(value * 1_000_000 - atomic) > 0.000001) {
    throw new Error(`${label} supports at most 6 decimal places.`);
  }
  return atomic;
}

function environmentUsdc(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  atomicUsdc(parsed, name);
  return parsed;
}

function boundedInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function getHostedWorkflowCheckoutConfig(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const treasury =
    environment.HOSTED_WORKFLOW_TREASURY_ADDRESS?.trim() ||
    environment.SELLER_ADDRESS?.trim();
  if (!treasury || !isAddress(treasury)) {
    throw new Error(
      "HOSTED_WORKFLOW_TREASURY_ADDRESS or SELLER_ADDRESS must be configured.",
    );
  }

  const platformFeeUsdc = environmentUsdc(
    environment,
    "HOSTED_WORKFLOW_PLATFORM_FEE_USDC",
    HOSTED_WORKFLOW_DEFAULT_PLATFORM_FEE_USDC,
  );
  const maxPriceUsdc = environmentUsdc(
    environment,
    "HOSTED_WORKFLOW_MAX_PRICE_USDC",
    HOSTED_WORKFLOW_DEFAULT_MAX_PRICE_USDC,
  );
  if (maxPriceUsdc <= 0) {
    throw new Error("HOSTED_WORKFLOW_MAX_PRICE_USDC must be greater than zero.");
  }

  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    asset: "native_usdc" as const,
    treasuryAddress: getAddress(treasury) as Address,
    platformFeeUsdc,
    maxPriceUsdc,
    sponsoredQuota: boundedInteger(
      environment,
      "HOSTED_WORKFLOW_SPONSORED_QUOTA",
      HOSTED_WORKFLOW_DEFAULT_SPONSORED_QUOTA,
      1,
      3,
    ),
    quoteExpirySeconds: boundedInteger(
      environment,
      "HOSTED_WORKFLOW_QUOTE_EXPIRY_SECONDS",
      HOSTED_WORKFLOW_DEFAULT_QUOTE_EXPIRY_SECONDS,
      60,
      3_600,
    ),
  };
}

export function priceHostedWorkflow(
  plan: HostedPlannerSnapshot,
  config: Pick<
    ReturnType<typeof getHostedWorkflowCheckoutConfig>,
    "platformFeeUsdc" | "maxPriceUsdc"
  >,
): HostedWorkflowPricing {
  const providerAtomic = atomicUsdc(
    plan.estimatedSpendUsdc,
    "Estimated provider cost",
  );
  const feeAtomic = atomicUsdc(config.platformFeeUsdc, "Platform fee");
  const listAtomic = providerAtomic + feeAtomic;
  const maxAtomic = atomicUsdc(config.maxPriceUsdc, "Maximum workflow price");
  if (listAtomic > maxAtomic) {
    throw new Error(
      `Workflow price exceeds the ${config.maxPriceUsdc.toFixed(6)} USDC checkout cap.`,
    );
  }
  return {
    estimatedProviderCostUsdc: providerAtomic / 1_000_000,
    platformFeeUsdc: feeAtomic / 1_000_000,
    listPriceUsdc: listAtomic / 1_000_000,
  };
}

export function getHostedWorkflowCheckoutDiagnostic() {
  try {
    const config = getHostedWorkflowCheckoutConfig();
    return {
      configured: true,
      chainId: config.chainId,
      asset: config.asset,
      treasuryAddress: config.treasuryAddress,
      platformFeeUsdc: config.platformFeeUsdc,
      maxPriceUsdc: config.maxPriceUsdc,
      sponsoredQuota: config.sponsoredQuota,
      quoteExpirySeconds: config.quoteExpirySeconds,
      paymentModel: "single_user_payment_then_internal_x402" as const,
    };
  } catch {
    return {
      configured: false,
      chainId: ARC_TESTNET_CHAIN_ID,
      asset: "native_usdc" as const,
      treasuryAddress: null,
      platformFeeUsdc: HOSTED_WORKFLOW_DEFAULT_PLATFORM_FEE_USDC,
      maxPriceUsdc: HOSTED_WORKFLOW_DEFAULT_MAX_PRICE_USDC,
      sponsoredQuota: HOSTED_WORKFLOW_DEFAULT_SPONSORED_QUOTA,
      quoteExpirySeconds: HOSTED_WORKFLOW_DEFAULT_QUOTE_EXPIRY_SECONDS,
      paymentModel: "single_user_payment_then_internal_x402" as const,
    };
  }
}
