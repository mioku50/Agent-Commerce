/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { privateKeyToAccount } from "viem/accounts";
import {
  HOSTED_WORKFLOW_TYPES,
  buildHostedFinalReport,
  createHostedWorkflowPlan,
  validateHostedWorkflowRequest,
} from "../lib/agent/hosted-workflows.ts";
import { getHostedWorkflowTemplate } from "../lib/agent/workflow-templates.ts";
import { serviceRegistry, getServiceBySlug } from "../lib/services/registry.ts";
import { hostedServiceAllowlist, hostedIdempotencyRequestHash } from "../lib/agent/hosted-policy.ts";
import { requestBodyForService, WorkflowDependencyError } from "../lib/agent/execution.ts";
import { POST as createQuotePost } from "../app/api/hosted-agent/quotes/route.ts";

async function runTests() {
  console.log("Running GitHub Workflow Tests...");

  // Test 1: HOSTED_WORKFLOW_TYPES ordering
  assert.equal(
    HOSTED_WORKFLOW_TYPES[0],
    "github_due_diligence",
    "github_due_diligence must be FIRST in HOSTED_WORKFLOW_TYPES",
  );
  console.log("✓ HOSTED_WORKFLOW_TYPES[0] is github_due_diligence");

  // Test 2: Workflow Template registration
  const template = getHostedWorkflowTemplate("github_due_diligence");
  assert.ok(template, "github_due_diligence template must exist");
  assert.equal(template.label, "GitHub Project Due Diligence");
  assert.equal(template.shortLabel, "GitHub Due Diligence");
  assert.equal(template.estimatedSpendUsdc, 0.002);
  assert.equal(template.services.length, 2);
  assert.equal(template.services[0].slug, "github-repository-intelligence");
  assert.equal(template.services[0].priceUsdc, 0.0015);
  assert.equal(template.services[1].slug, "github-due-diligence-analysis");
  assert.equal(template.services[1].priceUsdc, 0.0005);
  console.log("✓ Workflow template registered correctly with 0.002 USDC total price");

  // Test 3: Request Validation with repositoryUrl & inputText
  const req1 = validateHostedWorkflowRequest({
    workflowType: "github_due_diligence",
    repositoryUrl: "https://github.com/circlefin/agent-commerce",
  });
  assert.equal(req1.workflowType, "github_due_diligence");
  assert.ok(req1.repository, "Repository ref should be parsed");
  assert.equal(req1.repository.owner, "circlefin");
  assert.equal(req1.repository.name, "agent-commerce");
  assert.equal(req1.repository.canonicalUrl, "https://github.com/circlefin/agent-commerce");
  assert.equal(req1.inputText, "https://github.com/circlefin/agent-commerce");

  const req2 = validateHostedWorkflowRequest({
    workflowType: "github_due_diligence",
    inputText: "vercel/next.js",
  });
  assert.equal(req2.repository?.owner, "vercel");
  assert.equal(req2.repository?.name, "next.js");
  assert.equal(req2.inputText, "https://github.com/vercel/next.js");
  console.log("✓ Request validation parses repositoryUrl and inputText to canonical ref");

  // Test 4: Planner snapshot generation & 0.002 USDC pricing calculation
  const allowlist = hostedServiceAllowlist();
  const plan = createHostedWorkflowPlan({
    request: req1,
    services: serviceRegistry,
    allowlist,
  });
  assert.equal(plan.workflowType, "github_due_diligence");
  assert.equal(plan.version, 4);
  assert.equal(plan.selectedServices.length, 2);
  assert.equal(plan.selectedServices[0].slug, "github-repository-intelligence");
  assert.equal(plan.selectedServices[1].slug, "github-due-diligence-analysis");
  assert.equal(plan.estimatedSpendUsdc, 0.002);
  assert.ok(plan.repository);
  assert.equal(plan.repository.fullName, "circlefin/agent-commerce");
  console.log("✓ Planner selects 2 services with exactly 0.002 USDC estimated spend");

  // Test 5: Execution Chaining - requestBodyForService
  const intelService = getServiceBySlug("github-repository-intelligence");
  assert.ok(intelService);
  const intelBody = requestBodyForService(
    intelService,
    req1.task,
    req1.inputText,
    [],
    null,
    req1.repository,
  );
  assert.deepEqual(intelBody, { owner: "circlefin", repository: "agent-commerce" });

  const dummySnapshot = {
    version: 1,
    ref: req1.repository,
    repository: { owner: "circlefin", name: "agent-commerce", fullName: "circlefin/agent-commerce", defaultBranch: "main", stars: 100 },
    activity: { recentCommitCount: 10 },
    documentation: { hasReadme: true },
    stack: { primaryLanguage: "TypeScript" },
    source: { provider: "GitHub REST API v3" },
  };

  const dueDiligenceService = getServiceBySlug("github-due-diligence-analysis");
  assert.ok(dueDiligenceService);
  const runtimeMap = new Map<string, unknown>([["github-repository-intelligence", dummySnapshot]]);
  const dueDiligenceBody = requestBodyForService(
    dueDiligenceService,
    req1.task,
    req1.inputText,
    [],
    null,
    req1.repository,
    runtimeMap,
  );
  assert.deepEqual(dueDiligenceBody, {
    repository: req1.repository,
    snapshot: dummySnapshot,
  });

  assert.throws(
    () =>
      requestBodyForService(
        dueDiligenceService,
        req1.task,
        req1.inputText,
        [],
        null,
        req1.repository,
        new Map(),
      ),
    (err: unknown) =>
      err instanceof WorkflowDependencyError && err.code === "github_snapshot_unavailable",
    "Must throw WorkflowDependencyError when snapshot is unavailable",
  );
  console.log("✓ Execution chaining passes owner/repo to step 1 and extracted snapshot to step 2");

  // Test 6: Request hashing & Idempotency protection
  const hash1 = hostedIdempotencyRequestHash({
    secret: "test-secret-12345",
    workflowType: req1.workflowType,
    inputSha256: "sha256-abc",
    task: req1.task,
    repository: req1.repository,
    budgetUsdc: 0.005,
  });

  const hash2 = hostedIdempotencyRequestHash({
    secret: "test-secret-12345",
    workflowType: req2.workflowType,
    inputSha256: "sha256-abc",
    task: req2.task,
    repository: req2.repository,
    budgetUsdc: 0.005,
  });

  assert.notEqual(hash1, hash2, "Different repositories must produce different request hashes");

  const hash1Repeat = hostedIdempotencyRequestHash({
    secret: "test-secret-12345",
    workflowType: req1.workflowType,
    inputSha256: "sha256-abc",
    task: req1.task,
    repository: req1.repository,
    budgetUsdc: 0.005,
  });
  assert.equal(hash1, hash1Repeat, "Identical request must produce identical request hash");
  console.log("✓ Idempotency request hash correctly includes repository reference");

  // Test 7: Quote Endpoint Rejection when GitHub services are disabled
  const testPrivateKey = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
  const testAddress = privateKeyToAccount(testPrivateKey).address;
  process.env.HOSTED_AGENT_PRIVATE_KEY = testPrivateKey;
  process.env.HOSTED_AGENT_ADDRESS = testAddress;
  process.env.SELLER_ADDRESS ||= "0x2222222222222222222222222222222222222222";
  process.env.HOSTED_AGENT_BASE_URL ||= "http://localhost:3000";
  process.env.HOSTED_AGENT_RATE_LIMIT_SECRET ||= "test-rate-limit-secret-123456";

  const originalAllowlist = process.env.HOSTED_AGENT_ALLOWED_SERVICE_SLUGS;
  try {
    // Case 7a: Exclude both GitHub services
    process.env.HOSTED_AGENT_ALLOWED_SERVICE_SLUGS = "premium-quote,text-analyzer,pyth-market-price";
    const reqExcludedBoth = new NextRequest("http://localhost:3000/api/hosted-agent/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "test-idempotency-key-disabled-both-github",
      },
      body: JSON.stringify({
        workflowType: "github_due_diligence",
        inputText: "https://github.com/circlefin/agent-commerce",
        requesterWallet: "0x1111111111111111111111111111111111111111",
      }),
    });
    const resExcludedBoth = await createQuotePost(reqExcludedBoth);
    const dataExcludedBoth = (await resExcludedBoth.json()) as { error?: string; reason?: string };
    assert.equal(
      resExcludedBoth.status,
      503,
      "Quote creation must return HTTP status 503 when required services are excluded",
    );
    assert.equal(
      dataExcludedBoth.reason,
      "workflow_services_unavailable",
      "Response reason must be workflow_services_unavailable when 0 services are selected",
    );

    // Case 7b: Exclude only one required GitHub service (github-due-diligence-analysis missing)
    process.env.HOSTED_AGENT_ALLOWED_SERVICE_SLUGS = "github-repository-intelligence";
    const reqExcludedOne = new NextRequest("http://localhost:3000/api/hosted-agent/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "test-idempotency-key-disabled-one-github",
      },
      body: JSON.stringify({
        workflowType: "github_due_diligence",
        inputText: "https://github.com/circlefin/agent-commerce",
        requesterWallet: "0x1111111111111111111111111111111111111111",
      }),
    });
    const resExcludedOne = await createQuotePost(reqExcludedOne);
    assert.equal(
      resExcludedOne.status,
      503,
      "Quote creation must return HTTP status 503 when GitHub workflow is incomplete",
    );
    const dataExcludedOne = (await resExcludedOne.json()) as { error?: string; reason?: string };
    assert.equal(
      dataExcludedOne.reason,
      "github_workflow_incomplete",
      "Response reason must be github_workflow_incomplete when required analysis service is missing",
    );

    console.log("✓ Quote creation rejects with 503 and github_workflow_incomplete when GitHub services are disabled");
  } finally {
    if (originalAllowlist !== undefined) {
      process.env.HOSTED_AGENT_ALLOWED_SERVICE_SLUGS = originalAllowlist;
    } else {
      delete process.env.HOSTED_AGENT_ALLOWED_SERVICE_SLUGS;
    }
  }

  // Test 8: Final report generation from workflow artifacts
  const dummyAssessment = {
    overallStatus: "healthy_signals" as const,
    summary: "Healthy repository signals.",
    categories: {} as any,
    risks: [],
  };
  const report = buildHostedFinalReport({
    jobId: "00000000-0000-4000-8000-000000000088",
    request: req1,
    plan,
    agentRunId: "00000000-0000-4000-8000-000000000089",
    agentWallet: "0x1111111111111111111111111111111111111111",
    spentUsdc: "0.002",
    receiptIds: [],
    proofTransactionHashes: [],
    serviceResults: [],
    executionResult: {
      workflowArtifacts: {
        githubRepositorySnapshot: dummySnapshot as any,
        githubDueDiligenceAssessment: dummyAssessment as any,
      },
    },
    explorerUrl: "https://testnet.arcscan.app",
  });
  assert.ok(report.workflowData, "workflowData must be populated for github_due_diligence");
  assert.equal(report.workflowData.kind, "github_due_diligence");
  assert.deepEqual(report.workflowData.repository, req1.repository);
  assert.equal(report.workflowData.snapshot, dummySnapshot);
  assert.equal(report.workflowData.assessment, dummyAssessment);
  console.log("✓ buildHostedFinalReport builds workflowData directly from executionResult.workflowArtifacts");

  console.log("\nALL GITHUB WORKFLOW TESTS PASSED CLEANLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
