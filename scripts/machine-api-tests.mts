/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { getAddress } from "viem";
import { createApiCredential, hashApiCredential } from "../lib/byoa/auth.ts";
import { setByoaClientForTesting } from "../lib/byoa/service.ts";
import {
  resolveMachineIdempotency,
  saveMachineIdempotency,
  clearMachineIdempotencyStore,
} from "../lib/api/machine-idempotency.ts";
import { GET as workflowsGET } from "../app/api/agent/v1/workflows/route.ts";
import { POST as quotesPOST } from "../app/api/agent/v1/quotes/route.ts";

console.log("[machine-api-tests] Running Machine API v1 tests...");

// Environment overrides for test isolation
process.env.HOSTED_WORKFLOW_TREASURY_ADDRESS = "0x2222222222222222222222222222222222222222";
process.env.SELLER_ADDRESS = "0x2222222222222222222222222222222222222222";
process.env.RATE_LIMIT_SECRET = "test-rate-limit-secret-12345";
process.env.HOSTED_AGENT_RATE_LIMIT_SECRET = "test-rate-limit-secret-12345";
process.env.HOSTED_AGENT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.HOSTED_AGENT_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
process.env.HOSTED_AGENT_BASE_URL = "http://localhost:3000";
process.env.BYOA_MANAGEMENT_SESSION_SECRET = "test-session-secret-32-chars-long-0000000000";
process.env.BYOA_CREDENTIAL_PEPPER = "test-credential-pepper-32-chars-long-0000000000";

// --- Section 1: Unit Tests for Machine Idempotency Helper ---
console.log("-> Testing Machine Idempotency Helper...");

clearMachineIdempotencyStore();

const credId = "test-cred-123";
const idempotencyKey = "key-alpha-1";
const payloadA = { workflow: "github_due_diligence", repository: "circlefin/agent-commerce" };
const payloadB = { workflow: "github_due_diligence", repository: "owner/other-repo" };
const mockResult = {
  quoteId: "quote-111",
  workflow: "github_due_diligence",
  totalUsdc: 0.002,
  sponsored: true,
};

// Initial check should be uncached and non-conflicting
const check1 = resolveMachineIdempotency(idempotencyKey, credId, payloadA);
assert.equal(check1.cached, false);
assert.equal(check1.conflict, false);
assert.equal(check1.result, undefined);

// Save record
saveMachineIdempotency(idempotencyKey, credId, payloadA, mockResult);

// Re-check with identical payload -> should return cached result
const check2 = resolveMachineIdempotency(idempotencyKey, credId, payloadA);
assert.equal(check2.cached, true);
assert.equal(check2.conflict, false);
assert.deepEqual(check2.result, mockResult);

// Check with different payload -> should signal conflict
const check3 = resolveMachineIdempotency(idempotencyKey, credId, payloadB);
assert.equal(check3.cached, false);
assert.equal(check3.conflict, true);

// Clear store
clearMachineIdempotencyStore();
const check4 = resolveMachineIdempotency(idempotencyKey, credId, payloadA);
assert.equal(check4.cached, false);
assert.equal(check4.conflict, false);

console.log("✔ Machine Idempotency Helper unit tests passed.");

// --- Section 2: Mock Database Client Setup ---
console.log("-> Setting up Mock Supabase Client for Machine API testing...");

const fullCred = createApiCredential("agt_test_full");
const readOnlyCred = createApiCredential("agt_test_readonly");
const revokedCred = createApiCredential("agt_test_revoked");

const mockCredentials: Record<string, any> = {
  [fullCred.hash]: {
    id: "cred-full-1",
    agent_id: "agent-1",
    label: "Full Access Token",
    token_prefix: fullCred.prefix,
    credential_hash: fullCred.hash,
    scopes: ["workflows:read", "quotes:create", "runs:create", "runs:read", "reports:read"],
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  [readOnlyCred.hash]: {
    id: "cred-readonly-1",
    agent_id: "agent-1",
    label: "Read Only Token",
    token_prefix: readOnlyCred.prefix,
    credential_hash: readOnlyCred.hash,
    scopes: ["reports:read"],
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  [revokedCred.hash]: {
    id: "cred-revoked-1",
    agent_id: "agent-1",
    label: "Revoked Token",
    token_prefix: revokedCred.prefix,
    credential_hash: revokedCred.hash,
    scopes: ["*"],
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: "2026-01-01T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  },
};

const mockAgent = {
  id: "agent-1",
  public_id: "agt_test_full",
  display_name: "Test Agent",
  owner_wallet: getAddress("0x1111111111111111111111111111111111111111"),
  agent_wallet: getAddress("0x3333333333333333333333333333333333333333"),
  agent_wallet_status: "verified",
  status: "active",
  canary_enabled: true,
  wallet_verified_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const mockPolicy = {
  agent_id: "agent-1",
  allowed_workflows: ["github_due_diligence", "sentiment_tone"],
  allowed_service_types: ["internal_deterministic", "live_provider"],
  max_price_per_run_usdc: "0.005",
  daily_spend_limit_usdc: "1.0",
  max_daily_calls: 50,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const mockQuotesStore = new Map<string, any>();

function createMockSupabaseClient(): any {
  return {
    from(tableName: string) {
      let filterEqField: string | null = null;
      let filterEqVal: any = null;

      const chain: any = {
        select(fields?: string, opts?: any) {
          if (opts?.count === "exact" && opts?.head === true) {
            return {
              count: 0,
              error: null,
              eq() { return this; },
              gte() { return this; },
              ilike() { return this; },
            };
          }
          return chain;
        },
        eq(field: string, val: any) {
          filterEqField = field;
          filterEqVal = val;
          return chain;
        },
        gte() { return chain; },
        in() { return chain; },
        ilike() { return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        async maybeSingle() {
          if (tableName === "byoa_agent_credentials") {
            const row = mockCredentials[filterEqVal];
            return { data: row || null, error: null };
          }
          if (tableName === "byoa_agents") {
            return { data: mockAgent, error: null };
          }
          if (tableName === "byoa_agent_policies") {
            return { data: mockPolicy, error: null };
          }
          if (tableName === "hosted_workflow_quotes") {
            const row = mockQuotesStore.get(filterEqVal);
            return { data: row || null, error: null };
          }
          return { data: null, error: null };
        },
        async single() {
          return chain.maybeSingle();
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        insert(row: any) {
          if (tableName === "hosted_workflow_quotes") {
            const id = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const storedRow = {
              id,
              ...row,
              created_at: new Date().toISOString(),
            };
            mockQuotesStore.set(row.idempotency_hash, storedRow);
            const res = { data: storedRow, error: null };
            return {
              ...res,
              select() {
                return {
                  single() {
                    return Promise.resolve(res);
                  },
                };
              },
            };
          }
          const res = { data: row, error: null };
          return {
            ...res,
            select() {
              return {
                single() {
                  return Promise.resolve(res);
                },
              };
            },
          };
        },
      };
      return chain;
    },
  };
}

import { setCheckoutClientForTesting } from "../lib/commerce/workflow-checkout.ts";

const mockClient = createMockSupabaseClient();
setByoaClientForTesting(mockClient);
setCheckoutClientForTesting(mockClient);

// --- Section 3: Endpoint Tests for GET /api/agent/v1/workflows ---
console.log("-> Testing GET /api/agent/v1/workflows...");

async function testWorkflowsEndpoint() {
  // Test 1: Missing Authorization header -> 401
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/workflows", {
      method: "GET",
    });
    const res = await workflowsGET(req);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, "credential_missing");
  }

  // Test 2: Invalid Bearer Token -> 401
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/workflows", {
      method: "GET",
      headers: { Authorization: "Bearer aac_invalid.token.12345" },
    });
    const res = await workflowsGET(req);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, "credential_missing");
  }

  // Test 3: Revoked Credential -> 401
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/workflows", {
      method: "GET",
      headers: { Authorization: `Bearer ${revokedCred.token}` },
    });
    const res = await workflowsGET(req);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, "credential_revoked");
  }

  // Test 4: Scope Denied (Read-Only Token without workflows:read scope) -> 403
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/workflows", {
      method: "GET",
      headers: { Authorization: `Bearer ${readOnlyCred.token}` },
    });
    const res = await workflowsGET(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, "scope_denied");
  }

  // Test 5: Successful Workflows Listing -> 200
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/workflows", {
      method: "GET",
      headers: { Authorization: `Bearer ${fullCred.token}` },
    });
    const res = await workflowsGET(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.version, "1");
    assert(Array.isArray(json.workflows), "workflows should be an array");

    const ghWf = json.workflows.find((w: any) => w.id === "github_due_diligence");
    assert(ghWf, "github_due_diligence workflow template missing");
    assert.equal(ghWf.name, "GitHub Project Due Diligence");
    assert.equal(ghWf.arc.chainId, 5042002);
    assert.equal(ghWf.arc.network, "arc-testnet");
    assert.equal(ghWf.arc.asset, "USDC");
    assert.deepEqual(ghWf.inputSchema.required, ["repository"]);
  }

  console.log("✔ GET /api/agent/v1/workflows tests passed.");
}

// --- Section 4: Endpoint Tests for POST /api/agent/v1/quotes ---
console.log("-> Testing POST /api/agent/v1/quotes...");

async function testQuotesEndpoint() {
  // Test 1: Missing Idempotency-Key Header -> 400 credential_missing
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullCred.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow: "github_due_diligence",
        input: { repository: "circlefin/agent-commerce" },
      }),
    });
    const res = await quotesPOST(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, "credential_missing");
    assert.equal(json.error.message, "Missing required Idempotency-Key header.");
  }

  // Test 2: Invalid Repository Input -> 400 invalid_repository
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullCred.token}`,
        "Idempotency-Key": `ik-inv-${Date.now()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow: "github_due_diligence",
        input: { repository: "invalid repository name!" },
      }),
    });
    const res = await quotesPOST(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, "invalid_repository");
  }

  // Test 3: Successful Quote Creation -> 201/200
  let createdQuoteId = "";
  const testIK = `ik-valid-${Date.now()}`;
  const validBody = {
    workflow: "github_due_diligence",
    input: { repository: "circlefin/agent-commerce" },
  };

  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullCred.token}`,
        "Idempotency-Key": testIK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    const res = await quotesPOST(req);
    const json = await res.json();
    if (![200, 201].includes(res.status)) {
      console.error("Quote POST returned:", res.status, json);
    }
    assert([200, 201].includes(res.status), `Expected status 200/201, got ${res.status}`);

    assert(json.quoteId, "Response must include quoteId");
    createdQuoteId = json.quoteId;
    assert.equal(json.workflow, "github_due_diligence");
    assert.equal(json.repository.fullName, "circlefin/agent-commerce");
    assert.equal(json.repository.canonicalUrl, "https://github.com/circlefin/agent-commerce");
    assert.equal(typeof json.totalUsdc, "number");
    assert.equal(typeof json.sponsored, "boolean");
    assert(json.expiresAt, "expiresAt must be set");
    assert.equal(json.requiredPayment.network, "arc-testnet");
    assert.equal(json.requiredPayment.asset, "USDC");
  }

  // Test 4: Idempotency Deduplication (Identical key & payload returns cached quote)
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullCred.token}`,
        "Idempotency-Key": testIK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    const res = await quotesPOST(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.quoteId, createdQuoteId, "Idempotent replay must return identical quoteId");
  }

  // Test 5: Idempotency Conflict (Same key, different payload -> 409)
  {
    const req = new NextRequest("http://localhost:3000/api/agent/v1/quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullCred.token}`,
        "Idempotency-Key": testIK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow: "github_due_diligence",
        input: { repository: "owner/different-repo" },
      }),
    });
    const res = await quotesPOST(req);
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.error.code, "invalid_repository");
    assert.match(json.error.message, /different workflow input/i);
  }

  console.log("✔ POST /api/agent/v1/quotes tests passed.");
}

async function runSuite() {
  await testWorkflowsEndpoint();
  await testQuotesEndpoint();
  console.log("✅ All Machine API v1 tests passed successfully!");
}

runSuite().catch((err) => {
  console.error("❌ Machine API test failure:", err);
  process.exit(1);
});
