import { ProviderError } from "./errors.ts";
import {
  PYTH_MARKET_SYMBOLS,
  type NormalizedMarketPrice,
  type ProviderAdapter,
  type PythMarketSymbol,
} from "./types.ts";

const PYTH_HERMES_URL =
  "https://pyth.dourolabs.app/hermes/v2/updates/price/latest";
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_CACHE_TTL_MS = 5_000;
const DEFAULT_MAX_AGE_SECONDS = 120;

const FEED_IDS: Record<PythMarketSymbol, string> = {
  "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
};

type PythPrice = {
  price?: unknown;
  conf?: unknown;
  expo?: unknown;
  publish_time?: unknown;
};

type PythParsedFeed = {
  id?: unknown;
  price?: PythPrice;
};

type PythHermesResponse = {
  parsed?: PythParsedFeed[];
};

export type PythAdapterOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  cacheTtlMs?: number;
  maxAgeSeconds?: number;
};

type CacheEntry = {
  expiresAt: number;
  result: NormalizedMarketPrice;
};

const cache = new Map<PythMarketSymbol, CacheEntry>();

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function normalizePythSymbol(value: unknown): PythMarketSymbol {
  if (typeof value !== "string") {
    throw new ProviderError("unsupported_symbol", { httpStatus: 400 });
  }
  const compact = value.trim().toUpperCase().replace(/[-_]/g, "/");
  const alias = compact.includes("/") ? compact : `${compact}/USD`;
  if (!PYTH_MARKET_SYMBOLS.includes(alias as PythMarketSymbol)) {
    throw new ProviderError("unsupported_symbol", { httpStatus: 400 });
  }
  return alias as PythMarketSymbol;
}

export function inferPythSymbol(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const firstAsset = value?.toLowerCase().match(
      /\b(btc(?:\/usd)?|bitcoin|eth(?:\/usd)?|ethereum|ether|sol(?:\/usd)?|solana)\b/,
    )?.[1];
    if (!firstAsset) continue;
    if (firstAsset.startsWith("eth") || firstAsset === "ether") {
      return "ETH/USD" as const;
    }
    if (firstAsset.startsWith("sol")) return "SOL/USD" as const;
    return "BTC/USD" as const;
  }
  return "BTC/USD" as const;
}

function integerString(value: unknown) {
  return typeof value === "string" && /^-?\d+$/.test(value) ? value : null;
}

function decimalString(raw: string, exponent: number) {
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  if (exponent >= 0) {
    return `${negative ? "-" : ""}${digits}${"0".repeat(exponent)}`;
  }
  const decimalPlaces = -exponent;
  const padded = digits.padStart(decimalPlaces + 1, "0");
  const split = padded.length - decimalPlaces;
  const fraction = padded.slice(split).replace(/0+$/, "");
  return `${negative ? "-" : ""}${padded.slice(0, split)}${fraction ? `.${fraction}` : ""}`;
}

function parseResult(
  payload: PythHermesResponse,
  symbol: PythMarketSymbol,
  nowMs: number,
  maxAgeSeconds: number,
): NormalizedMarketPrice {
  const feed = payload.parsed?.[0];
  const expectedId = FEED_IDS[symbol];
  const actualId = typeof feed?.id === "string" ? feed.id.replace(/^0x/, "").toLowerCase() : "";
  const price = integerString(feed?.price?.price);
  const confidence = integerString(feed?.price?.conf);
  const exponent = feed?.price?.expo;
  const publishTime = feed?.price?.publish_time;

  if (
    !feed ||
    actualId !== expectedId ||
    price === null ||
    confidence === null ||
    typeof exponent !== "number" ||
    !Number.isInteger(exponent) ||
    exponent < -18 ||
    exponent > 18 ||
    typeof publishTime !== "number" ||
    !Number.isInteger(publishTime) ||
    publishTime <= 0
  ) {
    throw new ProviderError("malformed_response");
  }

  const ageSeconds = Math.floor(nowMs / 1000) - publishTime;
  if (ageSeconds > maxAgeSeconds || ageSeconds < -30) {
    throw new ProviderError("stale_data", { retryable: true });
  }

  return {
    provider: "Pyth Network",
    symbol,
    price: decimalString(price, exponent),
    confidence: decimalString(confidence, exponent),
    publishTime: new Date(publishTime * 1000).toISOString(),
    fetchedAt: new Date(nowMs).toISOString(),
    sourceStatus: "live",
  };
}

function retryDelay(response: Response | null, attempt: number, backoffMs: number) {
  const retryAfter = response?.headers.get("retry-after");
  const parsed = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(parsed * 1000, 2_000);
  }
  return Math.min(backoffMs * 2 ** attempt, 2_000);
}

async function safeUpstreamMessage(response: Response, apiKey: string) {
  const body = await response.text().catch(() => "");
  if (!body) return null;
  return body
    .split(apiKey)
    .join("[redacted]")
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

export async function getPythMarketPrice(
  symbolInput: unknown,
  options: PythAdapterOptions = {},
): Promise<NormalizedMarketPrice> {
  const symbol = normalizePythSymbol(symbolInput);
  const apiKey = options.apiKey ?? process.env.PYTH_API_KEY?.trim();
  if (!apiKey) throw new ProviderError("missing_api_key");

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const nowMs = now();
  const cached = cache.get(symbol);
  if (cached && cached.expiresAt > nowMs) return cached.result;

  const url = new URL(PYTH_HERMES_URL);
  url.searchParams.append("ids[]", FEED_IDS[symbol]);
  let finalError: ProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429) {
        finalError = new ProviderError("rate_limited", {
          retryable: true,
          upstreamStatus: response.status,
          upstreamMessage: await safeUpstreamMessage(response, apiKey),
        });
      } else if (!response.ok) {
        finalError = new ProviderError("upstream_error", {
          retryable: response.status >= 500,
          upstreamStatus: response.status,
          upstreamMessage: await safeUpstreamMessage(response, apiKey),
        });
      } else {
        let payload: PythHermesResponse;
        try {
          payload = (await response.json()) as PythHermesResponse;
        } catch {
          throw new ProviderError("malformed_response");
        }
        const result = parseResult(payload, symbol, now(), maxAgeSeconds);
        cache.set(symbol, { expiresAt: now() + cacheTtlMs, result });
        return result;
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      finalError = new ProviderError(
        controller.signal.aborted ? "timeout" : "upstream_error",
        { retryable: true },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!finalError.retryable || attempt === retries) throw finalError;
    await sleep(retryDelay(response, attempt, backoffMs));
  }

  throw finalError ?? new ProviderError("upstream_error");
}

export const pythMarketPriceProvider: ProviderAdapter<
  PythMarketSymbol,
  NormalizedMarketPrice
> = {
  fetch: (symbol) => getPythMarketPrice(symbol),
};

export function getPythProviderDiagnostic() {
  return {
    provider: "Pyth Network" as const,
    configured: Boolean(process.env.PYTH_API_KEY?.trim()),
    authentication: "server-side bearer" as const,
    sourceStatus: "live-provider" as const,
    supportedSymbols: [...PYTH_MARKET_SYMBOLS],
    paidEndpoint: "/api/provider/pyth/price" as const,
    priceUsdc: "0.001" as const,
  };
}

export function clearPythProviderCacheForTests() {
  cache.clear();
}
