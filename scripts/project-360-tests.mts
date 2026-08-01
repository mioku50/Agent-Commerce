import assert from "node:assert/strict";
import {
  canonicalProject360Input,
  normalizeProject360Input,
  normalizeProject360Source,
  project360SelectionHash,
} from "../lib/project-360/input.ts";
import { detectProject360CandidatesFromGitHubFiles } from "../lib/project-360/discovery.ts";
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

console.log("Project 360 tests passed.");
