/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type ReviewStatus = {
  latestRunUrl?: string | null;
  latestReceiptUrl?: string | null;
  mainPassportUrl?: string | null;
  database?: {
    provider?: string;
    publicClient?: { configured?: boolean };
    serverClient?: { configured?: boolean };
  };
};

const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const DEFAULT_BASE_URL = "https://agent-commerce-six.vercel.app";
const REQUEST_TIMEOUT_MS = Number(process.env.REVIEW_SMOKE_TIMEOUT_MS ?? 60_000);

function getBaseUrl() {
  const explicitArg = process.argv.find((arg) => arg.startsWith("--base-url="));
  const explicit = explicitArg?.split("=", 2)[1];

  return (
    explicit ??
    process.env.BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
}

function urlFor(baseUrl: string, path: string) {
  return `${baseUrl}${path}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`));
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: init.redirect ?? "manual",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkStatus(baseUrl: string, path: string, expectedStatus: number) {
  const response = await fetchWithTimeout(urlFor(baseUrl, path));
  return {
    name: `${path} returns ${expectedStatus}`,
    ok: response.status === expectedStatus,
    detail: `HTTP ${response.status}`,
  } satisfies CheckResult;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 160)}`);
  }
}

function decodePaymentChallenge(headerValue: string) {
  const normalized = headerValue.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  return JSON.parse(decoded) as {
    accepts?: Array<{
      network?: string;
      asset?: string;
      [key: string]: unknown;
    }>;
  };
}

async function checkServiceDiscovery(baseUrl: string) {
  const response = await fetchWithTimeout(urlFor(baseUrl, "/api/store/services"));
  const json = await readJson(response);
  const services = Array.isArray((json as { services?: unknown }).services)
    ? (json as { services: unknown[] }).services
    : [];

  return [
    {
      name: "/api/store/services returns valid JSON",
      ok: response.status === 200,
      detail: `HTTP ${response.status}`,
    },
    {
      name: "/api/store/services has at least one service",
      ok: services.length > 0,
      detail: `${services.length} service(s)`,
    },
  ] satisfies CheckResult[];
}

async function checkReceiptsJson(baseUrl: string) {
  const response = await fetchWithTimeout(urlFor(baseUrl, "/api/receipts"));
  await readJson(response);

  return {
    name: "/api/receipts returns valid JSON",
    ok: response.status === 200,
    detail: `HTTP ${response.status}`,
  } satisfies CheckResult;
}

async function checkReviewStatus(baseUrl: string) {
  const response = await fetchWithTimeout(urlFor(baseUrl, "/api/review/status"));
  const json = (await readJson(response)) as ReviewStatus;

  return {
    checks: [
      {
        name: "/api/review/status returns valid JSON",
        ok: response.status === 200,
        detail: `HTTP ${response.status}`,
      },
      {
        name: "review status uses the AGENT_DB provider",
        ok:
          json.database?.provider === "agent-db" &&
          json.database.publicClient?.configured === true &&
          json.database.serverClient?.configured === true,
        detail: `provider=${json.database?.provider ?? "missing"} public=${json.database?.publicClient?.configured === true ? "configured" : "missing"} server=${json.database?.serverClient?.configured === true ? "configured" : "missing"}`,
      },
    ] satisfies CheckResult[],
    status: json,
  };
}

async function checkPaymentRequiredChallenge(baseUrl: string) {
  const response = await fetchWithTimeout(urlFor(baseUrl, "/api/premium/quote"));
  const headerValue = response.headers.get("payment-required");
  const checks: CheckResult[] = [
    {
      name: "/api/premium/quote returns 402",
      ok: response.status === 402,
      detail: `HTTP ${response.status}`,
    },
    {
      name: "402 response includes payment-required header",
      ok: Boolean(headerValue),
      detail: headerValue ? "header present" : "header missing",
    },
  ];

  if (!headerValue) {
    checks.push(
      {
        name: "payment-required challenge decodes successfully",
        ok: false,
        detail: "no header to decode",
      },
      {
        name: `challenge network is ${ARC_TESTNET_NETWORK}`,
        ok: false,
        detail: "no decoded challenge",
      },
      {
        name: "challenge asset is Arc testnet USDC",
        ok: false,
        detail: "no decoded challenge",
      },
    );
    return checks;
  }

  try {
    const challenge = decodePaymentChallenge(headerValue);
    const accepted = challenge.accepts?.[0] ?? {};
    checks.push(
      {
        name: "payment-required challenge decodes successfully",
        ok: true,
        detail: `${challenge.accepts?.length ?? 0} accept option(s)`,
      },
      {
        name: `challenge network is ${ARC_TESTNET_NETWORK}`,
        ok: accepted.network === ARC_TESTNET_NETWORK,
        detail: String(accepted.network ?? "missing"),
      },
      {
        name: "challenge asset is Arc testnet USDC",
        ok: accepted.asset?.toLowerCase() === ARC_TESTNET_USDC.toLowerCase(),
        detail: String(accepted.asset ?? "missing"),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push(
      {
        name: "payment-required challenge decodes successfully",
        ok: false,
        detail: message,
      },
      {
        name: `challenge network is ${ARC_TESTNET_NETWORK}`,
        ok: false,
        detail: "decode failed",
      },
      {
        name: "challenge asset is Arc testnet USDC",
        ok: false,
        detail: "decode failed",
      },
    );
  }

  return checks;
}

async function safelyRun(name: string, task: () => Promise<CheckResult | CheckResult[]>) {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      ok: false,
      detail: message,
    } satisfies CheckResult;
  }
}

function printResults(
  baseUrl: string,
  results: CheckResult[],
  status: ReviewStatus | null,
  statusWarning: string | null,
) {
  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  console.log("\nArc Agent Commerce review smoke");
  console.log(`Production URL: ${baseUrl}`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  console.log("\nPassed checks");
  for (const result of passed) {
    console.log(`  [ok] ${result.name} - ${result.detail}`);
  }

  if (failed.length > 0) {
    console.log("\nFailed checks");
    for (const result of failed) {
      console.log(`  [fail] ${result.name} - ${result.detail}`);
    }
  }

  console.log("\nProof links");
  if (statusWarning) {
    console.log(`  Review status: unavailable (${statusWarning})`);
  }
  console.log(`  Latest run: ${status?.latestRunUrl ?? "n/a"}`);
  console.log(`  Latest receipt: ${status?.latestReceiptUrl ?? "n/a"}`);
  console.log(`  Main Agent Passport: ${status?.mainPassportUrl ?? "n/a"}`);
  console.log("");
}

async function main() {
  const baseUrl = getBaseUrl();
  const results: CheckResult[] = [];
  let reviewStatus: ReviewStatus | null = null;
  let reviewStatusWarning: string | null = null;

  const pageChecks = [
    "/",
    "/review",
    "/demo",
    "/store",
    "/agent-control",
    "/agent-launch",
    "/runs",
    "/receipts",
    "/agents",
  ];

  for (const path of pageChecks) {
    const result = await safelyRun(`${path} returns 200`, () =>
      checkStatus(baseUrl, path, 200),
    );
    results.push(...(Array.isArray(result) ? result : [result]));
  }

  const serviceResults = await safelyRun("/api/store/services checks", () =>
    checkServiceDiscovery(baseUrl),
  );
  results.push(...(Array.isArray(serviceResults) ? serviceResults : [serviceResults]));

  const receiptsResult = await safelyRun("/api/receipts returns valid JSON", () =>
    checkReceiptsJson(baseUrl),
  );
  results.push(...(Array.isArray(receiptsResult) ? receiptsResult : [receiptsResult]));

  for (const path of ["/api/agent/runs", "/api/agents", "/api/seller/analytics"]) {
    const result = await safelyRun(`${path} returns 200`, () =>
      checkStatus(baseUrl, path, 200),
    );
    results.push(...(Array.isArray(result) ? result : [result]));
  }

  try {
    const result = await checkReviewStatus(baseUrl);
    reviewStatus = result.status;
    results.push(...result.checks);
  } catch (error) {
    reviewStatusWarning = error instanceof Error ? error.message : String(error);
  }

  const paymentResults = await safelyRun("/api/premium/quote 402 challenge checks", () =>
    checkPaymentRequiredChallenge(baseUrl),
  );
  results.push(...(Array.isArray(paymentResults) ? paymentResults : [paymentResults]));

  printResults(baseUrl, results, reviewStatus, reviewStatusWarning);

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

await main();
