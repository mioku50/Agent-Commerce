/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildHostedFinalReport,
  createHostedWorkflowPlan,
  validateHostedWorkflowRequest,
} from "../lib/agent/hosted-workflows.ts";
import { serviceRegistry } from "../lib/services/registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectInvalid(label: string, input: Parameters<typeof validateHostedWorkflowRequest>[0]) {
  try {
    validateHostedWorkflowRequest(input);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted unexpectedly.`);
}

const allowlist = [
  { slug: "premium-quote", endpoint: "/api/premium/quote", method: "GET" as const },
  { slug: "text-analyzer", endpoint: "/api/premium/compute", method: "POST" as const },
];

const request = validateHostedWorkflowRequest({
  workflowType: "sentiment_tone",
  task: "Produce a useful sentiment and tone report from this update.",
  inputText: "The release is stable, thoughtfully documented, and ready for builders to test today.",
  budgetUsdc: "0.005",
});
const plan = createHostedWorkflowPlan({
  request,
  services: serviceRegistry,
  allowlist,
});

assert(plan.selectedServices.length === 2, "Multi-service workflow did not select two paid APIs.");
assert(plan.selectedServices.length <= 3, "Hosted plan exceeded the three-call cap.");
assert(plan.estimatedSpendUsdc === 0.0013, "Multi-service estimated cost is incorrect.");
assert(
  plan.selectedServices.every((service) =>
    allowlist.some((allowed) =>
      allowed.slug === service.slug &&
      allowed.endpoint === service.endpoint &&
      allowed.method === service.method,
    ),
  ),
  "Hosted plan selected a service outside the fixed allowlist.",
);

expectInvalid("unknown workflow", {
  workflowType: "arbitrary",
  task: "A valid task that should still reject the workflow.",
  inputText: "A sufficiently long source text for validation.",
  budgetUsdc: 0.005,
});
expectInvalid("short workflow input", {
  workflowType: "builder_update",
  task: "Analyze this builder update safely.",
  inputText: "Too short",
  budgetUsdc: 0.005,
});
expectInvalid("oversized workflow input", {
  workflowType: "sentiment_tone",
  task: "Analyze this long text safely.",
  inputText: "x".repeat(5_001),
  budgetUsdc: 0.005,
});
expectInvalid("budget above cap", {
  workflowType: "custom_task",
  task: "Analyze a useful custom task with safe services.",
  inputText: "Optional text",
  budgetUsdc: 0.005001,
});

const report = buildHostedFinalReport({
  jobId: "00000000-0000-4000-8000-000000000020",
  request,
  plan,
  agentRunId: "00000000-0000-4000-8000-000000000021",
  agentWallet: "0x0000000000000000000000000000000000000020",
  spentUsdc: "0.001",
  receiptIds: ["00000000-0000-4000-8000-000000000022"],
  proofTransactionHashes: [`0x${"20".repeat(32)}`],
  explorerUrl: "https://testnet.arcscan.app",
  serviceResults: [
    {
      serviceId: "premium-quote",
      serviceSlug: "premium-quote",
      serviceName: "Premium Quote",
      status: "paid",
      amountUsdc: "0.001",
      stepId: "00000000-0000-4000-8000-000000000022",
      paymentEventId: "00000000-0000-4000-8000-000000000023",
      response: { quote: "A real paid response" },
      error: null,
    },
    {
      serviceId: "text-analyzer",
      serviceSlug: "text-analyzer",
      serviceName: "Text Analyzer",
      status: "failed",
      amountUsdc: null,
      stepId: "00000000-0000-4000-8000-000000000024",
      paymentEventId: null,
      response: null,
      error: "Synthetic service failure",
    },
  ],
});
assert(report.completedWithWarnings, "Partial failure was not surfaced in the Final Report.");
assert(report.apiResults.length === 2, "Partial report did not preserve every selected API result.");
assert(report.keyFindings.some((finding) => finding.includes("failed")), "Partial failure finding is missing.");
assert(report.aggregationMode === "deterministic_structured", "Report claims an unsupported aggregation mode.");

console.log("[hosted-workflow-test] passed: input validation, fixed allowlist, two-service planning, budget/call caps, deterministic Final Report, partial failure");
