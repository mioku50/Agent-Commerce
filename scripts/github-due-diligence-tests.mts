/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  analyzeGitHubDueDiligence,
  LIMITATIONS_DISCLAIMER,
  type GitHubDueDiligenceAssessment,
} from "../lib/agent/github-due-diligence.ts";
import type { GitHubRepositorySnapshot } from "../lib/providers/github-types.ts";

console.log("[github-due-diligence-test] Running GitHub due diligence engine tests...");

const createBaseSnapshot = (): GitHubRepositorySnapshot => ({
  version: 1,
  ref: {
    owner: "circlefin",
    name: "agent-commerce",
    fullName: "circlefin/agent-commerce",
    canonicalUrl: "https://github.com/circlefin/agent-commerce",
  },
  repository: {
    id: 12345678,
    owner: "circlefin",
    name: "agent-commerce",
    fullName: "circlefin/agent-commerce",
    description: "Hosted agent workflows and verification on Arc.",
    isPrivate: false,
    isFork: false,
    isArchived: false,
    defaultBranch: "main",
    starsCount: 150,
    forksCount: 25,
    openIssuesCount: 4,
    watchersCount: 150,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-07-23T12:00:00Z",
    pushedAt: "2026-07-23T12:00:00Z",
    license: {
      key: "apache-2.0",
      name: "Apache License 2.0",
      spdxId: "Apache-2.0",
      url: "https://spdx.org/licenses/Apache-2.0.html",
    },
    homepage: "https://agentcommerce.arc.io",
    topics: ["usdc", "arc-testnet", "x402", "agent-workflows"],
  },
  activity: {
    recentCommitCount: 25,
    commitAuthorCount: 6,
    lastCommitAt: "2026-07-23T12:00:00Z",
    commitCount30d: 15,
    commitCount90d: 35,
    commitCount180d: 50,
  },
  contributors: {
    totalCount: 8,
    topContributors: [
      { login: "alice", contributions: 20, avatarUrl: null },
      { login: "bob", contributions: 15, avatarUrl: null },
      { login: "charlie", contributions: 10, avatarUrl: null },
    ],
    topContributorContributionPercentage: 40,
  },
  releases: {
    totalCount: 6,
    latestRelease: {
      name: "v1.2.0",
      tagName: "v1.2.0",
      publishedAt: "2026-07-20T10:00:00Z",
      isPrerelease: false,
      body: "Feature release",
    },
    releaseCount90d: 2,
  },
  collaboration: {
    openIssuesCount: 4,
    hasDiscussions: true,
  },
  documentation: {
    hasReadme: true,
    hasLicense: true,
    hasSecurityPolicy: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    readmeSize: 10240,
    securityPolicySize: 2048,
    contributingSize: 3072,
  },
  stack: {
    primaryLanguage: "TypeScript",
    languages: { TypeScript: 80000, Shell: 5000 },
    detectedFrameworks: ["Next.js", "React"],
    hasWorkflows: true,
    workflowCount: 3,
    workflowNames: ["ci.yml", "release.yml", "lint.yml"],
  },
  excerpts: {
    readmeExcerpt: "# Agent-Commerce\nHosted agent workflows on Arc.",
    securityExcerpt: "# Security Policy\nReport vulnerabilities responsibly.",
    contributingExcerpt: "# Contributing\nGuidelines for pull requests.",
  },
  source: {
    fetchedAt: "2026-07-23T14:00:00.000Z",
    cacheHit: false,
    provider: "GitHub REST API v3",
    upstreamStatus: "success",
  },
});

// Test 1: Determinism check - identical input yields identical output
console.log("Test 1: Testing determinism of analyzeGitHubDueDiligence...");
const baseSnapshot1 = createBaseSnapshot();
const baseSnapshot2 = createBaseSnapshot();

const result1 = analyzeGitHubDueDiligence(baseSnapshot1);
const result2 = analyzeGitHubDueDiligence(baseSnapshot2);

assert.deepEqual(result1, result2, "Output must be 100% identical for identical input snapshots!");
assert.equal(result1.analyzedAt, baseSnapshot1.source.fetchedAt, "analyzedAt must match snapshot fetchedAt");
console.log("✔ Determinism test passed.");

// Test 2: Healthy snapshot evaluation
console.log("Test 2: Testing healthy snapshot assessment...");
assert.equal(result1.overallStatus, "healthy_signals");
assert.equal(result1.categories.activity.status, "strong");
assert.equal(result1.categories.maintenance.status, "strong");
assert.equal(result1.categories.documentation.status, "strong");
assert.equal(result1.categories.releaseDiscipline.status, "strong");
assert.equal(result1.categories.contributorDistribution.status, "strong");
assert.equal(result1.categories.automation.status, "strong");
assert.equal(result1.risks.filter((r) => r.severity === "high" || r.severity === "medium").length, 0);
assert(result1.strengths.length >= 3, "Healthy repo must have multiple evidence-backed strengths");
console.log("✔ Healthy snapshot test passed.");

// Test 3: Archived repository triggers high risk
console.log("Test 3: Testing archived repository risk rule...");
const archivedSnapshot = createBaseSnapshot();
archivedSnapshot.repository.isArchived = true;

const archivedResult = analyzeGitHubDueDiligence(archivedSnapshot);
assert.equal(archivedResult.overallStatus, "high_attention");
assert.equal(archivedResult.categories.maintenance.status, "weak");

const archivedRisk = archivedResult.risks.find((r) => r.code === "repository_archived");
assert(archivedRisk, "Archived repository must produce 'repository_archived' risk");
assert.equal(archivedRisk.severity, "high");
console.log("✔ Archived repository test passed.");

// Test 4: Stale development activity triggers high risk
console.log("Test 4: Testing stale development risk rule (>180 days)...");
const staleSnapshot = createBaseSnapshot();
staleSnapshot.activity.lastCommitAt = "2025-01-01T00:00:00.000Z";
staleSnapshot.repository.pushedAt = "2025-01-01T00:00:00.000Z";
staleSnapshot.activity.commitCount30d = 0;
staleSnapshot.activity.commitCount90d = 0;
staleSnapshot.activity.commitCount180d = 0;

const staleResult = analyzeGitHubDueDiligence(staleSnapshot);
assert.equal(staleResult.overallStatus, "high_attention");
assert.equal(staleResult.categories.maintenance.status, "weak");

const staleRisk = staleResult.risks.find((r) => r.code === "stale_development");
assert(staleRisk, "Stale repository must produce 'stale_development' risk");
assert.equal(staleRisk.severity, "high");
console.log("✔ Stale development test passed.");

// Test 5: Missing license triggers medium risk
console.log("Test 5: Testing missing license risk rule...");
const noLicenseSnapshot = createBaseSnapshot();
noLicenseSnapshot.documentation.hasLicense = false;
noLicenseSnapshot.repository.license = null;

const noLicenseResult = analyzeGitHubDueDiligence(noLicenseSnapshot);
assert.equal(noLicenseResult.overallStatus, "review_needed");

const licenseRisk = noLicenseResult.risks.find((r) => r.code === "missing_license");
assert(licenseRisk, "Missing license must produce 'missing_license' risk");
assert.equal(licenseRisk.severity, "medium");
assert(noLicenseResult.suggestedQuestions.some((q) => q.includes("license")), "Must suggest question about license");
console.log("✔ Missing license test passed.");

// Test 6: Missing README triggers medium risk
console.log("Test 6: Testing missing README risk rule...");
const noReadmeSnapshot = createBaseSnapshot();
noReadmeSnapshot.documentation.hasReadme = false;

const noReadmeResult = analyzeGitHubDueDiligence(noReadmeSnapshot);
const readmeRisk = noReadmeResult.risks.find((r) => r.code === "missing_readme");
assert(readmeRisk, "Missing README must produce 'missing_readme' risk");
assert.equal(readmeRisk.severity, "medium");
console.log("✔ Missing README test passed.");

// Test 7: Single contributor concentration triggers medium risk
console.log("Test 7: Testing single contributor concentration risk rule...");
const singleContribSnapshot = createBaseSnapshot();
singleContribSnapshot.contributors.totalCount = 1;
singleContribSnapshot.contributors.topContributorContributionPercentage = 100;
singleContribSnapshot.contributors.topContributors = [
  { login: "solo-dev", contributions: 50, avatarUrl: null },
];

const singleContribResult = analyzeGitHubDueDiligence(singleContribSnapshot);
assert.equal(singleContribResult.categories.contributorDistribution.status, "weak");
const contribRisk = singleContribResult.risks.find((r) => r.code === "single_contributor_concentration");
assert(contribRisk, "Single contributor must produce 'single_contributor_concentration' risk");
assert.equal(contribRisk.severity, "medium");
console.log("✔ Single contributor concentration test passed.");

// Test 8: Fallback upstream status yields limited_data overall status
console.log("Test 8: Testing fallback upstream status handling...");
const fallbackSnapshot = createBaseSnapshot();
fallbackSnapshot.source.upstreamStatus = "fallback";

const fallbackResult = analyzeGitHubDueDiligence(fallbackSnapshot);
assert.equal(fallbackResult.overallStatus, "limited_data");
assert.equal(fallbackResult.categories.activity.status, "unknown");
console.log("✔ Fallback status test passed.");

// Test 9: Safety constraints check
console.log("Test 9: Verifying safety constraints (no trust score, no investment claims, disclaimer)...");
assert.equal(result1.limitationsDisclaimer, LIMITATIONS_DISCLAIMER);
const jsonStr = JSON.stringify(result1);
assert(!jsonStr.includes("trustScore"), "Result must not contain opaque trust score");
assert(!jsonStr.includes("trust_score"), "Result must not contain trust_score");
assert(!jsonStr.includes("investment grade"), "Result must not contain 'investment grade'");
assert(!jsonStr.includes("buy recommendation"), "Result must not contain investment recommendation");
console.log("✔ Safety constraints check passed.");

console.log("\n[github-due-diligence-test] ALL 9 TEST SUITES PASSED SUCCESSFULLY!");
