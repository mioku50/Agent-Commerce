import { createHash } from "node:crypto";
import type { TrustDeltaChange } from "../monitoring/types.ts";
import { PROJECT_360_MODULE_LABELS, type Project360Module, type Project360Report } from "./types.ts";
import type {
  Project360DeltaReport,
  Project360MonitorSnapshotRow,
  Project360ModuleDelta,
} from "./monitoring-types.ts";

const SCORE_MEANINGFUL_THRESHOLD = 5;

function code(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
}

function riskCode(value: string) {
  return `risk_${code([value.trim().toLowerCase()])}`;
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function moduleChanges(previous: Project360Report | null, current: Project360Report) {
  const previousByModule = new Map(previous?.modules.map((item) => [item.module, item]) ?? []);
  return current.modules.flatMap((item): Project360ModuleDelta[] => {
    const before = previousByModule.get(item.module);
    if (before?.status === item.status && before.score === item.score) return [];
    return [{
      module: item.module,
      beforeStatus: before?.status ?? null,
      afterStatus: item.status,
      beforeScore: before?.score ?? null,
      afterScore: item.score,
    }];
  });
}

function riskChanges(previous: Project360Report | null, current: Project360Report) {
  const changes: TrustDeltaChange[] = [];
  const before = new Set(previous?.risks ?? []);
  const after = new Set(current.risks);
  for (const risk of after) {
    if (before.has(risk)) continue;
    changes.push({
      code: `new_${riskCode(risk)}`,
      kind: "new_risk",
      severity: "high",
      category: "trust_score",
      title: risk,
      summary: risk,
      before: null,
      after: risk,
    });
  }
  for (const risk of before) {
    if (after.has(risk)) continue;
    changes.push({
      code: `resolved_${riskCode(risk)}`,
      kind: "improved",
      severity: "medium",
      category: "trust_score",
      title: `${risk} resolved`,
      summary: `${risk} is no longer present in the current Project 360 evidence.`,
      before: risk,
      after: null,
    });
  }
  return changes;
}

const SIGNAL_KEYS: Record<Project360Module, RegExp> = {
  github_due_diligence: /(commitCount30d|commitCount90d|sampledHumanContributorCount|hasSecurityPolicy|hasLicense|workflowCount|isArchived|latestReleaseTag|latestReleaseAt|pushedAt|tagName)$/i,
  treasury_health: /(balance|runway|concentration|recurring|inflow|outflow|transactionCount|score|status)$/i,
  arc_contract_analysis: /(hasBytecode|isProxy|hasOwner|hasAdmin|isPausable|verified|score|status)$/i,
  paid_api_quality: /(overallScore|uptime|availability|latency|successRate|payment|settlement|score|status)$/i,
  agent_trust_report: /(trustScore|agentStatus|ownerVerified|successRate|completedRuns|verificationCoverage|reachable|score|status)$/i,
};

const PRIVATE_KEY = /(address|wallet|url|endpoint|hash|secret|token|credential|raw|id)$/i;

function collectSignals(value: unknown, matcher: RegExp, path = "", output = new Map<string, string | number | boolean | null>()) {
  if (output.size >= 16 || value === null) return output;
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((entry, index) => collectSignals(entry, matcher, `${path}[${index}]`, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (output.size >= 16) break;
    const nextPath = path ? `${path}.${key}` : key;
    if (!PRIVATE_KEY.test(key) && matcher.test(key)) {
      const metricValue = entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as { value?: unknown }).value
        : undefined;
      const safe = metricValue === undefined ? scalar(entry) : scalar(metricValue);
      if (safe !== null || entry === null) output.set(nextPath, safe);
    }
    if (entry && typeof entry === "object") collectSignals(entry, matcher, nextPath, output);
  }
  return output;
}

function sectionFor(report: Project360Report | null, module: Project360Module) {
  if (!report) return null;
  const index: Record<Project360Module, string> = {
    github_due_diligence: "github_due_diligence",
    agent_trust_report: "agent_trust_report",
    treasury_health: "treasury_health",
    paid_api_quality: "paid_api_quality",
    arc_contract_analysis: "arc_contract_analysis",
  };
  return report.sections.find((section) => section.id === index[module])?.data ?? null;
}

function category(module: Project360Module): TrustDeltaChange["category"] {
  if (module === "github_due_diligence") return "code";
  if (module === "treasury_health") return "payments";
  if (module === "arc_contract_analysis") return "contract";
  if (module === "paid_api_quality") return "endpoint";
  return "identity";
}

function signalChanges(previous: Project360Report | null, current: Project360Report) {
  const changes: TrustDeltaChange[] = [];
  for (const mod of Object.keys(SIGNAL_KEYS) as Project360Module[]) {
    const before = collectSignals(sectionFor(previous, mod), SIGNAL_KEYS[mod]);
    const after = collectSignals(sectionFor(current, mod), SIGNAL_KEYS[mod]);
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const left = before.get(key) ?? null;
      const right = after.get(key) ?? null;
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
      changes.push({
        code: `${mod}_${code([key])}`,
        kind: "activity",
        severity: "info",
        category: category(mod),
        title: `${PROJECT_360_MODULE_LABELS[mod]}: ${key.split(".").at(-1)}`,
        summary: `A public ${PROJECT_360_MODULE_LABELS[mod]} signal changed.`,
        before: left,
        after: right,
      });
    }
  }
  return changes.slice(0, 50);
}

export function buildProject360DeltaReport(input: {
  previous: Project360MonitorSnapshotRow | null;
  currentSnapshotId: string;
  current: Project360Report;
  generatedAt?: string;
}): Project360DeltaReport {
  const previousReport = input.previous?.report_snapshot ?? null;
  const previousScore = previousReport?.score.value ?? null;
  const currentScore = input.current.score.value;
  const scoreChange = previousScore === null || currentScore === null ? null : currentScore - previousScore;
  const modules = previousReport ? moduleChanges(previousReport, input.current) : [];
  const changes = previousReport ? [
    ...riskChanges(previousReport, input.current),
    ...modules.map((item): TrustDeltaChange => ({
      code: `module_${item.module}_${code([item.beforeStatus, item.afterStatus, item.beforeScore, item.afterScore])}`,
      kind: item.beforeStatus !== item.afterStatus ? "status_change" : "changed",
      severity: item.afterStatus === "completed" ? "low" : "high",
      category: category(item.module),
      title: `${PROJECT_360_MODULE_LABELS[item.module]} changed`,
      summary: `${PROJECT_360_MODULE_LABELS[item.module]} status or score changed.`,
      before: item.beforeStatus === null ? null : `${item.beforeStatus}:${item.beforeScore ?? "n/a"}`,
      after: `${item.afterStatus}:${item.afterScore ?? "n/a"}`,
    })),
    ...signalChanges(previousReport, input.current),
  ] : [];
  const newRisks = changes.filter((item) => item.kind === "new_risk").length;
  const resolvedRisks = changes.filter((item) => item.kind === "improved").length;
  const statusChanges = changes.filter((item) => item.kind === "status_change").length;
  const activityChanges = changes.filter((item) => item.kind === "activity").length;
  return {
    kind: "project_360_delta_report",
    version: 1,
    previousSnapshotId: input.previous?.public_id ?? null,
    currentSnapshotId: input.currentSnapshotId,
    score: {
      before: previousScore,
      after: currentScore,
      change: scoreChange,
      direction: scoreChange === null ? "unavailable" : scoreChange > 0 ? "improved" : scoreChange < 0 ? "declined" : "unchanged",
    },
    confidence: {
      before: previousReport?.score.confidencePercent ?? null,
      after: input.current.score.confidencePercent,
      change: previousReport ? input.current.score.confidencePercent - previousReport.score.confidencePercent : null,
    },
    coverage: {
      before: previousReport?.coverage.status ?? null,
      after: input.current.coverage.status,
      completedBefore: previousReport?.coverage.completed ?? null,
      completedAfter: input.current.coverage.completed,
      selected: input.current.coverage.expected,
    },
    verdict: {
      before: previousReport?.verdict ?? null,
      after: input.current.verdict,
      changed: Boolean(previousReport && previousReport.verdict !== input.current.verdict),
    },
    summary: {
      newRisks,
      resolvedRisks,
      improvements: resolvedRisks,
      statusChanges,
      activityChanges,
      totalChanges: changes.length,
    },
    moduleChanges: modules,
    changes,
    meaningful: Boolean(
      (scoreChange !== null && Math.abs(scoreChange) >= SCORE_MEANINGFUL_THRESHOLD) ||
      newRisks || resolvedRisks || statusChanges ||
      (previousReport && previousReport.verdict !== input.current.verdict),
    ),
    generatedAt: input.generatedAt ?? input.current.generatedAt,
  };
}
