import assert from "node:assert/strict";
import {
  AgentCommerceApiError,
  AgentCommerceClient,
} from "../sdk/typescript/src/index.ts";

const requests: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];

const mockFetch: typeof fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ url, method, headers, body });

  if (url.endsWith("/api/agent/v1/workflows")) {
    return Response.json({
      version: "1",
      workflows: [{
        id: "github_due_diligence",
        name: "GitHub Project Due Diligence",
        shortName: "GitHub Due Diligence",
        description: "Evidence-backed report.",
        task: "Analyze repository health.",
        estimatedUsdc: 0.002,
        inputSchema: { type: "object" },
        arc: {
          chainId: 5_042_002,
          network: "arc-testnet",
          asset: "USDC",
          tokenAddress: "0x3600000000000000000000000000000000000000",
        },
      }],
    });
  }
  if (url.endsWith("/api/agent/v1/watchlists") && method === "POST") {
    return Response.json({
      id: "wtl_0123456789abcdef0123",
      label: "Example Agent",
      input: { agentId: "agt_0123456789abcdefghij" },
      cadence: "weekly",
      status: "active",
      nextRecheckAt: "2026-08-06T00:00:00.000Z",
      lastRecheckAt: null,
      currentScore: null,
      trustStatus: null,
      verificationStatus: null,
      latestSnapshotId: null,
      publicHistoryUrl: "/trust/wtl_0123456789abcdef0123",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    }, { status: 201 });
  }
  if (url.endsWith("/api/agent/v1/watchlists") && method === "GET") {
    return Response.json({ watchlists: [] });
  }
  if (url.endsWith("/api/agent/v1/watchlists/wtl_0123456789abcdef0123/rechecks")) {
    return Response.json({
      watchlistId: "wtl_0123456789abcdef0123",
      recheckId: "trc_0123456789abcdef0123",
      quoteId: "quote-1",
      workflow: "agent_trust_report",
      totalUsdc: 0.0004,
      sponsored: true,
      checkout: {
        mode: "sponsored",
        asset: "USDC",
        network: "arc-testnet",
      },
      downstreamSettlement: "server_side_x402",
      expiresAt: "2026-07-30T12:00:00.000Z",
      requiredPayment: {
        network: "arc-testnet",
        asset: "USDC",
        amount: 0,
        treasuryAddress: "0x0000000000000000000000000000000000000001",
        chainId: 5_042_002,
      },
    }, { status: 201 });
  }
  if (url.endsWith("/api/agent/v1/watchlists/wtl_0123456789abcdef0123")) {
    return Response.json({
      watchlist: {
        id: "wtl_0123456789abcdef0123",
        label: "Example Agent",
        input: { agentId: "agt_0123456789abcdefghij" },
        cadence: "weekly",
        status: "active",
        lastCheckedAt: "2026-07-30T00:00:00.000Z",
        nextRecheckAt: "2026-08-06T00:00:00.000Z",
      },
      currentReport: null,
      currentDelta: null,
      history: [],
    });
  }
  if (url.endsWith("/api/agent/v1/quotes")) {
    return Response.json({
      quoteId: "quote-1",
      workflow: "github_due_diligence",
      repository: {
        fullName: "circlefin/example",
        canonicalUrl: "https://github.com/circlefin/example",
      },
      totalUsdc: 0.002,
      sponsored: true,
      expiresAt: "2026-07-28T12:00:00.000Z",
      requiredPayment: {
        network: "arc-testnet",
        asset: "USDC",
        amount: 0,
        treasuryAddress: "0x0000000000000000000000000000000000000001",
        chainId: 5_042_002,
      },
    }, { status: 201 });
  }
  if (url.endsWith("/api/agent/v1/runs")) {
    return Response.json({ runId: "run-1", status: "queued", pollAfterMs: 1 }, { status: 201 });
  }
  if (url.endsWith("/api/agent/v1/runs/run-1")) {
    return Response.json({
      runId: "run-1",
      status: "completed",
      progress: 1,
      stage: "completed",
      pollAfterMs: 0,
      reportId: "run-1",
      verification: {
        status: "verified",
        verifiedSteps: 2,
        requiredSteps: 2,
      },
    });
  }
  if (url.endsWith("/api/agent/v1/reports/run-1")) {
    return Response.json({
      reportId: "run-1",
      workflow: "github_due_diligence",
      status: "completed",
      generatedAt: "2026-07-28T11:00:00.000Z",
      verdict: {
        code: "proceed_with_standard_review",
        label: "Proceed with standard review",
        confidence: "high",
        summary: "Continue normal review.",
        reasons: [],
        blockingFindings: [],
      },
      verification: {
        status: "verified",
        network: "arc-testnet",
        proofs: [],
      },
    });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

const client = new AgentCommerceClient({
  baseUrl: "https://example.test",
  credential: "aac_test_credential_that_is_long_enough",
  fetch: mockFetch,
});

const workflows = await client.listWorkflows();
assert.deepEqual(workflows.map((workflow) => workflow.id), ["github_due_diligence"]);

const execution = await client.executeWorkflow(
  {
    workflow: "github_due_diligence",
    repository: "circlefin/example",
  },
  {
    quoteIdempotencyKey: "quote-key",
    runIdempotencyKey: "run-key",
  },
);
assert.equal(execution.report.verdict?.code, "proceed_with_standard_review");
assert.equal(execution.report.verification.status, "verified");

const watchlist = await client.createWatchlist(
  {
    label: "Example Agent",
    input: { agentId: "agt_0123456789abcdefghij" },
    cadence: "weekly",
  },
  { idempotencyKey: "watchlist-key" },
);
assert.equal(watchlist.id, "wtl_0123456789abcdef0123");
const monitoringExecution = await client.recheckWatchlist(watchlist.id, {
  recheckIdempotencyKey: "recheck-key",
  runIdempotencyKey: "recheck-run-key",
});
assert.equal(monitoringExecution.quote.recheckId, "trc_0123456789abcdef0123");
assert.equal(monitoringExecution.history.watchlist.id, watchlist.id);

const quoteRequest = requests.find((request) => request.url.endsWith("/quotes"));
const runRequest = requests.find((request) => request.url.endsWith("/runs"));
assert.equal(quoteRequest?.headers.get("idempotency-key"), "quote-key");
assert.equal(runRequest?.headers.get("idempotency-key"), "run-key");
assert.equal(quoteRequest?.headers.get("authorization"), "Bearer aac_test_credential_that_is_long_enough");
assert(
  requests.some(
    (request) =>
      request.url.endsWith("/watchlists") &&
      request.headers.get("idempotency-key") === "watchlist-key",
  ),
);
assert(
  requests.some(
    (request) =>
      request.url.endsWith("/rechecks") &&
      request.headers.get("idempotency-key") === "recheck-key",
  ),
);

const errorClient = new AgentCommerceClient({
  baseUrl: "https://example.test",
  credential: "aac_test_credential_that_is_long_enough",
  fetch: async () =>
    Response.json(
      {
        error: {
          code: "provider_unavailable",
          message: "Provider is unavailable.",
          retryable: true,
          requestId: "req_test",
        },
      },
      { status: 503 },
    ),
});

await assert.rejects(
  () => errorClient.listWorkflows(),
  (error: unknown) => {
    assert(error instanceof AgentCommerceApiError);
    assert.equal(error.code, "provider_unavailable");
    assert.equal(error.retryable, true);
    assert.equal(error.requestId, "req_test");
    return true;
  },
);

const failedRunClient = new AgentCommerceClient({
  baseUrl: "https://example.test",
  credential: "aac_test_credential_that_is_long_enough",
  fetch: async (input) => {
    const url = String(input);
    if (url.endsWith("/quotes")) {
      return Response.json({
        quoteId: "quote-failed",
        workflow: "github_due_diligence",
        repository: null,
        totalUsdc: 0.002,
        sponsored: true,
        expiresAt: "2026-07-28T12:00:00.000Z",
        requiredPayment: {
          network: "arc-testnet",
          asset: "USDC",
          amount: 0,
          treasuryAddress: "0x0000000000000000000000000000000000000001",
          chainId: 5_042_002,
        },
      });
    }
    if (url.endsWith("/runs")) {
      return Response.json({ runId: "run-failed", status: "queued", pollAfterMs: 1 });
    }
    if (url.endsWith("/runs/run-failed")) {
      return Response.json({
        runId: "run-failed",
        status: "failed",
        progress: 1,
        stage: "failed",
        pollAfterMs: 0,
      });
    }
    throw new Error(`A failed run must not request a report: ${url}`);
  },
});

await assert.rejects(
  () =>
    failedRunClient.executeWorkflow({
      workflow: "github_due_diligence",
      repository: "circlefin/example",
    }),
  (error: unknown) => {
    assert(error instanceof AgentCommerceApiError);
    assert.equal(error.code, "run_failed");
    assert.equal(error.retryable, false);
    return true;
  },
);

console.log("[machine-sdk-test] passed: typed flow, stable idempotency headers, verdict/report parsing, failed-run handling, normalized retryable errors");
