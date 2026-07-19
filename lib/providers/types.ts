/**
 * Safe, normalized provider types. Raw upstream payloads and credentials must
 * never cross this boundary.
 */

export const PYTH_MARKET_SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD"] as const;

export type PythMarketSymbol = (typeof PYTH_MARKET_SYMBOLS)[number];

export type ProviderSourceStatus = "live";

export type NormalizedMarketPrice = {
  provider: "Pyth Network";
  symbol: PythMarketSymbol;
  price: string;
  confidence: string;
  publishTime: string;
  fetchedAt: string;
  sourceStatus: ProviderSourceStatus;
};

export interface ProviderAdapter<TInput, TOutput> {
  fetch(input: TInput): Promise<TOutput>;
}
