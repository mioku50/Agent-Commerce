import { createHash } from "node:crypto";
import type { AgentTrustReport, EvidenceItem } from "../agent-trust/types.ts";
import type {
  TrustDeltaChange,
  TrustDeltaKind,
  TrustDeltaReport,
  TrustDeltaSeverity,
} from "./types.ts";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function code(parts: Array<string | number | boolean | null | undefined>) {
  const readable = parts.map((part) => slug(String(part ?? "none"))).filter(Boolean).join("_");
  if (readable.length <= 96) return readable;
  const suffix = createHash("sha256").update(readable).digest("hex").slice(0, 12);
  return `${readable.slice(0, 80)}_${suffix}`;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "not available";
  if (typeof value === "boolean") return value ? "present" : "missing";
  return String(value);
}

function change(input: TrustDeltaChange) {
  return input;
}

function severityForEvidence(item: EvidenceItem): TrustDeltaSeverity {
  if (item.category === "agent_identity" && /status|mismatch/i.test(item.title)) return "high";
  if (item.category === "contract_transparency") return "high";
  if (item.category === "service_reliability") return "medium";
  if (item.category === "code_health") return "medium";
  return "low";
}

function evidenceKey(item: EvidenceItem) {
  return [item.category, item.source, item.title].map(slug).join(":");
}

function categoryForEvidence(item: EvidenceItem): TrustDeltaChange["category"] {
  if (item.category === "code_health") return "code";
  if (item.category === "agent_identity") return "identity";
  if (item.category === "execution_reliability") return "execution";
  if (item.category === "payment_history") return "payments";
  if (item.category === "service_reliability") return "services";
  return "contract";
}

function evidenceChanges(
  previous: AgentTrustReport,
  current: AgentTrustReport,
): TrustDeltaChange[] {
  const previousRisks = new Map(
    previous.risksAndReviewItems.map((item) => [evidenceKey(item), item]),
  );
  const currentRisks = new Map(
    current.risksAndReviewItems.map((item) => [evidenceKey(item), item]),
  );
  const changes: TrustDeltaChange[] = [];

  for (const [key, item] of currentRisks) {
    if (previousRisks.has(key)) continue;
    changes.push(change({
      code: code(["new_risk", key]),
      kind: "new_risk",
      severity: severityForEvidence(item),
      category: categoryForEvidence(item),
      title: item.title,
      summary: item.detail,
      before: null,
      after: item.detail,
    }));
  }

  for (const [key, item] of previousRisks) {
    if (currentRisks.has(key)) continue;
    changes.push(change({
      code: code(["resolved_risk", key]),
      kind: "improved",
      severity: severityForEvidence(item),
      category: categoryForEvidence(item),
      title: `${item.title} resolved`,
      summary: `${item.title} is no longer present in the current evidence snapshot.`,
      before: item.detail,
      after: null,
    }));
  }

  return changes;
}

function pushChanged(
  changes: TrustDeltaChange[],
  input: {
    code: string;
    category: TrustDeltaChange["category"];
    title: string;
    before: unknown;
    after: unknown;
    kind?: TrustDeltaKind;
    severity?: TrustDeltaSeverity;
    improvedWhen?: (before: unknown, after: unknown) => boolean;
    riskWhen?: (before: unknown, after: unknown) => boolean;
  },
) {
  if (JSON.stringify(input.before) === JSON.stringify(input.after)) return;
  const improved = input.improvedWhen?.(input.before, input.after) ?? false;
  const newRisk =
    !improved && (input.riskWhen?.(input.before, input.after) ?? false);
  changes.push(change({
    code: input.code,
    kind: improved ? "improved" : newRisk ? "new_risk" : (input.kind ?? "changed"),
    severity: input.severity ?? "info",
    category: input.category,
    title: input.title,
    summary: `${input.title}: ${display(input.before)} → ${display(input.after)}.`,
    before:
      typeof input.before === "string" ||
      typeof input.before === "number" ||
      typeof input.before === "boolean" ||
      input.before === null
        ? input.before
        : display(input.before),
    after:
      typeof input.after === "string" ||
      typeof input.after === "number" ||
      typeof input.after === "boolean" ||
      input.after === null
        ? input.after
        : display(input.after),
  }));
}

function structuredChanges(
  previous: AgentTrustReport,
  current: AgentTrustReport,
): TrustDeltaChange[] {
  const changes: TrustDeltaChange[] = [];
  const previousGitHub = previous.codeIntelligence.snapshot;
  const currentGitHub = current.codeIntelligence.snapshot;

  if (previousGitHub && currentGitHub) {
    pushChanged(changes, {
      code: "github_commits_90d",
      category: "code",
      title: "90-day commits",
      before: previousGitHub.activity.commitCount90d,
      after: currentGitHub.activity.commitCount90d,
      kind: "activity",
    });
    pushChanged(changes, {
      code: "github_contributors",
      category: "code",
      title: "Sampled contributors",
      before: previousGitHub.contributors.sampledHumanContributorCount,
      after: currentGitHub.contributors.sampledHumanContributorCount,
      kind: "activity",
    });
    pushChanged(changes, {
      code: "github_security_policy",
      category: "code",
      title: "Security policy",
      before: previousGitHub.documentation.hasSecurityPolicy,
      after: currentGitHub.documentation.hasSecurityPolicy,
      severity: currentGitHub.documentation.hasSecurityPolicy ? "low" : "medium",
      improvedWhen: (_before, after) => after === true,
      riskWhen: (_before, after) => after === false,
    });
    pushChanged(changes, {
      code: "github_license",
      category: "code",
      title: "Repository license",
      before: previousGitHub.documentation.hasLicense,
      after: currentGitHub.documentation.hasLicense,
      severity: currentGitHub.documentation.hasLicense ? "low" : "medium",
      improvedWhen: (_before, after) => after === true,
      riskWhen: (_before, after) => after === false,
    });
    pushChanged(changes, {
      code: "github_ci_workflows",
      category: "code",
      title: "CI workflow count",
      before: previousGitHub.stack.workflowCount,
      after: currentGitHub.stack.workflowCount,
      improvedWhen: (before, after) => Number(after) > Number(before),
    });
    pushChanged(changes, {
      code: "github_latest_release",
      category: "code",
      title: "Latest tagged release",
      before: previousGitHub.releases.latestRelease?.tagName ?? null,
      after: currentGitHub.releases.latestRelease?.tagName ?? null,
      improvedWhen: (_before, after) => Boolean(after),
    });
    pushChanged(changes, {
      code: "github_archived",
      category: "code",
      title: "Repository archived status",
      before: previousGitHub.repository.isArchived,
      after: currentGitHub.repository.isArchived,
      severity: currentGitHub.repository.isArchived ? "critical" : "medium",
      improvedWhen: (_before, after) => after === false,
      riskWhen: (_before, after) => after === true,
    });

    const beforeDependencies = new Set(
      previousGitHub.dependencyProfile?.productionDependencies ?? [],
    );
    const afterDependencies = new Set(
      currentGitHub.dependencyProfile?.productionDependencies ?? [],
    );
    const added = [...afterDependencies].filter((item) => !beforeDependencies.has(item));
    const removed = [...beforeDependencies].filter((item) => !afterDependencies.has(item));
    if (added.length || removed.length) {
      changes.push(change({
        code: "github_dependencies_changed",
        kind: "changed",
        severity: "medium",
        category: "code",
        title: "Production dependencies changed",
        summary: [
          added.length ? `Added: ${added.slice(0, 8).join(", ")}.` : null,
          removed.length ? `Removed: ${removed.slice(0, 8).join(", ")}.` : null,
        ].filter(Boolean).join(" "),
        before: beforeDependencies.size,
        after: afterDependencies.size,
      }));
    }
  }

  pushChanged(changes, {
    code: "agent_registry_status",
    category: "identity",
    title: "Agent status",
    before: previous.identity.agentStatus,
    after: current.identity.agentStatus,
    kind: "status_change",
    severity: ["suspended", "revoked"].includes(current.identity.agentStatus)
      ? "critical"
      : "medium",
    improvedWhen: (_before, after) => after === "active",
  });
  pushChanged(changes, {
    code: "agent_wallet_verified",
    category: "identity",
    title: "Agent wallet verification",
    before: previous.identity.ownerVerified,
    after: current.identity.ownerVerified,
    severity: "high",
    improvedWhen: (_before, after) => after === true,
    riskWhen: (_before, after) => after === false,
  });
  pushChanged(changes, {
    code: "execution_success_rate",
    category: "execution",
    title: "Workflow success rate",
    before: previous.executionReliability.successRate,
    after: current.executionReliability.successRate,
    kind: "activity",
    severity: "medium",
    improvedWhen: (before, after) => Number(after) > Number(before),
  });
  pushChanged(changes, {
    code: "execution_completed_runs",
    category: "execution",
    title: "Completed workflows",
    before: previous.executionReliability.completedRuns,
    after: current.executionReliability.completedRuns,
    kind: "activity",
    improvedWhen: (before, after) => Number(after) > Number(before),
  });
  pushChanged(changes, {
    code: "arc_verification_coverage",
    category: "verification",
    title: "Arc verification coverage",
    before: previous.executionReliability.verificationCoverage,
    after: current.executionReliability.verificationCoverage,
    severity: "medium",
    improvedWhen: (before, after) => Number(after) > Number(before),
  });
  pushChanged(changes, {
    code: "endpoint_reachable",
    category: "endpoint",
    title: "Service endpoint availability",
    before: previous.endpointAvailability.reachable,
    after: current.endpointAvailability.reachable,
    severity: current.endpointAvailability.reachable === false ? "high" : "low",
    improvedWhen: (_before, after) => after === true,
    riskWhen: (_before, after) => after === false,
  });
  pushChanged(changes, {
    code: "contract_bytecode",
    category: "contract",
    title: "Contract bytecode",
    before: previous.contractTransparency.hasBytecode,
    after: current.contractTransparency.hasBytecode,
    severity: "critical",
    improvedWhen: (_before, after) => after === true,
    riskWhen: (_before, after) => after === false,
  });
  pushChanged(changes, {
    code: "contract_implementation",
    category: "contract",
    title: "Contract implementation",
    before: previous.contractTransparency.implementationAddress,
    after: current.contractTransparency.implementationAddress,
    severity: "high",
  });

  const previousServices = new Map(
    previous.services.services.map((service) => [service.publicId, service]),
  );
  const currentServices = new Map(
    current.services.services.map((service) => [service.publicId, service]),
  );
  for (const [id, service] of currentServices) {
    const before = previousServices.get(id);
    if (!before) {
      changes.push(change({
        code: code(["service_added", id]),
        kind: "improved",
        severity: "info",
        category: "services",
        title: `${service.name} published`,
        summary: `A new seller service is visible at version ${service.version}.`,
        before: null,
        after: service.status,
      }));
      continue;
    }
    pushChanged(changes, {
      code: code(["service_status", id]),
      category: "services",
      title: `${service.name} status`,
      before: before.status,
      after: service.status,
      kind: "status_change",
      severity: ["active", "live"].includes(service.status) ? "low" : "high",
      improvedWhen: (_before, after) => ["active", "live"].includes(String(after)),
    });
    pushChanged(changes, {
      code: code(["service_availability", id]),
      category: "services",
      title: `${service.name} availability`,
      before: before.availabilityStatus,
      after: service.availabilityStatus,
      severity: service.availabilityStatus === "unavailable" ? "high" : "medium",
      improvedWhen: (_before, after) => after === "healthy",
      riskWhen: (_before, after) => after === "unavailable",
    });
    pushChanged(changes, {
      code: code(["service_failure_rate", id]),
      category: "services",
      title: `${service.name} failure rate`,
      before: before.failureRate,
      after: service.failureRate,
      kind: "activity",
      severity: "medium",
      improvedWhen: (left, right) => Number(right) < Number(left),
    });
  }

  return changes;
}

const severityOrder: Record<TrustDeltaSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
const kindOrder: Record<TrustDeltaKind, number> = {
  new_risk: 0,
  status_change: 1,
  changed: 2,
  activity: 3,
  improved: 4,
};

export function buildTrustDeltaReport(input: {
  previous: AgentTrustReport | null;
  current: AgentTrustReport;
  previousSnapshotId: string | null;
  currentSnapshotId: string;
  generatedAt?: string;
}): TrustDeltaReport {
  const beforeScore = input.previous?.trustScore.overall ?? null;
  const afterScore = input.current.trustScore.overall;
  const scoreChange =
    beforeScore === null || afterScore === null ? null : afterScore - beforeScore;
  const changes = input.previous
    ? [
        ...evidenceChanges(input.previous, input.current),
        ...structuredChanges(input.previous, input.current),
      ]
    : [];

  const unique = new Map<string, TrustDeltaChange>();
  for (const item of changes) {
    const existing = unique.get(item.code);
    if (!existing || severityOrder[item.severity] < severityOrder[existing.severity]) {
      unique.set(item.code, item);
    }
  }
  const sorted = [...unique.values()].sort(
    (left, right) =>
      kindOrder[left.kind] - kindOrder[right.kind] ||
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.title.localeCompare(right.title),
  );

  return {
    kind: "trust_delta_report",
    version: 1,
    previousSnapshotId: input.previousSnapshotId,
    currentSnapshotId: input.currentSnapshotId,
    score: {
      before: beforeScore,
      after: afterScore,
      change: scoreChange,
      direction:
        scoreChange === null
          ? "unavailable"
          : scoreChange > 0
            ? "improved"
            : scoreChange < 0
              ? "declined"
              : "unchanged",
    },
    summary: {
      newRisks: sorted.filter((item) => item.kind === "new_risk").length,
      improvements: sorted.filter((item) => item.kind === "improved").length,
      statusChanges: sorted.filter((item) => item.kind === "status_change").length,
      activityChanges: sorted.filter((item) => item.kind === "activity").length,
      totalChanges: sorted.length,
    },
    changes: sorted,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
