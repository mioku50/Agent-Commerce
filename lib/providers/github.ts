/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderError } from "./errors.ts";
import type { GitHubRepositoryRef } from "./github-repository-ref.ts";
import type {
  GitHubRepositorySnapshot,
  GitHubRepositoryMetadata,
  GitHubActivityMetrics,
  GitHubContributorsMetrics,
  GitHubReleasesMetrics,
  GitHubCollaborationMetrics,
  GitHubDocumentationMetrics,
  GitHubStackMetrics,
  GitHubExcerpts,
  GitHubSourceMetadata,
} from "./github-types.ts";
import { redactHostedWorkflowText } from "../agent/hosted-workflows.ts";

const GITHUB_API_BASE = "https://api.github.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_EXCERPT_BYTES = 128 * 1024; // 128KB

type CacheEntry = {
  snapshot: GitHubRepositorySnapshot;
  expiresAt: number;
};

const snapshotCache = new Map<string, CacheEntry>();

export function clearGitHubSnapshotCache(): void {
  snapshotCache.clear();
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Agent-Commerce-Repository-Intelligence",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    if (token.toLowerCase().startsWith("bearer ") || token.toLowerCase().startsWith("token ")) {
      headers.Authorization = token;
    } else {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function githubFetch<T>(
  endpoint: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const url = `${GITHUB_API_BASE}${endpoint}`;
  const timeoutMs = options.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
      signal: controller.signal,
    });

    if (res.status === 404) {
      throw new ProviderError("github_repository_not_found", {
        httpStatus: 404,
        upstreamStatus: 404,
      });
    }

    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0" || res.status === 429) {
        throw new ProviderError("github_rate_limited", {
          httpStatus: 429,
          upstreamStatus: res.status,
          retryable: true,
        });
      }
      throw new ProviderError("github_repository_inaccessible", {
        httpStatus: 403,
        upstreamStatus: 403,
      });
    }

    if (res.status === 401) {
      throw new ProviderError("github_repository_inaccessible", {
        httpStatus: 401,
        upstreamStatus: 401,
      });
    }

    if (!res.ok) {
      throw new ProviderError("upstream_error", {
        httpStatus: 502,
        upstreamStatus: res.status,
        retryable: true,
      });
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("github_provider_timeout", {
        httpStatus: 504,
        retryable: true,
      });
    }
    throw new ProviderError("upstream_error", {
      httpStatus: 502,
      upstreamMessage: error instanceof Error ? error.message : String(error),
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function githubFetchContentExcerpt(
  owner: string,
  name: string,
  path: string,
): Promise<string | null> {
  try {
    const endpoint = `/repos/${owner}/${name}/contents/${path}`;
    const data = await githubFetch<{
      content?: string;
      encoding?: string;
      size?: number;
    }>(endpoint, { timeoutMs: 5000 });

    if (!data || !data.content) return null;
    let rawText = "";
    if (data.encoding === "base64") {
      const cleanBase64 = data.content.replace(/\s/g, "");
      rawText = Buffer.from(cleanBase64, "base64").toString("utf-8");
    } else {
      rawText = String(data.content);
    }

    const bounded = rawText.slice(0, MAX_EXCERPT_BYTES);
    return redactHostedWorkflowText(bounded);
  } catch {
    return null;
  }
}

async function githubFetchReadmeExcerpt(
  owner: string,
  name: string,
): Promise<string | null> {
  try {
    const endpoint = `/repos/${owner}/${name}/readme`;
    const data = await githubFetch<{
      content?: string;
      encoding?: string;
    }>(endpoint, { timeoutMs: 5000 });

    if (!data || !data.content) return null;
    let rawText = "";
    if (data.encoding === "base64") {
      const cleanBase64 = data.content.replace(/\s/g, "");
      rawText = Buffer.from(cleanBase64, "base64").toString("utf-8");
    } else {
      rawText = String(data.content);
    }

    const bounded = rawText.slice(0, MAX_EXCERPT_BYTES);
    return redactHostedWorkflowText(bounded);
  } catch {
    return null;
  }
}

export async function fetchGitHubRepositorySnapshot(
  ref: GitHubRepositoryRef,
  options?: { forceFresh?: boolean },
): Promise<GitHubRepositorySnapshot> {
  const cacheKey = ref.fullName.toLowerCase();
  const cached = snapshotCache.get(cacheKey);
  const now = Date.now();

  if (!options?.forceFresh && cached && now < cached.expiresAt) {
    return {
      ...cached.snapshot,
      source: {
        ...cached.snapshot.source,
        fetchedAt: new Date(now).toISOString(),
        cacheHit: true,
      },
    };
  }

  // Required main repository fetch
  const repoData = await githubFetch<Record<string, any>>(
    `/repos/${ref.owner}/${ref.name}`,
  );

  if (repoData.private === true) {
    throw new ProviderError("github_repository_inaccessible", {
      httpStatus: 403,
      upstreamStatus: 403,
    });
  }

  const repository: GitHubRepositoryMetadata = {
    id: Number(repoData.id ?? 0),
    owner: String(repoData.owner?.login || ref.owner).toLowerCase(),
    name: String(repoData.name || ref.name).toLowerCase(),
    fullName: String(repoData.full_name || ref.fullName).toLowerCase(),
    description: repoData.description ? String(repoData.description) : null,
    isPrivate: Boolean(repoData.private),
    isFork: Boolean(repoData.fork),
    isArchived: Boolean(repoData.archived),
    defaultBranch: String(repoData.default_branch || "main"),
    starsCount: Number(repoData.stargazers_count ?? 0),
    forksCount: Number(repoData.forks_count ?? 0),
    openIssuesCount: Number(repoData.open_issues_count ?? 0),
    watchersCount: Number(repoData.subscribers_count ?? repoData.watchers_count ?? 0),
    createdAt: String(repoData.created_at || new Date().toISOString()),
    updatedAt: String(repoData.updated_at || new Date().toISOString()),
    pushedAt: String(repoData.pushed_at || new Date().toISOString()),
    license: repoData.license
      ? {
          key: String(repoData.license.key || ""),
          name: String(repoData.license.name || ""),
          spdxId: repoData.license.spdx_id ? String(repoData.license.spdx_id) : null,
          url: repoData.license.url ? String(repoData.license.url) : null,
        }
      : null,
    homepage: repoData.homepage ? String(repoData.homepage) : null,
    topics: Array.isArray(repoData.topics) ? repoData.topics.map(String) : [],
  };

  // Parallel sub-fetches
  const [
    commitsResult,
    releasesResult,
    contributorsResult,
    languagesResult,
    contentsResult,
    workflowsResult,
    readmeExcerptResult,
    securityExcerptResult,
    contributingExcerptResult,
  ] = await Promise.allSettled([
    githubFetch<Array<Record<string, any>>>(
      `/repos/${ref.owner}/${ref.name}/commits?per_page=100`,
      { timeoutMs: 6000 },
    ),
    githubFetch<Array<Record<string, any>>>(
      `/repos/${ref.owner}/${ref.name}/releases?per_page=20`,
      { timeoutMs: 6000 },
    ),
    githubFetch<Array<Record<string, any>>>(
      `/repos/${ref.owner}/${ref.name}/contributors?per_page=20`,
      { timeoutMs: 6000 },
    ),
    githubFetch<Record<string, number>>(
      `/repos/${ref.owner}/${ref.name}/languages`,
      { timeoutMs: 6000 },
    ),
    githubFetch<Array<Record<string, any>>>(
      `/repos/${ref.owner}/${ref.name}/contents`,
      { timeoutMs: 6000 },
    ),
    githubFetch<Array<Record<string, any>>>(
      `/repos/${ref.owner}/${ref.name}/contents/.github/workflows`,
      { timeoutMs: 6000 },
    ),
    githubFetchReadmeExcerpt(ref.owner, ref.name),
    githubFetchContentExcerpt(ref.owner, ref.name, "SECURITY.md"),
    githubFetchContentExcerpt(ref.owner, ref.name, "CONTRIBUTING.md"),
  ]);

  let partialFailures = 0;

  // Process Commits
  let activity: GitHubActivityMetrics = {
    recentCommitCount: 0,
    commitAuthorCount: 0,
    lastCommitAt: repository.pushedAt,
    commitCount30d: 0,
    commitCount90d: 0,
    commitCount180d: 0,
  };

  if (commitsResult.status === "fulfilled" && Array.isArray(commitsResult.value)) {
    const commits = commitsResult.value;
    const authors = new Set<string>();
    let count30d = 0;
    let count90d = 0;
    let count180d = 0;
    const d30 = now - 30 * 24 * 60 * 60 * 1000;
    const d90 = now - 90 * 24 * 60 * 60 * 1000;
    const d180 = now - 180 * 24 * 60 * 60 * 1000;

    let lastCommitDate: string | null = null;

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const authorLogin = c.author?.login || c.commit?.author?.email || c.commit?.author?.name;
      if (authorLogin) authors.add(authorLogin);

      const commitDateStr = c.commit?.committer?.date || c.commit?.author?.date;
      if (commitDateStr) {
        if (!lastCommitDate) lastCommitDate = commitDateStr;
        const time = new Date(commitDateStr).getTime();
        if (time >= d30) count30d++;
        if (time >= d90) count90d++;
        if (time >= d180) count180d++;
      }
    }

    activity = {
      recentCommitCount: commits.length,
      commitAuthorCount: authors.size,
      lastCommitAt: lastCommitDate || repository.pushedAt,
      commitCount30d: count30d,
      commitCount90d: count90d,
      commitCount180d: count180d,
    };
  } else {
    partialFailures++;
  }

  // Process Releases
  let releases: GitHubReleasesMetrics = {
    totalCount: 0,
    latestRelease: null,
    releaseCount90d: 0,
  };

  if (releasesResult.status === "fulfilled" && Array.isArray(releasesResult.value)) {
    const rawReleases = releasesResult.value;
    const d90 = now - 90 * 24 * 60 * 60 * 1000;
    let count90d = 0;

    for (const r of rawReleases) {
      if (r.published_at) {
        const time = new Date(r.published_at).getTime();
        if (time >= d90) count90d++;
      }
    }

    const latest = rawReleases[0]
      ? {
          name: rawReleases[0].name ? String(rawReleases[0].name) : null,
          tagName: String(rawReleases[0].tag_name || ""),
          publishedAt: rawReleases[0].published_at ? String(rawReleases[0].published_at) : null,
          isPrerelease: Boolean(rawReleases[0].prerelease),
          body: rawReleases[0].body ? redactHostedWorkflowText(String(rawReleases[0].body)).slice(0, 1000) : null,
        }
      : null;

    releases = {
      totalCount: rawReleases.length,
      latestRelease: latest,
      releaseCount90d: count90d,
    };
  } else {
    partialFailures++;
  }

  // Process Contributors
  let contributors: GitHubContributorsMetrics = {
    totalCount: 0,
    topContributors: [],
    topContributorContributionPercentage: 0,
  };

  if (contributorsResult.status === "fulfilled" && Array.isArray(contributorsResult.value)) {
    const rawContribs = contributorsResult.value;
    const top = rawContribs.slice(0, 10).map((c) => ({
      login: String(c.login || "unknown"),
      contributions: Number(c.contributions ?? 0),
      avatarUrl: c.avatar_url ? String(c.avatar_url) : null,
    }));

    const sumTop = top.reduce((acc, curr) => acc + curr.contributions, 0);
    const topPct = sumTop > 0 && top[0] ? Math.round((top[0].contributions / sumTop) * 1000) / 10 : 0;

    contributors = {
      totalCount: rawContribs.length,
      topContributors: top,
      topContributorContributionPercentage: topPct,
    };
  } else {
    partialFailures++;
  }

  // Process Languages & Contents
  let languages: Record<string, number> = {};
  let primaryLanguage: string | null = repoData.language ? String(repoData.language) : null;

  if (languagesResult.status === "fulfilled" && languagesResult.value) {
    languages = languagesResult.value;
    const entries = Object.entries(languages);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      primaryLanguage = entries[0][0];
    }
  } else {
    partialFailures++;
  }

  const rootFiles = contentsResult.status === "fulfilled" && Array.isArray(contentsResult.value)
    ? contentsResult.value
    : [];

  const fileMap = new Map<string, { size: number }>();
  for (const f of rootFiles) {
    if (f.name) fileMap.set(String(f.name).toLowerCase(), { size: Number(f.size ?? 0) });
  }

  // Documentation metrics
  const readmeFile = Array.from(fileMap.keys()).find((k) => /^readme(?:\.(?:md|txt|rst))?$/i.test(k));
  const licenseFile = Array.from(fileMap.keys()).find((k) => /^license(?:\.(?:md|txt))?$/i.test(k));
  const securityFile = Array.from(fileMap.keys()).find((k) => /^security(?:\.md)?$/i.test(k));
  const contributingFile = Array.from(fileMap.keys()).find((k) => /^contributing(?:\.md)?$/i.test(k));
  const cocFile = Array.from(fileMap.keys()).find((k) => /^code_of_conduct(?:\.md)?$/i.test(k));

  const documentation: GitHubDocumentationMetrics = {
    hasReadme: Boolean(readmeFile),
    hasLicense: Boolean(repository.license || licenseFile),
    hasSecurityPolicy: Boolean(securityFile),
    hasContributing: Boolean(contributingFile),
    hasCodeOfConduct: Boolean(cocFile),
    readmeSize: readmeFile ? fileMap.get(readmeFile)?.size ?? null : null,
    securityPolicySize: securityFile ? fileMap.get(securityFile)?.size ?? null : null,
    contributingSize: contributingFile ? fileMap.get(contributingFile)?.size ?? null : null,
  };

  // Stack Framework Detection
  const detectedFrameworksSet = new Set<string>();
  const langKeys = Object.keys(languages);

  if (fileMap.has("next.config.js") || fileMap.has("next.config.ts") || fileMap.has("next.config.mjs")) {
    detectedFrameworksSet.add("Next.js");
  }
  if (fileMap.has("hardhat.config.js") || fileMap.has("hardhat.config.ts")) {
    detectedFrameworksSet.add("Hardhat");
  }
  if (fileMap.has("foundry.toml")) {
    detectedFrameworksSet.add("Foundry");
  }
  if (fileMap.has("package.json")) {
    detectedFrameworksSet.add("Node.js");
  }
  if (fileMap.has("cargo.toml") || langKeys.includes("Rust")) {
    detectedFrameworksSet.add("Rust / Cargo");
  }
  if (fileMap.has("go.mod") || langKeys.includes("Go")) {
    detectedFrameworksSet.add("Go");
  }
  if (fileMap.has("pyproject.toml") || fileMap.has("requirements.txt") || langKeys.includes("Python")) {
    detectedFrameworksSet.add("Python");
  }
  if (fileMap.has("dockerfile") || fileMap.has("docker-compose.yml")) {
    detectedFrameworksSet.add("Docker");
  }

  // Workflows
  let hasWorkflows = false;
  let workflowCount = 0;
  let workflowNames: string[] = [];

  if (workflowsResult.status === "fulfilled" && Array.isArray(workflowsResult.value)) {
    const rawWorkflows = workflowsResult.value;
    hasWorkflows = rawWorkflows.length > 0;
    workflowCount = rawWorkflows.length;
    workflowNames = rawWorkflows
      .map((w) => String(w.name || ""))
      .filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"));
  }

  const stack: GitHubStackMetrics = {
    primaryLanguage,
    languages,
    detectedFrameworks: Array.from(detectedFrameworksSet),
    hasWorkflows,
    workflowCount,
    workflowNames,
  };

  // Excerpts
  const excerpts: GitHubExcerpts = {
    readmeExcerpt: readmeExcerptResult.status === "fulfilled" ? readmeExcerptResult.value : null,
    securityExcerpt: securityExcerptResult.status === "fulfilled" ? securityExcerptResult.value : null,
    contributingExcerpt: contributingExcerptResult.status === "fulfilled" ? contributingExcerptResult.value : null,
  };

  // Collaboration
  const collaboration: GitHubCollaborationMetrics = {
    openIssuesCount: repository.openIssuesCount,
    hasDiscussions: Boolean(repoData.has_discussions),
  };

  const upstreamStatus = partialFailures === 0 ? "success" : "partial_success";

  const snapshot: GitHubRepositorySnapshot = {
    version: 1,
    ref,
    repository,
    activity,
    contributors,
    releases,
    collaboration,
    documentation,
    stack,
    excerpts,
    source: {
      fetchedAt: new Date(now).toISOString(),
      cacheHit: false,
      provider: "GitHub REST API v3",
      upstreamStatus,
    },
  };

  // Save to cache
  snapshotCache.set(cacheKey, {
    snapshot,
    expiresAt: now + CACHE_TTL_MS,
  });

  return snapshot;
}
