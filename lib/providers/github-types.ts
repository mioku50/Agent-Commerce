/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitHubRepositoryRef } from "./github-repository-ref";

export interface GitHubRepositoryMetadata {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  defaultBranch: string;
  starsCount: number;
  forksCount: number;
  openIssuesCount: number;
  watchersCount: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  license: {
    key: string;
    name: string;
    spdxId: string | null;
    url: string | null;
  } | null;
  homepage: string | null;
  topics: string[];
}

export interface GitHubActivityMetrics {
  recentCommitCount: number;
  commitAuthorCount: number;
  lastCommitAt: string | null;
  commitCount30d: number;
  commitCount90d: number;
  commitCount180d: number;
}

export interface GitHubContributorItem {
  login: string;
  contributions: number;
  avatarUrl: string | null;
}

export interface GitHubContributorsMetrics {
  totalCount: number;
  topContributors: GitHubContributorItem[];
  topContributorContributionPercentage: number;
}

export interface GitHubReleaseItem {
  name: string | null;
  tagName: string;
  publishedAt: string | null;
  isPrerelease: boolean;
  body: string | null;
}

export interface GitHubReleasesMetrics {
  totalCount: number;
  latestRelease: GitHubReleaseItem | null;
  releaseCount90d: number;
}

export interface GitHubCollaborationMetrics {
  openIssuesCount: number;
  hasDiscussions: boolean;
}

export interface GitHubDocumentationMetrics {
  hasReadme: boolean;
  hasLicense: boolean;
  hasSecurityPolicy: boolean;
  hasContributing: boolean;
  hasCodeOfConduct: boolean;
  readmeSize: number | null;
  securityPolicySize: number | null;
  contributingSize: number | null;
}

export interface GitHubStackMetrics {
  primaryLanguage: string | null;
  languages: Record<string, number>;
  detectedFrameworks: string[];
  hasWorkflows: boolean;
  workflowCount: number;
  workflowNames: string[];
}

export interface GitHubExcerpts {
  readmeExcerpt: string | null;
  securityExcerpt: string | null;
  contributingExcerpt: string | null;
}

export interface GitHubSourceMetadata {
  fetchedAt: string;
  cacheHit: boolean;
  provider: "GitHub REST API v3";
  upstreamStatus: "success" | "partial_success" | "fallback";
}

export interface GitHubRepositorySnapshot {
  version: 1;
  ref: GitHubRepositoryRef;
  repository: GitHubRepositoryMetadata;
  activity: GitHubActivityMetrics;
  contributors: GitHubContributorsMetrics;
  releases: GitHubReleasesMetrics;
  collaboration: GitHubCollaborationMetrics;
  documentation: GitHubDocumentationMetrics;
  stack: GitHubStackMetrics;
  excerpts: GitHubExcerpts;
  source: GitHubSourceMetadata;
}
