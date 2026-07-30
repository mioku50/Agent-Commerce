import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTrustDeltaReport } from "../lib/monitoring/delta.ts";
import type { AgentTrustReport } from "../lib/agent-trust/types.ts";

function report(input: {
  id: string;
  score: number;
  commits: number;
  security: boolean;
  workflows: number;
  release: string | null;
  agentStatus: "active" | "suspended";
  endpoint: boolean;
  risks?: AgentTrustReport["risksAndReviewItems"];
}): AgentTrustReport {
  const generatedAt = input.id === "before"
    ? "2026-07-20T00:00:00.000Z"
    : "2026-07-30T00:00:00.000Z";
  return {
    kind: "agent_trust_report",
    version: 1,
    workflowType: "agent_trust_report",
    reportId: input.id,
    input: { repositoryUrl: "https://github.com/example/agent", agentId: "agt_0123456789abcdefghij" },
    subject: {
      name: "Example Agent",
      agentId: "agt_0123456789abcdefghij",
      wallet: null,
      repository: {
        owner: "example",
        name: "agent",
        fullName: "example/agent",
        canonicalUrl: "https://github.com/example/agent",
      },
    },
    trustScore: {
      overall: input.score,
      status: input.score >= 70 ? "review_recommended" : "high_attention",
      categories: {},
      excludedCategories: [],
    },
    executiveSummary: [],
    identity: {
      status: "found",
      publicAgentId: "agt_0123456789abcdefghij",
      displayName: "Example Agent",
      registeredWallet: null,
      ownerVerified: true,
      agentStatus: input.agentStatus,
      registeredAt: "2026-01-01T00:00:00.000Z",
      passportPresent: true,
      activeCredentialCount: 1,
      allowedWorkflows: ["agent_trust_report"],
      policy: null,
      identifierConflict: false,
      privateAggregatesAuthorized: false,
      checkedAt: generatedAt,
    },
    codeIntelligence: {
      status: "available",
      repository: {
        owner: "example",
        name: "agent",
        fullName: "example/agent",
        canonicalUrl: "https://github.com/example/agent",
      },
      snapshot: {
        version: 1,
        ref: {
          owner: "example",
          name: "agent",
          fullName: "example/agent",
          canonicalUrl: "https://github.com/example/agent",
        },
        repository: {
          id: 1,
          owner: "example",
          name: "agent",
          fullName: "example/agent",
          description: null,
          isPrivate: false,
          isFork: false,
          isArchived: false,
          defaultBranch: "main",
          starsCount: 1,
          forksCount: 0,
          openIssuesCount: 0,
          watchersCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: generatedAt,
          pushedAt: generatedAt,
          license: { key: "mit", name: "MIT", spdxId: "MIT", url: null },
          homepage: null,
          topics: [],
        },
        activity: {
          recentCommitCount: input.commits,
          commitAuthorCount: 4,
          lastCommitAt: generatedAt,
          commitCount30d: input.commits,
          commitCount90d: input.commits,
          commitCount180d: input.commits,
          commitCount30dIsLowerBound: false,
          commitCount90dIsLowerBound: false,
          commitCount180dIsLowerBound: false,
        },
        contributors: {
          sampledCount: 4,
          topContributors: [],
          sampledTopContributorShare: 50,
          sampledHumanContributorCount: 4,
          sampledBotContributorCount: 0,
          topHumanContributorShare: 50,
          botContributionShare: 0,
        },
        releases: {
          totalCount: input.release ? 1 : 0,
          latestRelease: input.release
            ? {
                name: input.release,
                tagName: input.release,
                publishedAt: generatedAt,
                isPrerelease: false,
                body: null,
              }
            : null,
          releaseCount90d: input.release ? 1 : 0,
        },
        collaboration: {
          openIssuesCount: 0,
          hasDiscussions: false,
        },
        documentation: {
          hasReadme: true,
          hasLicense: true,
          hasSecurityPolicy: input.security,
          hasContributing: true,
          hasCodeOfConduct: false,
          readmeSize: 100,
          securityPolicySize: input.security ? 100 : null,
          contributingSize: 100,
        },
        stack: {
          primaryLanguage: "TypeScript",
          languages: { TypeScript: 100 },
          detectedFrameworks: ["Next.js"],
          hasWorkflows: input.workflows > 0,
          workflowCount: input.workflows,
          workflowNames: input.workflows > 0 ? ["CI"] : [],
        },
        dependencyProfile: {
          manifests: ["package.json"],
          productionDependencies: ["next"],
          developmentDependencies: [],
          detectedCapabilities: [],
        },
        excerpts: {
          readmeExcerpt: null,
          securityExcerpt: null,
          contributingExcerpt: null,
        },
        source: {
          fetchedAt: generatedAt,
          cacheHit: false,
          provider: "GitHub REST API v3",
          upstreamStatus: "success",
        },
      },
      assessment: null,
      checkedAt: generatedAt,
    },
    executionReliability: {
      status: "available",
      completedRuns: 10,
      completedWithWarnings: 0,
      failedRuns: 1,
      successRate: 90,
      verifiedRuns: 9,
      verificationCoverage: 90,
      totalPaidUsdc: "0.01",
      averageWorkflowCostUsdc: "0.001",
      lastActivityAt: generatedAt,
      uniqueWorkflowsUsed: 2,
      sellerServicesUsed: 0,
      receiptsCount: 20,
      checkedAt: generatedAt,
    },
    paymentsAndReceipts: {
      status: "available",
      completedRuns: 10,
      completedWithWarnings: 0,
      failedRuns: 1,
      successRate: 90,
      verifiedRuns: 9,
      verificationCoverage: 90,
      totalPaidUsdc: "0.01",
      averageWorkflowCostUsdc: "0.001",
      lastActivityAt: generatedAt,
      uniqueWorkflowsUsed: 2,
      sellerServicesUsed: 0,
      receiptsCount: 20,
      checkedAt: generatedAt,
    },
    services: {
      status: "not_found",
      publishedServiceCount: 0,
      services: [],
      checkedAt: generatedAt,
    },
    contractTransparency: {
      status: "not_provided",
      network: "arc-testnet",
      chainId: 5_042_002,
      address: null,
      hasBytecode: null,
      bytecodeSize: null,
      proxyDetected: null,
      implementationAddress: null,
      adminAddress: null,
      ownerAddress: null,
      pausable: null,
      upgradeable: null,
      verificationStatus: "unavailable",
      recentEventsStatus: "unavailable",
      providerMessage: null,
      checkedAt: generatedAt,
    },
    endpointAvailability: {
      status: input.endpoint ? "available" : "unreachable",
      endpoint: "https://api.example.com/health",
      reachable: input.endpoint,
      httpStatusCategory: input.endpoint ? "2xx" : null,
      responseTimeMs: input.endpoint ? 120 : null,
      contentType: input.endpoint ? "application/json" : null,
      checkedAt: generatedAt,
      redirectCount: 0,
      errorCategory: input.endpoint ? null : "endpoint_unreachable",
    },
    evidenceBackedStrengths: [],
    risksAndReviewItems: input.risks ?? [],
    questionsBeforeIntegration: [],
    evidence: [],
    dataFreshness: [],
    unavailableSources: [],
    limitations: [],
    githubDueDiligenceReportUrl: null,
    verification: {
      status: "verified",
      verifiedOnArc: true,
      network: "arc-testnet",
      chainId: 5_042_002,
      reportHash: `0x${input.id.padEnd(64, "0")}`,
      proofs: [],
    },
    generatedAt,
  };
}

const before = report({
  id: "before",
  score: 74,
  commits: 294,
  security: true,
  workflows: 0,
  release: null,
  agentStatus: "active",
  endpoint: true,
});
const after = report({
  id: "after",
  score: 63,
  commits: 318,
  security: false,
  workflows: 1,
  release: "v1.2.0",
  agentStatus: "suspended",
  endpoint: false,
  risks: [{
    id: "ev_security",
    category: "code_health",
    signal: "review",
    title: "Security policy",
    detail: "Security policy was removed.",
    source: "GitHub Project Due Diligence",
    observedAt: "2026-07-30T00:00:00.000Z",
  }],
});

const delta = buildTrustDeltaReport({
  previous: before,
  current: after,
  previousSnapshotId: "tms_before00000000000000",
  currentSnapshotId: "tms_after000000000000000",
  generatedAt: after.generatedAt,
});

assert.deepEqual(delta.score, {
  before: 74,
  after: 63,
  change: -11,
  direction: "declined",
});
assert(delta.changes.some((item) => item.code === "github_commits_90d" && item.after === 318));
assert(delta.changes.some(
  (item) =>
    item.code === "github_security_policy" &&
    item.after === false &&
    item.kind === "new_risk",
));
assert(delta.changes.some((item) => item.code === "github_ci_workflows" && item.kind === "improved"));
assert(delta.changes.some((item) => item.code === "github_latest_release" && item.kind === "improved"));
assert(delta.changes.some((item) => item.code === "agent_registry_status" && item.severity === "critical"));
assert(delta.changes.some((item) => item.code === "endpoint_reachable" && item.severity === "high"));
assert(delta.summary.newRisks >= 1);

const baseline = buildTrustDeltaReport({
  previous: null,
  current: before,
  previousSnapshotId: null,
  currentSnapshotId: "tms_baseline000000000000",
});
assert.equal(baseline.changes.length, 0);
assert.equal(baseline.score.direction, "unavailable");

const migration = readFileSync(
  "supabase/migrations/20260730190000_p30_continuous_trust_monitoring.sql",
  "utf8",
);
assert(migration.includes("create table if not exists public.trust_watchlists"));
assert(migration.includes("create table if not exists public.trust_monitoring_snapshots"));
assert(migration.includes("enable row level security"));
assert(migration.includes("launch_trust_monitoring_checkout_v1"));
assert(migration.includes("v_recheck.trigger <> 'scheduled'"));
assert(migration.includes("to service_role"));

const monitoringService = readFileSync("lib/monitoring/service.ts", "utf8");
assert(monitoringService.includes("monitoringWatchlistId"));
assert(monitoringService.includes("agent-trust-finalizer"));
assert(monitoringService.includes("proof.responseHash?.toLowerCase()"));
assert(monitoringService.includes("MAX_WATCHLISTS_PER_OWNER = 10"));

const publicRoute = readFileSync(
  "app/api/monitoring/watchlists/[watchlistId]/rechecks/route.ts",
  "utf8",
);
assert(publicRoute.includes("requireOwnerSession"));
const machineRoute = readFileSync(
  "app/api/agent/v1/watchlists/[watchlistId]/rechecks/route.ts",
  "utf8",
);
assert(machineRoute.includes("requireMachineWatchlist"));
assert(machineRoute.includes("enforceQuoteSpendingPolicy"));
const cronRoute = readFileSync("app/api/internal/monitoring/recheck/route.ts", "utf8");
assert(cronRoute.includes("CRON_SECRET"));
assert(cronRoute.includes("claimAndLaunchScheduledTrustRecheck"));

console.log("Continuous trust monitoring tests passed.");
