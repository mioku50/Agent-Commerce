import { getAddress, isAddress, parseUnits } from "viem";
import type { EconomicProvenance } from "./types.ts";

export type PreparedEconomicProvenance = {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  amountAtomic: bigint;
  source: EconomicProvenance["source"];
  sourceId: string;
};

export function prepareEconomicProvenance(
  provenance: EconomicProvenance | undefined,
  economicValueUsdc: number | undefined,
): PreparedEconomicProvenance | null {
  if (!provenance || !isAddress(provenance.buyer) || !isAddress(provenance.seller)) {
    return null;
  }
  if (!Number.isFinite(economicValueUsdc) || economicValueUsdc === undefined || economicValueUsdc <= 0) {
    throw new Error("EconomicProvenance provided but economicValueUsdc is missing or zero");
  }
  if (!provenance.sourceId.trim()) {
    throw new Error("EconomicProvenance sourceId is required");
  }

  const amountAtomic = parseUnits(economicValueUsdc.toFixed(6), 6);
  if (amountAtomic <= BigInt(0)) {
    throw new Error("EconomicProvenance amount is below one USDC atomic unit");
  }

  return {
    buyer: getAddress(provenance.buyer),
    seller: getAddress(provenance.seller),
    amountAtomic,
    source: provenance.source,
    sourceId: provenance.sourceId,
  };
}
