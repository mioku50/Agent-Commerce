/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitHubRepositorySnapshot } from "@/lib/providers/github-types";

export type AssessmentStatus = "strong" | "moderate" | "weak" | "unknown";

export type DueDiligenceOverallStatus =
  | "healthy_signals"
  | "review_needed"
  | "high_attention"
  | "limited_data";

export type RiskSeverity = "high" | "medium" | "low" | "info";

export type GitHubDueDiligenceRiskCode =
  | "repository_archived"
  | "stale_development"
  | "low_recent_activity"
  | "missing_license"
  | "missing_readme"
  | "single_contributor_concentration"
  | "missing_security_policy"
  | "no_ci_detected"
  | "repository_is_fork"
  | "no_github_releases";

export interface GitHubDueDiligenceRisk {
  code: GitHubDueDiligenceRiskCode | string;
  title: string;
  severity: RiskSeverity;
  description: string;
  impact: string;
}

export interface GitHubCategoryAssessment {
  status: AssessmentStatus;
  summary: string;
  evidence: string[];
}

export interface GitHubDueDiligenceCategories {
  activity: GitHubCategoryAssessment;
  maintenance: GitHubCategoryAssessment;
  documentation: GitHubCategoryAssessment;
  releaseDiscipline: GitHubCategoryAssessment;
  contributorDistribution: GitHubCategoryAssessment;
  automation: GitHubCategoryAssessment;
}

export interface GitHubDueDiligenceAssessment {
  overallStatus: DueDiligenceOverallStatus;
  overallSummary: string;
  categories: GitHubDueDiligenceCategories;
  risks: GitHubDueDiligenceRisk[];
  strengths: string[];
  suggestedQuestions: string[];
  limitationsDisclaimer: string;
  analyzedAt: string;
}

export const LIMITATIONS_DISCLAIMER =
  "This is a repository health and activity report based on public GitHub metadata. It is NOT a security audit, code vulnerability scan, or investment recommendation. Always review source code independently before deploying to production.";

export function analyzeGitHubDueDiligence(
  snapshot: GitHubRepositorySnapshot,
): GitHubDueDiligenceAssessment {
  const refDate = snapshot.source?.fetchedAt
    ? new Date(snapshot.source.fetchedAt)
    : new Date();
  const refTime = isNaN(refDate.getTime()) ? Date.now() : refDate.getTime();

  // Helper for days calculation
  const getDaysAgo = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((refTime - d.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const lastCommitDays = getDaysAgo(snapshot.activity?.lastCommitAt);
  const lastPushDays = getDaysAgo(snapshot.repository?.pushedAt);
  const effectiveLastDays =
    lastCommitDays !== null && lastPushDays !== null
      ? Math.min(lastCommitDays, lastPushDays)
      : (lastCommitDays ?? lastPushDays);

  const isFallback = snapshot.source?.upstreamStatus === "fallback";

  // --- 1. Category Assessments ---

  // Development Activity
  let activityStatus: AssessmentStatus = "unknown";
  let activitySummary = "";
  const activityEvidence: string[] = [];

  if (isFallback) {
    activityStatus = "unknown";
    activitySummary = "Activity data is incomplete due to upstream fallback mode.";
    activityEvidence.push("GitHub API returned partial or fallback snapshot.");
  } else {
    const c30 = snapshot.activity?.commitCount30d ?? 0;
    const c90 = snapshot.activity?.commitCount90d ?? 0;
    const c180 = snapshot.activity?.commitCount180d ?? 0;
    const recentCount = snapshot.activity?.recentCommitCount ?? 0;

    activityEvidence.push(
      `Commits recorded: ${c30} in last 30 days, ${c90} in last 90 days, ${c180} in last 180 days.`,
    );
    if (snapshot.activity?.lastCommitAt) {
      activityEvidence.push(`Latest commit timestamp: ${snapshot.activity.lastCommitAt}.`);
    }

    if (c30 >= 10 || c90 >= 25) {
      activityStatus = "strong";
      activitySummary = `Frequent development activity with ${c30} commits in the past 30 days and ${c90} in 90 days.`;
    } else if (c90 >= 5 || c180 >= 10 || recentCount >= 3) {
      activityStatus = "moderate";
      activitySummary = `Moderate development activity with ${c90} commits in the past 90 days.`;
    } else {
      activityStatus = "weak";
      activitySummary = `Low development activity detected (${c180} commits in the past 180 days).`;
    }
  }

  // Maintenance
  let maintenanceStatus: AssessmentStatus = "unknown";
  let maintenanceSummary = "";
  const maintenanceEvidence: string[] = [];

  const isArchived = Boolean(snapshot.repository?.isArchived);
  maintenanceEvidence.push(`Repository archived status: ${isArchived ? "Yes (Archived)" : "No (Active)"}.`);
  if (snapshot.repository?.pushedAt) {
    maintenanceEvidence.push(`Last pushed at: ${snapshot.repository.pushedAt}.`);
  }
  maintenanceEvidence.push(`Open issues count: ${snapshot.repository?.openIssuesCount ?? 0}.`);

  if (isArchived) {
    maintenanceStatus = "weak";
    maintenanceSummary = "Repository is marked as archived and read-only by maintainers.";
  } else if (effectiveLastDays !== null) {
    if (effectiveLastDays <= 30) {
      maintenanceStatus = "strong";
      maintenanceSummary = `Pushed/committed recently (${effectiveLastDays} days ago). Active maintenance.`;
    } else if (effectiveLastDays <= 180) {
      maintenanceStatus = "moderate";
      maintenanceSummary = `Last update was ${effectiveLastDays} days ago. Periodic maintenance observed.`;
    } else {
      maintenanceStatus = "weak";
      maintenanceSummary = `No updates for ${effectiveLastDays} days. Repository maintenance appears inactive.`;
    }
  } else {
    maintenanceStatus = "unknown";
    maintenanceSummary = "Maintenance status cannot be determined from metadata.";
  }

  // Documentation
  let docStatus: AssessmentStatus = "unknown";
  let docSummary = "";
  const docEvidence: string[] = [];

  const hasReadme = Boolean(snapshot.documentation?.hasReadme);
  const hasLicense = Boolean(snapshot.documentation?.hasLicense);
  const hasSec = Boolean(snapshot.documentation?.hasSecurityPolicy);
  const hasContrib = Boolean(snapshot.documentation?.hasContributing);
  const hasCoc = Boolean(snapshot.documentation?.hasCodeOfConduct);

  docEvidence.push(`README.md: ${hasReadme ? "Present" : "Missing"}`);
  docEvidence.push(`LICENSE: ${hasLicense ? "Present (" + (snapshot.repository?.license?.name || "Detected") + ")" : "Missing"}`);
  docEvidence.push(`SECURITY.md: ${hasSec ? "Present" : "Missing"}`);
  docEvidence.push(`CONTRIBUTING.md: ${hasContrib ? "Present" : "Missing"}`);
  docEvidence.push(`CODE_OF_CONDUCT.md: ${hasCoc ? "Present" : "Missing"}`);

  if (hasReadme && hasLicense && (hasSec || hasContrib)) {
    docStatus = "strong";
    docSummary = "Comprehensive documentation including README, License, and governance policies.";
  } else if (hasReadme && hasLicense) {
    docStatus = "moderate";
    docSummary = "Core documentation present (README and License), but missing governance policies.";
  } else if (hasReadme) {
    docStatus = "weak";
    docSummary = "README present, but open-source License is missing.";
  } else {
    docStatus = "weak";
    docSummary = "Key documentation files (README, License) are missing.";
  }

  // Release Discipline
  let releaseStatus: AssessmentStatus = "unknown";
  let releaseSummary = "";
  const releaseEvidence: string[] = [];

  const relTotal = snapshot.releases?.totalCount ?? 0;
  const rel90d = snapshot.releases?.releaseCount90d ?? 0;
  const latestRel = snapshot.releases?.latestRelease;

  releaseEvidence.push(`Total tagged GitHub releases: ${relTotal}.`);
  if (latestRel) {
    releaseEvidence.push(`Latest release tag: ${latestRel.tagName}${latestRel.publishedAt ? " (published " + latestRel.publishedAt + ")" : ""}.`);
  }
  releaseEvidence.push(`Releases in last 90 days: ${rel90d}.`);

  if (rel90d >= 1 || (relTotal >= 5 && latestRel?.publishedAt && (getDaysAgo(latestRel.publishedAt) ?? 999) <= 180)) {
    releaseStatus = "strong";
    releaseSummary = `Regular release cadence with ${relTotal} total releases, latest tag ${latestRel?.tagName || ""}.`;
  } else if (relTotal >= 1) {
    releaseStatus = "moderate";
    releaseSummary = `Tagged releases exist (${relTotal} total), but no recent releases in past 90 days.`;
  } else {
    releaseStatus = "weak";
    releaseSummary = "No tagged GitHub releases found. Codebase relies on default branch or raw tags.";
  }

  // Contributor Distribution
  let contribStatus: AssessmentStatus = "unknown";
  let contribSummary = "";
  const contribEvidence: string[] = [];

  const totalContribs = snapshot.contributors?.totalCount ?? 0;
  const topPct = snapshot.contributors?.topContributorContributionPercentage ?? 0;
  const topLogins = (snapshot.contributors?.topContributors ?? [])
    .slice(0, 3)
    .map((c) => `${c.login} (${c.contributions} commits)`)
    .join(", ");

  contribEvidence.push(`Total detected contributors: ${totalContribs}.`);
  contribEvidence.push(`Top contributor concentration: ${topPct}%.`);
  if (topLogins) {
    contribEvidence.push(`Top contributors: ${topLogins}.`);
  }

  if (totalContribs >= 5 && topPct < 60) {
    contribStatus = "strong";
    contribSummary = `Well-distributed contributor base with ${totalContribs} contributors (top maintainer: ${topPct}%).`;
  } else if (totalContribs >= 2 && topPct < 85) {
    contribStatus = "moderate";
    contribSummary = `Multiple contributors (${totalContribs}), with primary maintainer accounting for ${topPct}% of commits.`;
  } else if (totalContribs === 1 || topPct >= 85) {
    contribStatus = "weak";
    contribSummary = `High maintainer concentration: single key contributor accounts for ${topPct}% of commits.`;
  } else {
    contribStatus = "unknown";
    contribSummary = "Contributor data unavailable or unlisted.";
  }

  // Automation
  let autoStatus: AssessmentStatus = "unknown";
  let autoSummary = "";
  const autoEvidence: string[] = [];

  const hasWorkflows = Boolean(snapshot.stack?.hasWorkflows);
  const wfCount = snapshot.stack?.workflowCount ?? 0;
  const wfNames = snapshot.stack?.workflowNames ?? [];

  autoEvidence.push(`GitHub Actions CI workflows detected: ${hasWorkflows ? "Yes" : "No"}.`);
  autoEvidence.push(`Workflow count: ${wfCount}.`);
  if (wfNames.length > 0) {
    autoEvidence.push(`Workflow files: ${wfNames.join(", ")}.`);
  }

  if (hasWorkflows && wfCount >= 2) {
    autoStatus = "strong";
    autoSummary = `Automated CI workflows active (${wfCount} GitHub Actions detected).`;
  } else if (hasWorkflows && wfCount >= 1) {
    autoStatus = "moderate";
    autoSummary = `Basic automation present (${wfNames[0] || "1 workflow"}).`;
  } else {
    autoStatus = "weak";
    autoSummary = "No GitHub Actions CI workflow files (.github/workflows) detected.";
  }

  const categories: GitHubDueDiligenceCategories = {
    activity: { status: activityStatus, summary: activitySummary, evidence: activityEvidence },
    maintenance: { status: maintenanceStatus, summary: maintenanceSummary, evidence: maintenanceEvidence },
    documentation: { status: docStatus, summary: docSummary, evidence: docEvidence },
    releaseDiscipline: { status: releaseStatus, summary: releaseSummary, evidence: releaseEvidence },
    contributorDistribution: { status: contribStatus, summary: contribSummary, evidence: contribEvidence },
    automation: { status: autoStatus, summary: autoSummary, evidence: autoEvidence },
  };

  // --- 2. Risk Evaluation ---

  const risks: GitHubDueDiligenceRisk[] = [];

  // R1: repository_archived (high)
  if (isArchived) {
    risks.push({
      code: "repository_archived",
      title: "Repository is Archived",
      severity: "high",
      description: "The repository has been marked as read-only by its maintainers.",
      impact: "No future bug fixes, security patches, or feature updates will be published.",
    });
  }

  // R2: stale_development (high)
  if (!isArchived && effectiveLastDays !== null && effectiveLastDays > 180) {
    risks.push({
      code: "stale_development",
      title: "Stale Development Activity",
      severity: "high",
      description: `No commits or code pushes recorded in the past ${effectiveLastDays} days.`,
      impact: "Active maintenance may have ceased, leaving reported issues or security flaws unaddressed.",
    });
  }

  // R3: low_recent_activity (medium)
  if (
    !isArchived &&
    (effectiveLastDays === null || effectiveLastDays <= 180) &&
    (snapshot.activity?.commitCount90d ?? 0) === 0 &&
    (snapshot.activity?.recentCommitCount ?? 0) < 5
  ) {
    risks.push({
      code: "low_recent_activity",
      title: "Low Recent Activity",
      severity: "medium",
      description: "No commits recorded in the past 90 days despite past repository history.",
      impact: "Development velocity has slowed down, which may delay updates or bug fixes.",
    });
  }

  // R4: missing_license (medium)
  if (!hasLicense) {
    risks.push({
      code: "missing_license",
      title: "Missing Open Source License",
      severity: "medium",
      description: "No explicit SPDX license file (LICENSE, LICENSE.md) was found in the repository.",
      impact: "Without an open-source license, default copyright laws apply, restricting legal reuse and redistribution.",
    });
  }

  // R5: missing_readme (medium)
  if (!hasReadme) {
    risks.push({
      code: "missing_readme",
      title: "Missing README File",
      severity: "medium",
      description: "No README documentation file was found in the repository root.",
      impact: "Lack of setup instructions, architectural overview, or operational guidance.",
    });
  }

  // R6: single_contributor_concentration (medium)
  if (totalContribs === 1 || topPct >= 85) {
    risks.push({
      code: "single_contributor_concentration",
      title: "Single Contributor Concentration",
      severity: "medium",
      description: `The majority of repository commits (${topPct}%) originate from a single contributor.`,
      impact: "High bus-factor risk if the primary maintainer steps away or becomes unavailable.",
    });
  }

  // R7: missing_security_policy (low)
  if (!hasSec) {
    risks.push({
      code: "missing_security_policy",
      title: "Missing Security Policy (SECURITY.md)",
      severity: "low",
      description: "No SECURITY.md policy file detailing vulnerability disclosure procedures was found.",
      impact: "Security researchers lack clear guidelines for reporting disclosures responsibly.",
    });
  }

  // R8: no_ci_detected (low)
  if (!hasWorkflows) {
    risks.push({
      code: "no_ci_detected",
      title: "No Automated Workflows / CI Detected",
      severity: "low",
      description: "No GitHub Actions workflow files (.github/workflows) were detected.",
      impact: "Automated unit tests, linting, and build validation may not be enforced on pull requests.",
    });
  }

  // R9: repository_is_fork (info)
  if (snapshot.repository?.isFork) {
    risks.push({
      code: "repository_is_fork",
      title: "Repository is a Fork",
      severity: "info",
      description: "This repository was forked from another upstream source.",
      impact: "Changes may diverge from upstream or depend on upstream maintainer sync.",
    });
  }

  // R10: no_github_releases (info)
  if (relTotal === 0) {
    risks.push({
      code: "no_github_releases",
      title: "No Tagged GitHub Releases",
      severity: "info",
      description: "No tagged GitHub releases were published in this repository.",
      impact: "Consumers must rely on git commit SHAs or branch tips rather than semantic release tags.",
    });
  }

  // --- 3. Overall Status Calculation ---

  let overallStatus: DueDiligenceOverallStatus = "healthy_signals";
  let overallSummary = "";

  if (isFallback) {
    overallStatus = "limited_data";
    overallSummary =
      "Limited repository metadata could be retrieved from GitHub REST API v3; exercise caution.";
  } else if (risks.some((r) => r.severity === "high")) {
    overallStatus = "high_attention";
    overallSummary =
      "Significant risk factors detected (e.g. archived status or prolonged inactivity) requiring careful review before integration.";
  } else if (
    risks.some((r) => r.severity === "medium") ||
    risks.filter((r) => r.severity === "low").length >= 3
  ) {
    overallStatus = "review_needed";
    overallSummary =
      "The repository shows active elements but contains notable risk factors requiring review before integration.";
  } else {
    overallStatus = "healthy_signals";
    overallSummary =
      "The repository demonstrates strong activity, release discipline, and active maintenance with minimal risk factors.";
  }

  // --- 4. Evidence-backed Strengths List ---

  const strengths: string[] = [];

  if ((snapshot.activity?.commitCount30d ?? 0) >= 10) {
    strengths.push(
      `High development activity with ${snapshot.activity.commitCount30d} commits recorded in the past 30 days.`,
    );
  } else if ((snapshot.activity?.commitCount90d ?? 0) >= 15) {
    strengths.push(
      `Consistent commit cadence with ${snapshot.activity.commitCount90d} commits in the past 90 days.`,
    );
  }

  if (hasLicense && snapshot.repository?.license?.name) {
    strengths.push(
      `Clear open-source licensing: ${snapshot.repository.license.name} (${snapshot.repository.license.spdxId || "SPDX"}).`,
    );
  }

  if (relTotal >= 1 && latestRel?.tagName) {
    strengths.push(
      `Tagged release management with latest version ${latestRel.tagName}${latestRel.publishedAt ? " published " + latestRel.publishedAt : ""}.`,
    );
  }

  if (totalContribs >= 5 && topPct < 60) {
    strengths.push(
      `Healthy contributor community with ${totalContribs} distinct contributors.`,
    );
  }

  if (hasWorkflows && wfCount > 0) {
    strengths.push(
      `Automated CI pipelines configured with ${wfCount} GitHub Actions workflow file(s).`,
    );
  }

  if (hasReadme && hasSec && hasContrib) {
    strengths.push(
      "Comprehensive governance files present (README, SECURITY policy, and CONTRIBUTING guidelines).",
    );
  } else if (hasReadme) {
    strengths.push("Public README documentation present in repository root.");
  }

  if (snapshot.repository?.starsCount && snapshot.repository.starsCount >= 50) {
    strengths.push(
      `Recognized community adoption with ${snapshot.repository.starsCount} stargazers and ${snapshot.repository.forksCount} forks.`,
    );
  }

  // --- 5. Suggested Questions Before Relying on Project ---

  const suggestedQuestions: string[] = [];

  if (totalContribs === 1 || topPct >= 85) {
    suggestedQuestions.push(
      "What is the maintainer team size and policy for maintainer handoff or co-maintenance?",
    );
  }

  if (relTotal === 0) {
    suggestedQuestions.push(
      "Are production builds tagged with semantic version releases, or should consumers pin specific commit SHAs?",
    );
  }

  if (!hasWorkflows) {
    suggestedQuestions.push(
      "How are unit tests, linting, and security static analysis performed before merging pull requests?",
    );
  }

  if (!hasSec) {
    suggestedQuestions.push(
      "What is the private reporting process and contacts for responsible security disclosures?",
    );
  }

  if (!hasLicense) {
    suggestedQuestions.push(
      "Under what legal license terms can this repository be modified and redistributed?",
    );
  }

  if (effectiveLastDays !== null && effectiveLastDays > 90) {
    suggestedQuestions.push(
      "Is this repository actively maintained, or has development moved to another repository or branch?",
    );
  }

  suggestedQuestions.push(
    "What is the project roadmap and breaking change policy for future releases?",
  );

  return {
    overallStatus,
    overallSummary,
    categories,
    risks,
    strengths,
    suggestedQuestions,
    limitationsDisclaimer: LIMITATIONS_DISCLAIMER,
    analyzedAt: snapshot.source?.fetchedAt || new Date().toISOString(),
  };
}
