/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { parseGitHubRepositoryInput } from "../lib/providers/github-repository-ref.ts";
import {
  fetchGitHubRepositorySnapshot,
  clearGitHubSnapshotCache,
} from "../lib/providers/github.ts";
import { ProviderError } from "../lib/providers/errors.ts";

async function runTests() {
  console.log("Running GitHub Provider tests...");

  // Mock global fetch for deterministic testing
  const originalFetch = globalThis.fetch;

  try {
    // 1. Mock successful GitHub API responses
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Main repository metadata
      if (urlStr.includes("/repos/circle/agent-commerce") && !urlStr.includes("/commits") && !urlStr.includes("/releases") && !urlStr.includes("/contributors") && !urlStr.includes("/languages") && !urlStr.includes("/contents") && !urlStr.includes("/readme")) {
        return new Response(
          JSON.stringify({
            id: 123456,
            name: "agent-commerce",
            full_name: "circle/agent-commerce",
            owner: { login: "circle" },
            description: "Agent Commerce on Arc",
            private: false,
            fork: false,
            archived: false,
            default_branch: "main",
            stargazers_count: 42,
            forks_count: 5,
            open_issues_count: 3,
            watchers_count: 10,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-23T00:00:00Z",
            pushed_at: "2026-07-23T12:00:00Z",
            license: { key: "apache-2.0", name: "Apache License 2.0", spdx_id: "Apache-2.0", url: "https://api.github.com/licenses/apache-2.0" },
            homepage: "https://arc.circle.com",
            topics: ["arc", "usdc", "x402", "agents"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Commits
      if (urlStr.includes("/commits")) {
        return new Response(
          JSON.stringify([
            {
              commit: {
                committer: { date: new Date().toISOString() },
                author: { name: "Alice", email: "alice@example.com", date: new Date().toISOString() },
              },
              author: { login: "alice" },
            },
            {
              commit: {
                committer: { date: "2026-07-01T00:00:00Z" },
                author: { name: "Bob", email: "bob@example.com", date: "2026-07-01T00:00:00Z" },
              },
              author: { login: "bob" },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Releases
      if (urlStr.includes("/releases")) {
        return new Response(
          JSON.stringify([
            {
              name: "v1.0.0",
              tag_name: "v1.0.0",
              published_at: new Date().toISOString(),
              prerelease: false,
              body: "Initial release with secret ghp_123456789012345678901234567890123456 inside.",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Contributors
      if (urlStr.includes("/contributors")) {
        return new Response(
          JSON.stringify([
            { login: "alice", contributions: 80, avatar_url: "https://github.com/alice.png" },
            { login: "bob", contributions: 20, avatar_url: "https://github.com/bob.png" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Languages
      if (urlStr.includes("/languages")) {
        return new Response(
          JSON.stringify({ TypeScript: 80000, JavaScript: 20000 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Contents (Root)
      if (urlStr.endsWith("/contents")) {
        return new Response(
          JSON.stringify([
            { name: "README.md", size: 2500 },
            { name: "LICENSE", size: 1000 },
            { name: "SECURITY.md", size: 1200 },
            { name: "CONTRIBUTING.md", size: 1500 },
            { name: "package.json", size: 800 },
            { name: "next.config.ts", size: 400 },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Workflows
      if (urlStr.includes("/contents/.github/workflows")) {
        return new Response(
          JSON.stringify([
            { name: "ci.yml" },
            { name: "release.yml" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Readme excerpt
      if (urlStr.endsWith("/readme")) {
        const secretContent = Buffer.from(
          "# Agent Commerce\n\nContact support@example.com for help.\nUse token ghp_123456789012345678901234567890123456 or private key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----\n",
        ).toString("base64");
        return new Response(
          JSON.stringify({ encoding: "base64", content: secretContent }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // SECURITY.md
      if (urlStr.includes("/contents/SECURITY.md")) {
        const secContent = Buffer.from("# Security Policy\nReport vulnerabilities to security@example.com.").toString("base64");
        return new Response(
          JSON.stringify({ encoding: "base64", content: secContent }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // CONTRIBUTING.md
      if (urlStr.includes("/contents/CONTRIBUTING.md")) {
        const contribContent = Buffer.from("# Contributing Guide\nPull requests are welcome.").toString("base64");
        return new Response(
          JSON.stringify({ encoding: "base64", content: contribContent }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Pulls
      if (urlStr.includes("/pulls")) {
        return new Response(
          JSON.stringify([{ id: 1, number: 101, title: "Initial PR" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Issues
      if (urlStr.includes("/issues")) {
        return new Response(
          JSON.stringify([{ id: 2, number: 5, title: "Bug report" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as typeof fetch;

    clearGitHubSnapshotCache();

    const ref = parseGitHubRepositoryInput("circle/agent-commerce");

    // Test 1: Snapshot structure
    console.log("  - Test 1: Fetching snapshot structure...");
    const snapshot1 = await fetchGitHubRepositorySnapshot(ref);
    assert.equal(snapshot1.version, 1);
    assert.equal(snapshot1.repository.owner, "circle");
    assert.equal(snapshot1.repository.name, "agent-commerce");
    assert.equal(snapshot1.repository.starsCount, 42);
    assert.equal(snapshot1.activity.recentCommitCount, 2);
    assert.equal(snapshot1.activity.commitAuthorCount, 2);
    assert.equal(snapshot1.contributors.totalCount, 2);
    assert.equal(snapshot1.contributors.topContributorContributionPercentage, 80);
    assert.equal(snapshot1.releases.totalCount, 1);
    assert.equal(snapshot1.releases.latestRelease?.tagName, "v1.0.0");
    assert.equal(snapshot1.documentation.hasReadme, true);
    assert.equal(snapshot1.documentation.hasLicense, true);
    assert.equal(snapshot1.documentation.hasSecurityPolicy, true);
    assert.equal(snapshot1.documentation.hasContributing, true);
    assert.ok(snapshot1.stack.detectedFrameworks.includes("Next.js"));
    assert.ok(snapshot1.stack.detectedFrameworks.includes("Node.js"));
    assert.equal(snapshot1.stack.workflowCount, 2);
    assert.equal(snapshot1.source.cacheHit, false);
    assert.equal(snapshot1.source.cacheStatus, "live");
    assert.equal(snapshot1.source.cacheAgeSeconds, 0);
    assert.equal(snapshot1.source.provider, "GitHub REST API v3");
    console.log("    ✓ Snapshot structure matches expected schema");

    // Test 2: In-memory cache behavior & timestamp preservation
    console.log("  - Test 2: Cache behavior & timestamp preservation...");
    const originalFetchedAt = snapshot1.source.fetchedAt;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const snapshot2 = await fetchGitHubRepositorySnapshot(ref);
    assert.equal(snapshot2.source.cacheHit, true);
    assert.equal(snapshot2.source.cacheStatus, "cached");
    assert.equal(snapshot2.source.fetchedAt, originalFetchedAt);
    assert.ok(typeof snapshot2.source.cacheAgeSeconds === "number");
    assert.ok(snapshot2.source.cacheAgeSeconds >= 0);
    console.log("    ✓ Cache hit preserves original fetchedAt timestamp and computes cacheAgeSeconds");

    clearGitHubSnapshotCache();
    const snapshot3 = await fetchGitHubRepositorySnapshot(ref);
    assert.equal(snapshot3.source.cacheHit, false);
    assert.equal(snapshot3.source.cacheStatus, "live");
    assert.equal(snapshot3.source.cacheAgeSeconds, 0);
    console.log("    ✓ Cache clear resets cacheHit: false and cacheStatus: live");

    // Test 3: Secret redaction in excerpts and release body
    console.log("  - Test 3: Secret redaction in excerpts...");
    assert.ok(snapshot1.excerpts.readmeExcerpt?.includes("[redacted-email]"));
    assert.ok(snapshot1.excerpts.readmeExcerpt?.includes("[redacted-token]"));
    assert.ok(snapshot1.excerpts.readmeExcerpt?.includes("[redacted-private-key]"));
    assert.ok(!snapshot1.excerpts.readmeExcerpt?.includes("ghp_123456789012345678901234567890123456"));
    assert.ok(!snapshot1.excerpts.readmeExcerpt?.includes("support@example.com"));
    assert.ok(snapshot1.releases.latestRelease?.body?.includes("[redacted-token]"));
    console.log("    ✓ Tokens, emails, and private keys correctly redacted");

    // Test 4: Excerpt bounding
    console.log("  - Test 4: Excerpt bounding limit...");
    assert.ok(snapshot1.excerpts.readmeExcerpt!.length <= 128 * 1024);
    console.log("    ✓ Excerpt size bounded within 128KB limit");

    // Test 5: Not found error handling
    console.log("  - Test 5: Not found repository handling...");
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as typeof fetch;

    clearGitHubSnapshotCache();
    const badRef = parseGitHubRepositoryInput("circle/non-existent-repo");
    await assert.rejects(
      async () => {
        await fetchGitHubRepositorySnapshot(badRef);
      },
      (err: unknown) => {
        return err instanceof ProviderError && err.code === "github_repository_not_found" && err.httpStatus === 404;
      },
    );
    console.log("    ✓ 404 response throws github_repository_not_found ProviderError");

    // Test 6: Rate limit handling
    console.log("  - Test 6: Rate limit error handling...");
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ message: "API rate limit exceeded" }),
        { status: 403, headers: { "x-ratelimit-remaining": "0" } },
      );
    }) as typeof fetch;

    clearGitHubSnapshotCache();
    await assert.rejects(
      async () => {
        await fetchGitHubRepositorySnapshot(badRef);
      },
      (err: unknown) => {
        return err instanceof ProviderError && err.code === "github_rate_limited" && err.httpStatus === 429;
      },
    );
    console.log("    ✓ Rate limit response throws github_rate_limited ProviderError");

    // Test 7: Private repository handling
    console.log("  - Test 7: Private repository rejection...");
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: 999,
          name: "private-repo",
          full_name: "circle/private-repo",
          owner: { login: "circle" },
          private: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    clearGitHubSnapshotCache();
    const privateRef = parseGitHubRepositoryInput("circle/private-repo");
    await assert.rejects(
      async () => {
        await fetchGitHubRepositorySnapshot(privateRef);
      },
      (err: unknown) => {
        return err instanceof ProviderError && err.code === "github_repository_inaccessible" && err.httpStatus === 403;
      },
    );
    console.log("    ✓ Private repository throws github_repository_inaccessible ProviderError (403)");

    // Test 8: Optional sub-fetch failures & warning tracking
    console.log("  - Test 8: Optional sub-fetch warnings and partial status...");
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();

      // Main repository metadata succeeds
      if (urlStr.includes("/repos/circle/partial-repo") && !urlStr.includes("/commits") && !urlStr.includes("/releases") && !urlStr.includes("/contributors") && !urlStr.includes("/languages") && !urlStr.includes("/contents") && !urlStr.includes("/readme") && !urlStr.includes("/pulls") && !urlStr.includes("/issues")) {
        return new Response(
          JSON.stringify({
            id: 888,
            name: "partial-repo",
            full_name: "circle/partial-repo",
            owner: { login: "circle" },
            private: false,
            stargazers_count: 10,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Simulate failure for sub-fetches
      return new Response(
        JSON.stringify({ message: "Internal Server Error" }),
        { status: 500 },
      );
    }) as typeof fetch;

    clearGitHubSnapshotCache();
    const partialRef = parseGitHubRepositoryInput("circle/partial-repo");
    const partialSnapshot = await fetchGitHubRepositorySnapshot(partialRef);

    assert.equal(partialSnapshot.source.partial, true);
    assert.equal(partialSnapshot.source.upstreamStatus, "partial_success");
    assert.ok(Array.isArray(partialSnapshot.source.warnings));
    assert.ok(partialSnapshot.source.warnings.includes("commits_unavailable"));
    assert.ok(partialSnapshot.source.warnings.includes("workflows_unavailable"));
    assert.ok(partialSnapshot.source.warnings.includes("pull_requests_unavailable"));
    console.log("    ✓ Sub-fetch failures populate source.warnings and set source.partial = true");

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("All GitHub Provider tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
