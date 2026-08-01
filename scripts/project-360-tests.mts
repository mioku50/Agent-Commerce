import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalProject360Input,
  normalizeProject360Input,
  normalizeProject360Source,
  project360SelectionHash,
} from "../lib/project-360/input.ts";
import {
  detectProject360CandidatesFromGitHubFiles,
  limitProject360Candidates,
} from "../lib/project-360/discovery.ts";
import {
  buildProject360Report,
  computeProject360ReportHash,
  formatProject360ReportAsMarkdown,
  validateProject360ReportPayload,
} from "../lib/project-360/report.ts";
import type {
  Project360Input,
  Project360ModuleResult,
} from "../lib/project-360/types.ts";
import { validateHostedWorkflowRequest } from "../lib/agent/hosted-workflows.ts";
import { previewHostedWorkflow } from "../lib/agent/hosted-jobs.ts";

const github = normalizeProject360Source({
  type: "github_repository",
  value: "https://github.com/OpenAI/OpenAI/tree/main",
});
assert.equal(github.canonicalValue, "https://github.com/openai/openai");
assert.equal(github.module, "github_due_diligence");

assert.throws(
  () => normalizeProject360Source({ type: "public_api_endpoint", value: "https://127.0.0.1/admin" }),
  /blocked|Private|reserved/i,
);
assert.throws(
  () => normalizeProject360Source({ type: "public_api_endpoint", value: "http://example.com" }),
  /HTTPS/i,
);

const detected = detectProject360CandidatesFromGitHubFiles("acme/project", [
  {
    path: "README.md",
    sizeBytes: 260,
    content: [
      "Official API endpoint: https://api.example.com/v1?utm_source=readme",
      "Arc contract: 0x1111111111111111111111111111111111111111",
      "Veyra Agent ID: agt_1234567890abcdefghij",
      "Related repository: https://github.com/acme/related/tree/main",
      "Maintainer profile: https://github.com/acme",
      "API_KEY=sk-or-v1-this-line-must-never-be-stored",
    ].join("\n"),
  },
]);
assert.equal(detected.candidates.length, 4);
assert.equal(
  detected.candidates.find((candidate) => candidate.sourceType === "public_api_endpoint")?.canonicalValue,
  "https://api.example.com/v1",
);
assert.ok(detected.candidates.every((candidate) => candidate.lineStart !== null));
assert.ok(detected.candidates.every((candidate) => !candidate.safeExcerpt?.includes("sk-or-v1")));
const crowded = limitProject360Candidates([
  ...detected.candidates,
  ...Array.from({ length: 30 }, (_, index) =>
    detectProject360CandidatesFromGitHubFiles("acme/project", [{
      path: `docs/endpoint-${index}.md`,
      sizeBytes: 80,
      content: `API endpoint: https://api-${index}.example.com/v1`,
    }]).candidates[0],
  ).filter(Boolean),
]);
assert.equal(crowded.length, 25);
assert.ok(crowded.some((candidate) => candidate.sourceType === "agent_id"));
assert.ok(crowded.some((candidate) => candidate.sourceType === "arc_contract"));

function source(
  candidateId: string,
  type: Project360Input["sources"][number]["type"],
  value: string,
): Project360Input["sources"][number] {
  const normalized = normalizeProject360Source({ type, value });
  return {
    candidateId,
    type,
    module: normalized.module,
    canonicalValue: normalized.canonicalValue,
    valueHash: normalized.valueHash,
    origin: "primary",
    confidence: "high",
  };
}

const githubSource = source(
  "src_11111111111111111111",
  "github_repository",
  "https://github.com/acme/project",
);
const partialSelectionHash = project360SelectionHash({
  discoveryId: "dsc_11111111111111111111",
  discoveryRevision: 1,
  candidatesHash: "a".repeat(64),
  sources: [githubSource],
  modules: ["github_due_diligence"],
});
const partialInput = normalizeProject360Input({
  schema: "veyra.project360.input.v1",
  discoveryId: "dsc_11111111111111111111",
  discoveryRevision: 1,
  discoverySnapshotHash: "a".repeat(64),
  selectionHash: partialSelectionHash,
  sources: [githubSource],
  modules: ["github_due_diligence"],
});
assert.equal(canonicalProject360Input(partialInput), canonicalProject360Input(partialInput));

const completedGithub: Project360ModuleResult = {
  module: "github_due_diligence",
  status: "completed",
  inputHash: "b".repeat(64),
  childReportHash: `0x${"c".repeat(64)}`,
  score: 80,
  confidence: "high",
  errorCode: null,
  report: null,
};
const partialReport = buildProject360Report({
  reportId: "p360_test_partial",
  projectInput: partialInput,
  moduleResults: [completedGithub],
  generatedAt: "2026-08-01T00:00:00.000Z",
});
assert.equal(partialReport.coverage.status, "partial");
assert.equal(partialReport.coverage.completed, 1);
assert.equal(partialReport.coverage.label, "Partial Project 360 Report");
assert.equal(partialReport.score.value, 80);
assert.equal(partialReport.score.confidencePercent, 20);
assert.equal(partialReport.sections.length, 15);
assert.deepEqual(partialReport.sections.map((section) => section.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
assert.equal(validateProject360ReportPayload(partialReport), true);
const markdown = formatProject360ReportAsMarkdown(partialReport);
assert.equal((markdown.match(/^## \d+\./gm) ?? []).length, 15);
assert.match(markdown, new RegExp(partialReport.verification.reportHash));

assert.throws(
  () => normalizeProject360Input({ ...partialInput, selectionHash: "f".repeat(64) }),
  /selection binding/i,
);

const tampered = structuredClone(partialReport);
tampered.modules[0].score = 79;
assert.equal(validateProject360ReportPayload(tampered), false);
assert.notEqual(
  computeProject360ReportHash(partialReport),
  computeProject360ReportHash({ ...partialReport, selectionHash: "d".repeat(64) }),
);

const fullSources = [
  githubSource,
  source("src_22222222222222222222", "agent_id", "agt_1234567890abcdefghij"),
  source("src_33333333333333333333", "project_wallet", "0x2222222222222222222222222222222222222222"),
  source("src_44444444444444444444", "arc_contract", "0x3333333333333333333333333333333333333333"),
  source("src_55555555555555555555", "public_api_endpoint", "https://api.example.com/v1"),
];
const fullModules = [
  "github_due_diligence",
  "agent_trust_report",
  "treasury_health",
  "paid_api_quality",
  "arc_contract_analysis",
] as const;
const fullSelectionHash = project360SelectionHash({
  discoveryId: "dsc_22222222222222222222",
  discoveryRevision: 2,
  candidatesHash: "e".repeat(64),
  sources: fullSources,
  modules: [...fullModules],
});
const fullInput = normalizeProject360Input({
  schema: "veyra.project360.input.v1",
  discoveryId: "dsc_22222222222222222222",
  discoveryRevision: 2,
  discoverySnapshotHash: "e".repeat(64),
  selectionHash: fullSelectionHash,
  sources: fullSources,
  modules: fullModules,
});
const request = validateHostedWorkflowRequest({
  workflowType: "project_360",
  project360Input: fullInput,
  budgetUsdc: 0.01,
});
const plan = await previewHostedWorkflow(request);
assert.equal(plan.maxPaidCalls, 7);
assert.equal(plan.selectedServices.length, 7);
assert.deepEqual(plan.selectedServices.map((service) => service.slug), [
  "github-repository-intelligence",
  "github-due-diligence-analysis",
  "agent-trust-finalizer",
  "api-quality-finalizer",
  "treasury-health-finalizer",
  "arc-contract-analysis-finalizer",
  "project-360-finalizer",
]);
assert.equal(plan.estimatedSpendUsdc, 0.0072);

const limitedReport = buildProject360Report({
  reportId: "p360_test_limited",
  projectInput: { ...fullInput, modules: ["github_due_diligence", "agent_trust_report"] },
  moduleResults: [
    completedGithub,
    {
      module: "agent_trust_report",
      status: "failed",
      inputHash: "f".repeat(64),
      childReportHash: null,
      score: null,
      confidence: "insufficient",
      errorCode: "provider_failure",
      report: null,
    },
  ],
  generatedAt: "2026-08-01T00:00:00.000Z",
});
assert.equal(limitedReport.coverage.status, "limited");
assert.equal(limitedReport.coverage.label, "Completed with limited coverage");
assert.equal(limitedReport.score.value, 80);
assert.equal(validateProject360ReportPayload({
  ...partialReport,
  score: {
    ...partialReport.score,
    breakdown: partialReport.score.breakdown.map((item) => ({
      score: item.score,
      module: item.module,
      weight: item.weight,
      confidence: item.confidence,
    })),
  },
}), true, "Persisted JSONB key ordering must not invalidate a canonical report.");

const migration = readFileSync(
  new URL("../supabase/migrations/20260801120000_p42_project_360.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /begin;[\s\S]*commit;/i);
const budgetMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260801190000_p421_project_360_budget_constraints.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(budgetMigration, /hosted_workflow_quotes_budget_usdc_check/i);
assert.match(budgetMigration, /hosted_agent_jobs_budget_usdc_check/i);
assert.match(budgetMigration, /between 0\.001 and 0\.010/i);
const executionMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260801193000_p421_project_360_execution_constraints.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacyServiceMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260801223000_p421_project_360_legacy_service_constraint.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(executionMigration, /jsonb_array_length\(selected_services\) <= 7/i);
assert.match(executionMigration, /hosted_agent_jobs_spent_usdc_check/i);
assert.match(legacyServiceMigration, /begin;[\s\S]*commit;/i);
assert.match(legacyServiceMigration, /hosted_agent_jobs_selected_services_array_check/i);
assert.match(legacyServiceMigration, /jsonb_array_length\(selected_services\) <= 7/i);
for (const guard of [
  "validate_project_360_discovery_tenant",
  "validate_project_360_quote_binding",
  "reject_project_360_quote_mutation",
  "reject_quoted_project_360_candidate_mutation",
  "reject_quoted_project_360_discovery_mutation",
  "validate_project_360_module_run_tenant",
]) {
  assert.match(migration, new RegExp(`create trigger ${guard}`));
}
assert.match(
  migration,
  /revoke all on table public\.project_360_quotes from public, anon, authenticated;/,
);

const serviceSource = readFileSync(
  new URL("../lib/project-360/service.ts", import.meta.url),
  "utf8",
);
const checkoutSource = readFileSync(
  new URL("../lib/commerce/workflow-checkout.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  serviceSource,
  /from\("project_360_quotes"\)[\s\S]{0,160}\.upsert\(/,
  "Immutable Project 360 quote mappings must never be updated on replay.",
);
assert.match(serviceSource, /project_quote_checkout_unavailable/);
assert.match(serviceSource, /project_quote_\$\{error\.stage\}_unavailable/);
assert.match(serviceSource, /error instanceof HostedCheckoutPolicyError/);
assert.match(serviceSource, /error instanceof HostedCheckoutInfrastructureError/);
assert.match(checkoutSource, /HostedCheckoutInfrastructureStage/);
assert.match(checkoutSource, /quote_persistence/);

const confirmationRoute = readFileSync(
  new URL("../app/api/project-360/quotes/[quoteId]/confirm/route.ts", import.meta.url),
  "utf8",
);
assert.match(confirmationRoute, /project_quote_immutable/);
assert.match(confirmationRoute, /selectedCandidateIds/);
assert.match(confirmationRoute, /amountUsdc/);
assert.match(confirmationRoute, /getHostedWorkflowUserPaymentForJob/);
assert.match(confirmationRoute, /payment\.transactionHash\.toLowerCase\(\) === transactionHash\.toLowerCase\(\)/);
assert.match(confirmationRoute, /idempotencyHash = stored\.quote\.idempotency_hash/);
assert.match(confirmationRoute, /recoverHostedProject360AggregateProof/);
assert.match(checkoutSource, /HostedCheckoutInfrastructureStage/);

const hostedJobsSource = readFileSync(
  new URL("../lib/agent/hosted-jobs.ts", import.meta.url),
  "utf8",
);
assert.match(hostedJobsSource, /recoverHostedProject360AggregateProof/);
assert.match(hostedJobsSource, /workflowData\.report!\.verification\.reportHash/);
assert.match(hostedJobsSource, /publishStoredProof/);

console.log("Project 360 tests passed.");
