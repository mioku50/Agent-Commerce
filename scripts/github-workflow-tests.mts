/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  HOSTED_WORKFLOW_TYPES,
  createHostedWorkflowPlan,
  validateHostedWorkflowRequest,
} from "../lib/agent/hosted-workflows.ts";
import { getHostedWorkflowTemplate } from "../lib/agent/workflow-templates.ts";
import { serviceRegistry, getServiceBySlug } from "../lib/services/registry.ts";
import { hostedServiceAllowlist, hostedIdempotencyRequestHash } from "../lib/agent/hosted-policy.ts";
import { requestBodyForService } from "../lib/agent/execution.ts";

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
    ref: req1.repository,
    repository: { fullName: "circlefin/agent-commerce", stars: 100 },
    activity: { recentCommitsCount: 10 },
  };

  const dueDiligenceService = getServiceBySlug("github-due-diligence-analysis");
  assert.ok(dueDiligenceService);
  const paidPreviews = [
    {
      service: "GitHub Repository Intelligence",
      response: dummySnapshot,
    },
  ];
  const dueDiligenceBody = requestBodyForService(
    dueDiligenceService,
    req1.task,
    req1.inputText,
    paidPreviews,
    null,
    req1.repository,
  );
  assert.deepEqual(dueDiligenceBody, {
    repository: req1.repository,
    snapshot: dummySnapshot,
  });
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

  console.log("\nALL GITHUB WORKFLOW TESTS PASSED CLEANLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
