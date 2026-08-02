import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProject360Report } from "../lib/project-360/report.ts";
import { buildProject360DeltaReport } from "../lib/project-360/monitoring-delta.ts";
import type { Project360Input, Project360ModuleResult } from "../lib/project-360/types.ts";
import type { Project360MonitorSnapshotRow } from "../lib/project-360/monitoring-types.ts";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const source = {
  candidateId: "src_11111111111111111111",
  type: "github_repository" as const,
  module: "github_due_diligence" as const,
  canonicalValue: "https://github.com/example/project",
  valueHash: "a".repeat(64),
  origin: "primary" as const,
  confidence: "high" as const,
};
const projectInput: Project360Input = {
  schema: "veyra.project360.input.v1",
  discoveryId: "dsc_11111111111111111111",
  discoveryRevision: 1,
  discoverySnapshotHash: "b".repeat(64),
  selectionHash: "c".repeat(64),
  sources: [source],
  modules: ["github_due_diligence"],
};

function moduleResult(score: number): Project360ModuleResult {
  return {
    module: "github_due_diligence",
    status: "completed",
    inputHash: "d".repeat(64),
    childReportHash: `0x${"e".repeat(64)}`,
    score,
    confidence: "high",
    retryable: false,
    publicReason: null,
    internalErrorCode: null,
    report: null,
  };
}

const beforeReport = buildProject360Report({
  reportId: "p360_monitor_before",
  projectInput,
  moduleResults: [moduleResult(82)],
  generatedAt: "2026-08-01T00:00:00.000Z",
});
beforeReport.risks = ["Security policy requires review"];
beforeReport.sections.find((section) => section.id === "github_due_diligence")!.data = {
  activity: { commitCount90d: 294 },
  documentation: { hasSecurityPolicy: true },
};
const afterReport = buildProject360Report({
  reportId: "p360_monitor_after",
  projectInput,
  moduleResults: [moduleResult(68)],
  generatedAt: "2026-08-02T00:00:00.000Z",
});
afterReport.risks = ["Endpoint availability requires review"];
afterReport.sections.find((section) => section.id === "github_due_diligence")!.data = {
  activity: { commitCount90d: 318 },
  documentation: { hasSecurityPolicy: false },
};

const previous = {
  public_id: "pms_11111111111111111111",
  project_trust_score: beforeReport.score.value,
  confidence_percent: beforeReport.score.confidencePercent,
  coverage_status: beforeReport.coverage.status,
  report_snapshot: beforeReport,
  report_hash: beforeReport.verification.reportHash,
} as Project360MonitorSnapshotRow;
const delta = buildProject360DeltaReport({
  previous,
  currentSnapshotId: "pms_22222222222222222222",
  current: afterReport,
});
assert.equal(delta.kind, "project_360_delta_report");
assert.equal(delta.score.change, -14);
assert.equal(delta.summary.newRisks, 1);
assert.equal(delta.summary.resolvedRisks, 1);
assert.equal(delta.meaningful, true);
assert.ok(delta.changes.some((change) => change.code.startsWith("new_risk_")));
assert.ok(delta.changes.some((change) => change.code.startsWith("resolved_risk_")));
assert.ok(delta.changes.some((change) => change.title.includes("commitCount90d")));
assert.ok(delta.changes.some((change) => change.title.includes("hasSecurityPolicy")));
assert.doesNotMatch(JSON.stringify(delta), /0x[0-9a-fA-F]{40}|credential|internalErrorCode/);

const baseline = buildProject360DeltaReport({
  previous: null,
  currentSnapshotId: "pms_33333333333333333333",
  current: beforeReport,
});
assert.equal(baseline.previousSnapshotId, null);
assert.equal(baseline.changes.length, 0);
assert.equal(baseline.meaningful, false);

const migration = read("supabase/migrations/20260802180000_p43_project_360_continuous_monitoring.sql");
for (const table of [
  "project_360_monitors",
  "project_360_monitor_rechecks",
  "project_360_monitor_snapshots",
  "project_360_monitor_suggestions",
]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
}
assert.match(migration, /prevent_project_360_monitor_config_change_v1/);
assert.match(migration, /new\.selected_modules <> old\.selected_modules/);
assert.match(migration, /new\.source_value_hashes <> old\.source_value_hashes/);
assert.match(migration, /new\.selected_candidates_snapshot <> old\.selected_candidates_snapshot/);
assert.match(migration, /launch_project_360_monitoring_checkout_v1/);
assert.match(migration, /v_source_hashes <> v_monitor\.source_value_hashes/);
assert.match(migration, /v_modules <> \(select array_agg/);
assert.match(migration, /sponsorship_source[\s\S]*'scheduled_monitoring'/);

const service = read("lib/project-360/monitoring-service.ts");
assert.match(service, /cloneExecutionDiscovery\(input\.monitor, recheck\)/);
assert.match(service, /selected_candidates_snapshot\.map/);
assert.match(service, /!monitor\.selected_modules\.includes\(candidate\.module\)/);
assert.match(service, /project_360_monitor_suggestions/);
assert.doesNotMatch(service, /selected_modules\s*:\s*\[\.\.\.monitor\.selected_modules,/);

const publicPage = read("app/trust/[publicId]/page.tsx");
const controlPlane = read("app/monitoring/project-360-monitoring-client.tsx");
assert.match(publicPage, /project_360/);
assert.match(controlPlane, /never purchased automatically/i);
assert.match(controlPlane, /Review & add/);
assert.match(controlPlane, /390|overflow-x|horizontal overflow/i.test(controlPlane) ? /./ : /min-w-0/);

console.log("Project 360 continuous monitoring tests passed.");
