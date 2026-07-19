import assert from "node:assert/strict";
import {
  clearPythProviderCacheForTests,
  getPythMarketPrice,
  normalizePythSymbol,
} from "../lib/providers/pyth.ts";
import { ProviderError } from "../lib/providers/errors.ts";

const FEED_IDS = {
  "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
} as const;
const FEED_ID = FEED_IDS["BTC/USD"];
const NOW = Date.parse("2026-07-19T12:00:00.000Z");
const TEST_KEY = "pyth-test-key-that-must-never-leak";

function response(
  body: unknown,
  init: ResponseInit = { status: 200 },
) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });
}

function livePayload(
  overrides: Record<string, unknown> = {},
  feedId: string = FEED_ID,
) {
  return {
    parsed: [
      {
        id: feedId,
        price: {
          price: "6843212345678",
          conf: "125000000",
          expo: -8,
          publish_time: Math.floor(NOW / 1000) - 4,
          ...overrides,
        },
      },
    ],
  };
}

function options(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return {
    apiKey: TEST_KEY,
    fetchImpl,
    now: () => NOW,
    sleep: async () => undefined,
    retries: 0,
    cacheTtlMs: 0,
    ...extra,
  };
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: ProviderError["code"],
) {
  await assert.rejects(promise, (error: unknown) => {
    assert(error instanceof ProviderError);
    assert.equal(error.code, code);
    assert.equal(JSON.stringify(error).includes(TEST_KEY), false);
    assert.equal(error.message.includes(TEST_KEY), false);
    return true;
  });
}

clearPythProviderCacheForTests();
let authorization = "";
const success = await getPythMarketPrice(
  "BTC/USD",
  options(async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return response(livePayload());
  }) as Parameters<typeof getPythMarketPrice>[1],
);
assert.deepEqual(success, {
  provider: "Pyth Network",
  symbol: "BTC/USD",
  price: "68432.12345678",
  confidence: "1.25",
  confidenceInterval: {
    low: "68430.87345678",
    high: "68433.37345678",
  },
  publishTime: "2026-07-19T11:59:56.000Z",
  fetchedAt: "2026-07-19T12:00:00.000Z",
  priceAgeSeconds: 4,
  freshnessThresholdSeconds: 120,
  sourceStatus: "live",
});
assert.equal(authorization, `Bearer ${TEST_KEY}`);
assert.equal(JSON.stringify(success).includes(TEST_KEY), false);

for (const symbol of ["ETH/USD", "SOL/USD"] as const) {
  clearPythProviderCacheForTests();
  let requestedFeed = "";
  const result = await getPythMarketPrice(
    symbol,
    options(async (url) => {
      requestedFeed = new URL(url).searchParams.get("ids[]") ?? "";
      return response(livePayload({}, FEED_IDS[symbol]));
    }) as Parameters<typeof getPythMarketPrice>[1],
  );
  assert.equal(result.symbol, symbol);
  assert.equal(requestedFeed, FEED_IDS[symbol]);
  assert.equal(result.priceAgeSeconds, 4);
}

assert.equal(normalizePythSymbol("eth"), "ETH/USD");
await expectProviderError(
  getPythMarketPrice("DOGE/USD", options(async () => response(livePayload()))),
  "unsupported_symbol",
);

await expectProviderError(
  getPythMarketPrice("BTC/USD", {
    ...options(async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }), { timeoutMs: 5 }),
  } as Parameters<typeof getPythMarketPrice>[1]),
  "timeout",
);

await expectProviderError(
  getPythMarketPrice(
    "BTC/USD",
    options(async () => response({ parsed: [{ id: FEED_ID, price: {} }] })),
  ),
  "malformed_response",
);

let rateLimitCalls = 0;
await expectProviderError(
  getPythMarketPrice(
    "BTC/USD",
    options(async () => {
      rateLimitCalls += 1;
      return response({}, { status: 429, headers: { "retry-after": "0" } });
    }, { retries: 1 }),
  ),
  "rate_limited",
);
assert.equal(rateLimitCalls, 2);

await expectProviderError(
  getPythMarketPrice(
    "BTC/USD",
    options(async () =>
      response(livePayload({ publish_time: Math.floor(NOW / 1000) - 121 })),
    ),
  ),
  "stale_data",
);

const previousKey = process.env.PYTH_API_KEY;
delete process.env.PYTH_API_KEY;
await expectProviderError(getPythMarketPrice("BTC/USD"), "missing_api_key");
if (previousKey === undefined) delete process.env.PYTH_API_KEY;
else process.env.PYTH_API_KEY = previousKey;

const hostile = await expectProviderError(
  getPythMarketPrice(
    "BTC/USD",
    options(async () => response({ error: TEST_KEY }, { status: 500 })),
  ),
  "upstream_error",
);
assert.equal(hostile, undefined);

console.log(
  "[provider-test] passed: normalized BTC/USD, ETH/USD, and SOL/USD feed mapping, confidence interval, price age, fixed allowlist, timeout, malformed response, 429 retry/backoff, stale data, missing key, and secret non-disclosure",
);
