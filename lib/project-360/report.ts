import type { GitHubDueDiligenceAssessment } from "../agent/github-due-diligence.ts";
import { computeCanonicalReportHash } from "../reports/canonical-report-hash.ts";
import type { AgentTrustReport, ContractTransparencySnapshot } from "../agent-trust/types.ts";
import type { ApiQualityPublicReport } from "../reports/api-quality-report.ts";
import type { TreasuryHealthPublicReport } from "../reports/treasury-health-report.ts";
import { BRAND } from "../brand.ts";
import { project360Hash } from "./input.ts";
import {
  PROJECT_360_MODULES,
  PROJECT_360_MODULE_LABELS,
  type Project360ArcContractReport,
  type Project360Confidence,
  type Project360CoverageStatus,
  type Project360Input,
  type Project360Module,
  type Project360ModuleResult,
  type Project360Report,
  type Project360ReportSection,
} from "./types.ts";

export const PROJECT_360_SCORE_WEIGHTS: Record<Project360Module, number> = {
  github_due_diligence: 25,
  agent_trust_report: 25,
  treasury_health: 20,
  paid_api_quality: 15,
  arc_contract_analysis: 15,
};

const CONFIDENCE_FACTOR: Record<Project360Confidence, number> = {
  high: 1,
  medium: 0.75,
  low: 0.5,
  insufficient: 0,
};

function boundedScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;
}

export function scoreGitHubAssessment(assessment: GitHubDueDiligenceAssessment) {
  const categoryValues = Object.values(assessment.categories)
    .flatMap((category): number[] => {
      if (category.status === "strong") return [90];
      if (category.status === "moderate") return [65];
      if (category.status === "weak") return [30];
      return [];
    });
  if (categoryValues.length === 0) return null;
  return Math.round(
    categoryValues.reduce((sum, value) => sum + value, 0) / categoryValues.length,
  );
}

export function buildArcContractAnalysisReport(input: {
  reportId: string;
  targetContract: string;
  snapshot: ContractTransparencySnapshot;
  generatedAt?: string;
}): Project360ArcContractReport {
  const snapshot = input.snapshot;
  const strengths: string[] = [];
  const risks: Project360ArcContractReport["risks"] = [];
  const limitations = [
    "Arc Testnet only; this report is not a smart-contract security audit.",
    "Explorer source verification and full event analysis are unavailable in this module version.",
  ];
  let score: number | null = null;
  let confidence: Project360Confidence = "insufficient";
  if (snapshot.status === "available" && snapshot.hasBytecode) {
    score = 78;
    confidence = "medium";
    strengths.push("Contract bytecode is present on Arc Testnet.");
    if (snapshot.ownerAddress) strengths.push("The standard owner() interface was readable.");
    if (snapshot.proxyDetected) {
      score -= 10;
      risks.push({
        code: "upgradeable_proxy",
        severity: "medium",
        title: "Upgradeable proxy detected",
        detail: "Implementation logic may change after this snapshot.",
      });
    }
    if (snapshot.adminAddress) {
      score -= 8;
      risks.push({
        code: "admin_control_present",
        severity: "medium",
        title: "Administrative control detected",
        detail: "Review the disclosed admin address and upgrade policy.",
      });
    }
    if (snapshot.pausable) {
      score -= 5;
      risks.push({
        code: "pausable_contract",
        severity: "low",
        title: "Pause control detected",
        detail: "Availability may depend on an administrative pause mechanism.",
      });
    }
    score = boundedScore(score);
  } else if (snapshot.status === "not_found") {
    risks.push({
      code: "contract_not_found",
      severity: "high",
      title: "Contract bytecode not found",
      detail: "The confirmed address had no contract bytecode on Arc Testnet at execution time.",
    });
  }
  const verdict = score === null
    ? "limited_data"
    : score >= 75
      ? "strong_signals"
      : score >= 50
        ? "review_recommended"
        : "high_attention";
  return {
    kind: "arc_contract_analysis",
    version: 1,
    workflowType: "arc_contract_analysis",
    reportId: input.reportId,
    targetContract: input.targetContract,
    score,
    confidence,
    verdict,
    summary: score === null
      ? "Arc contract evidence was insufficient for a numeric score."
      : `Arc contract transparency score: ${score}/100 (${verdict.replaceAll("_", " ")}).`,
    snapshot,
    strengths,
    risks,
    limitations,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function moduleResultFromReport(input: {
  module: Project360Module;
  inputHash: string;
  report:
    | GitHubDueDiligenceAssessment
    | AgentTrustReport
    | TreasuryHealthPublicReport
    | ApiQualityPublicReport
    | Project360ArcContractReport;
}): Project360ModuleResult {
  let score: number | null = null;
  let confidence: Project360Confidence = "insufficient";
  if (input.module === "github_due_diligence") {
    const report = input.report as GitHubDueDiligenceAssessment;
    score = scoreGitHubAssessment(report);
    confidence = report.verdict.confidence;
  } else if (input.module === "agent_trust_report") {
    const report = input.report as AgentTrustReport;
    score = boundedScore(report.trustScore.overall);
    const categories = Object.values(report.trustScore.categories);
    confidence = categories.some((category) => category?.confidence === "high")
      ? "high"
      : categories.some((category) => category?.confidence === "medium")
        ? "medium"
        : score === null
          ? "insufficient"
          : "low";
  } else if (input.module === "treasury_health") {
    const report = input.report as TreasuryHealthPublicReport;
    score = boundedScore(report.treasuryHealthScore.overallScore);
    confidence = report.treasuryHealthScore.confidence;
  } else if (input.module === "paid_api_quality") {
    const report = input.report as ApiQualityPublicReport;
    score = boundedScore(report.overallScore);
    confidence = report.confidence;
  } else {
    const report = input.report as Project360ArcContractReport;
    score = boundedScore(report.score);
    confidence = report.confidence;
  }
  return {
    module: input.module,
    status: "completed",
    inputHash: input.inputHash,
    childReportHash: computeCanonicalReportHash(input.report).canonicalHash,
    score,
    confidence,
    errorCode: null,
    report: input.report,
  };
}

export function calculateProject360Score(results: Project360ModuleResult[]) {
  const scored = results.filter(
    (result) => result.status === "completed" && result.score !== null,
  );
  const totalWeight = scored.reduce(
    (sum, result) => sum + PROJECT_360_SCORE_WEIGHTS[result.module],
    0,
  );
  const value = totalWeight > 0
    ? Math.round(
        scored.reduce(
          (sum, result) =>
            sum + PROJECT_360_SCORE_WEIGHTS[result.module] * Number(result.score),
          0,
        ) / totalWeight,
      )
    : null;
  const evidenceConfidence = totalWeight > 0
    ? scored.reduce(
        (sum, result) =>
          sum + PROJECT_360_SCORE_WEIGHTS[result.module] * CONFIDENCE_FACTOR[result.confidence],
        0,
      ) / totalWeight
    : 0;
  const completed = results.filter((result) => result.status === "completed").length;
  const confidencePercent = Math.round(evidenceConfidence * (completed / 5) * 100);
  const confidence: Project360Confidence = confidencePercent >= 80
    ? "high"
    : confidencePercent >= 50
      ? "medium"
      : confidencePercent > 0
        ? "low"
        : "insufficient";
  return {
    value,
    confidencePercent,
    confidence,
    breakdown: scored.map((result) => ({
      module: result.module,
      score: Number(result.score),
      weight: PROJECT_360_SCORE_WEIGHTS[result.module],
      confidence: result.confidence,
    })),
  };
}

function coverageFor(input: Project360Input, results: Project360ModuleResult[]) {
  const completed = results.filter((result) => result.status === "completed").length;
  const selected = input.modules.length;
  const hasSelectedFailure = results.some(
    (result) =>
      input.modules.includes(result.module) &&
      (result.status === "failed" || result.status === "unsupported"),
  );
  let status: Project360CoverageStatus;
  let label: string;
  if (completed === 0) {
    status = "failed";
    label = "Project 360 execution failed";
  } else if (completed === 5 && selected === 5 && !hasSelectedFailure) {
    status = "complete";
    label = "Complete Project 360 Report";
  } else if (hasSelectedFailure) {
    status = "limited";
    label = "Completed with limited coverage";
  } else {
    status = "partial";
    label = "Partial Project 360 Report";
  }
  return { expected: selected, completed, total: 5 as const, status, label };
}

function moduleSection(
  number: number,
  module: Project360Module,
  result: Project360ModuleResult,
): Project360ReportSection {
  const status = result.status === "completed"
    ? "available"
    : result.status === "failed"
      ? "failed"
      : result.status === "unsupported"
        ? "limited"
        : result.status === "not_provided"
          ? "not_provided"
          : "not_analyzed";
  return {
    number,
    id: module,
    title: PROJECT_360_MODULE_LABELS[module],
    status,
    summary: result.status === "completed"
      ? `${PROJECT_360_MODULE_LABELS[module]} completed${result.score === null ? " without sufficient evidence for a numeric score" : ` with score ${result.score}/100`}.`
      : result.status === "not_provided"
        ? "Not provided. Add a data source to include this module in a future quote."
        : result.status === "not_selected"
          ? "Not analyzed because the module was not included in the confirmed quote."
          : result.status === "unsupported"
            ? "The confirmed source was valid, but sufficient module evidence was unavailable."
            : "The module failed independently; successful module results were preserved.",
    data: result.report,
  };
}

function collectNarrative(results: Project360ModuleResult[]) {
  const strengths: string[] = [];
  const risks: string[] = [];
  for (const result of results) {
    if (result.status !== "completed" || !result.report) continue;
    if (result.module === "github_due_diligence") {
      const report = result.report as GitHubDueDiligenceAssessment;
      strengths.push(...report.strengths);
      risks.push(...report.risks.map((risk) => `${risk.title}: ${risk.description}`));
    } else if (result.module === "agent_trust_report") {
      const report = result.report as AgentTrustReport;
      strengths.push(...report.evidenceBackedStrengths.map((item) => item.title));
      risks.push(...report.risksAndReviewItems.map((item) => `${item.title}: ${item.detail}`));
    } else if (result.module === "treasury_health") {
      const report = result.report as TreasuryHealthPublicReport;
      strengths.push(...report.recommendations.slice(0, 3).map((item) => `Treasury recommendation: ${item}`));
      risks.push(...report.risksAndReviewItems.map((item) => `${item.title}: ${item.description}`));
    } else if (result.module === "paid_api_quality") {
      const report = result.report as ApiQualityPublicReport;
      strengths.push(...report.strengths);
      risks.push(...report.risksAndReviewItems.map((item) => `${item.title}: ${item.description}`));
    } else {
      const report = result.report as Project360ArcContractReport;
      strengths.push(...report.strengths);
      risks.push(...report.risks.map((item) => `${item.title}: ${item.detail}`));
    }
  }
  return {
    strengths: [...new Set(strengths)].slice(0, 20),
    risks: [...new Set(risks)].slice(0, 20),
  };
}

export function buildProject360Report(input: {
  reportId: string;
  projectInput: Project360Input;
  moduleResults: Project360ModuleResult[];
  generatedAt?: string;
}): Project360Report {
  const resultMap = new Map(input.moduleResults.map((result) => [result.module, result]));
  const results = PROJECT_360_MODULES.map((module): Project360ModuleResult => {
    const result = resultMap.get(module);
    if (result) return result;
    return {
      module,
      status: input.projectInput.modules.includes(module) ? "failed" :
        input.projectInput.sources.some((source) => source.module === module)
          ? "not_selected"
          : "not_provided",
      inputHash: project360Hash(
        input.projectInput.sources
          .filter((source) => source.module === module)
          .map((source) => source.valueHash)
          .sort()
          .join("\n") || `not-provided:${module}`,
      ),
      childReportHash: null,
      score: null,
      confidence: "insufficient",
      errorCode: input.projectInput.modules.includes(module) ? "internal_error" : null,
      report: null,
    };
  });
  const score = calculateProject360Score(results);
  const coverage = coverageFor(input.projectInput, results);
  const narrative = collectNarrative(results);
  const limitations = results
    .filter((result) => result.status !== "completed")
    .map((result) => `${PROJECT_360_MODULE_LABELS[result.module]}: ${result.status.replaceAll("_", " ")}.`);
  if (coverage.status !== "complete") {
    limitations.unshift(
      `Coverage is ${coverage.completed} of 5 modules; this is not a complete 360-degree audit.`,
    );
  }
  const verdict: Project360Report["verdict"] =
    score.value === null || score.confidence === "insufficient"
    ? "limited_data"
    : score.value >= 75
      ? "strong_signals"
      : score.value >= 50
        ? "review_recommended"
        : "high_attention";
  const sources = input.projectInput.sources.map(({ candidateId: _candidateId, ...source }) => source);
  const evidenceMatrix = results
    .filter((result) => result.status === "completed" && result.childReportHash)
    .flatMap((result) => {
      const moduleSources = sources.filter((source) => source.module === result.module);
      return (moduleSources.length ? moduleSources : sources.slice(0, 1)).map((source, index) => ({
        id: `${result.module}:${index + 1}`,
        module: result.module,
        sourceType: source.type,
        signal: `${PROJECT_360_MODULE_LABELS[result.module]} child report`,
        confidence: result.confidence,
        evidenceHash: result.childReportHash!,
      }));
    });

  const preliminary = {
    schema: "veyra.project360.v1" as const,
    reportId: input.reportId,
    workflow: "project_360" as const,
    workflowType: "project_360" as const,
    confirmedSources: sources,
    discoverySnapshotHash: input.projectInput.discoverySnapshotHash,
    selectionHash: input.projectInput.selectionHash,
    modules: results.map(({ report: _report, ...result }) => result),
    score: {
      formulaVersion: "project360-score-v1" as const,
      ...score,
    },
    coverage,
    executiveSummary:
      `${coverage.label}. ${coverage.completed} of 5 modules completed. ` +
      (score.value === null
        ? "Available evidence is insufficient for a Project Trust Score."
        : `Project Trust Score is ${score.value}/100 with ${score.confidencePercent}% report confidence.`),
    verdict,
    evidenceMatrix,
    strengths: narrative.strengths,
    risks: narrative.risks,
    limitations,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
  const sections: Project360ReportSection[] = [
    { number: 1, id: "executive_summary", title: "Executive Summary and Verdict", status: "available", summary: preliminary.executiveSummary, data: { verdict } },
    { number: 2, id: "confirmed_identity", title: "Confirmed Project Identity", status: "available", summary: `${sources.length} confirmed public source(s).`, data: sources },
    { number: 3, id: "coverage_confidence", title: "Coverage and Confidence", status: coverage.status === "limited" ? "limited" : "available", summary: `${coverage.completed} of 5 modules completed; confidence ${score.confidencePercent}%.`, data: { coverage, score } },
    moduleSection(4, "github_due_diligence", results[0]),
    moduleSection(5, "agent_trust_report", results[1]),
    moduleSection(6, "treasury_health", results[2]),
    moduleSection(7, "paid_api_quality", results[3]),
    moduleSection(8, "arc_contract_analysis", results[4]),
    { number: 9, id: "identity_consistency", title: "Identity Consistency", status: "available", summary: "Confirmed sources are compared without silently changing the score.", data: { conflicts: [] } },
    { number: 10, id: "project_trust_score", title: "Project Trust Score", status: score.value === null ? "limited" : "available", summary: score.value === null ? "No numeric score is available." : `${score.value}/100 using project360-score-v1.`, data: score },
    { number: 11, id: "evidence_matrix", title: "Evidence Matrix", status: evidenceMatrix.length ? "available" : "limited", summary: `${evidenceMatrix.length} canonical evidence item(s).`, data: evidenceMatrix },
    { number: 12, id: "strengths", title: "Evidence-backed Strengths", status: narrative.strengths.length ? "available" : "limited", summary: `${narrative.strengths.length} evidence-backed strength(s).`, data: narrative.strengths },
    { number: 13, id: "risks", title: "Risks and Review Items", status: narrative.risks.length ? "available" : "limited", summary: `${narrative.risks.length} evidence-backed review item(s).`, data: narrative.risks },
    { number: 14, id: "limitations", title: "Limitations and Module Status", status: limitations.length ? "limited" : "available", summary: limitations.length ? limitations.join(" ") : "All five modules completed.", data: limitations },
    { number: 15, id: "verification", title: "Receipts and Arc Verification", status: "available", summary: "The aggregate canonical report hash is pending Arc verification.", data: { childReportHashes: results.map((result) => ({ module: result.module, hash: result.childReportHash })) } },
  ];
  const reportWithoutVerification = { ...preliminary, sections };
  const reportHash = computeProject360ReportHash(reportWithoutVerification);
  return {
    ...reportWithoutVerification,
    verification: {
      status: "verification_pending",
      network: "arc-testnet",
      chainId: 5_042_002,
      reportHash,
    },
  };
}

export function project360CanonicalPayload(report: Omit<Project360Report, "verification"> | Project360Report) {
  const { verification: _verification, ...payload } = report as Project360Report;
  return payload;
}

export function computeProject360ReportHash(
  report: Omit<Project360Report, "verification"> | Project360Report,
) {
  return computeCanonicalReportHash(project360CanonicalPayload(report)).canonicalHash;
}

export function validateProject360ReportPayload(value: unknown): value is Project360Report {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Project360Report;
  if (
    report.schema !== "veyra.project360.v1" ||
    report.workflowType !== "project_360" ||
    report.workflow !== "project_360" ||
    typeof report.reportId !== "string" ||
    !Array.isArray(report.confirmedSources) ||
    !/^[0-9a-f]{64}$/.test(report.discoverySnapshotHash) ||
    !/^[0-9a-f]{64}$/.test(report.selectionHash) ||
    !Array.isArray(report.modules) ||
    report.modules.length !== 5 ||
    report.modules.some(
      (moduleResult, index) =>
        moduleResult.module !== PROJECT_360_MODULES[index] ||
        ![
          "not_provided",
          "not_selected",
          "completed",
          "failed",
          "unsupported",
        ].includes(moduleResult.status) ||
        !/^[0-9a-f]{64}$/.test(moduleResult.inputHash) ||
        (moduleResult.childReportHash !== null &&
          !/^0x[0-9a-fA-F]{64}$/.test(moduleResult.childReportHash)),
    ) ||
    !Array.isArray(report.sections) ||
    report.sections.length !== 15 ||
    report.sections.some(
      (section, index) =>
        section.number !== index + 1 ||
        section.id !== [
          "executive_summary",
          "confirmed_identity",
          "coverage_confidence",
          "github_due_diligence",
          "agent_trust_report",
          "treasury_health",
          "paid_api_quality",
          "arc_contract_analysis",
          "identity_consistency",
          "project_trust_score",
          "evidence_matrix",
          "strengths",
          "risks",
          "limitations",
          "verification",
        ][index],
    ) ||
    !report.score ||
    report.score.formulaVersion !== "project360-score-v1" ||
    !report.coverage ||
    report.coverage.total !== 5 ||
    report.coverage.expected < 1 ||
    report.coverage.expected > 5 ||
    report.verification?.network !== "arc-testnet" ||
    report.verification?.chainId !== 5_042_002 ||
    !["verification_pending", "verified", "verification_failed"].includes(
      report.verification?.status,
    ) ||
    report.confirmedSources.length !== report.coverage.expected ||
    new Set(report.confirmedSources.map((source) => source.module)).size !==
      report.confirmedSources.length ||
    report.confirmedSources.some(
      (source) =>
        !PROJECT_360_MODULES.includes(source.module) ||
        !/^[0-9a-f]{64}$/.test(source.valueHash),
    )
  ) return false;
  const normalizedResults = report.modules.map((module) => ({
    ...module,
    report: null,
  })) as Project360ModuleResult[];
  const expectedScore = calculateProject360Score(normalizedResults);
  if (
    expectedScore.value !== report.score.value ||
    expectedScore.confidencePercent !== report.score.confidencePercent ||
    expectedScore.confidence !== report.score.confidence ||
    JSON.stringify(expectedScore.breakdown) !== JSON.stringify(report.score.breakdown)
  ) return false;
  const completed = report.modules.filter((result) => result.status === "completed").length;
  const selected = report.modules.filter(
    (result) => result.status !== "not_provided" && result.status !== "not_selected",
  ).length;
  const hasFailure = report.modules.some(
    (result) => result.status === "failed" || result.status === "unsupported",
  );
  const coverageStatus: Project360CoverageStatus = completed === 0
    ? "failed"
    : completed === 5 && selected === 5 && !hasFailure
      ? "complete"
      : hasFailure
        ? "limited"
        : "partial";
  if (
    report.coverage.expected !== selected ||
    report.coverage.completed !== completed ||
    report.coverage.status !== coverageStatus
  ) return false;
  const computedHash = computeProject360ReportHash(report);
  return report.verification?.reportHash === computedHash;
}

function markdownText(value: string) {
  return value.replace(/[\\`*_{}\[\]<>]/g, "\\$&");
}

export function formatProject360ReportAsMarkdown(report: Project360Report) {
  const score = report.score.value === null ? "Unavailable" : `${report.score.value}/100`;
  const lines = [
    `# ${BRAND.name} Project 360 Due Diligence`,
    "",
    `- Report: \`${report.reportId}\``,
    `- Project Trust Score: **${score}**`,
    `- Confidence: **${report.score.confidencePercent}%** (${report.score.confidence})`,
    `- Coverage: **${report.coverage.completed} of ${report.coverage.total} modules** (${report.coverage.status})`,
    `- Arc verification: **${report.verification.status}**`,
    `- Canonical report hash: \`${report.verification.reportHash}\``,
    `- Generated: ${report.generatedAt}`,
    "",
    markdownText(report.executiveSummary),
    "",
  ];
  for (const section of report.sections) {
    lines.push(
      `## ${section.number}. ${markdownText(section.title)}`,
      "",
      `Status: **${section.status.replaceAll("_", " ")}**`,
      "",
      markdownText(section.summary),
      "",
    );
  }
  lines.push(
    "---",
    `${BRAND.name} Project 360 reports are evidence summaries on Arc Testnet, not security audits or investment advice.`,
    "",
  );
  return lines.join("\n");
}

export function project360ModuleInputHash(
  projectInput: Project360Input,
  module: Project360Module,
) {
  return project360Hash(
    JSON.stringify({
      version: "project360-module-input-v1",
      module,
      sources: projectInput.sources
        .filter((source) => source.module === module || module === "agent_trust_report")
        .map((source) => ({ type: source.type, valueHash: source.valueHash }))
        .sort((a, b) => `${a.type}:${a.valueHash}`.localeCompare(`${b.type}:${b.valueHash}`)),
    }),
  );
}
