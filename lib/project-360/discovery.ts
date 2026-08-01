import { redactHostedWorkflowText } from "../agent/hosted-workflows.ts";
import {
  fetchGitHubDiscoveryFiles,
  type GitHubDiscoveryFile,
} from "../providers/github.ts";
import { parseGitHubRepositoryInput } from "../providers/github-repository-ref.ts";
import {
  normalizeProject360Source,
  project360Hash,
  Project360InputError,
} from "./input.ts";
import type {
  Project360Module,
  Project360SourceType,
} from "./types.ts";
import { PROJECT_360_SOURCE_TYPES } from "./types.ts";

const SECRET_LINE_PATTERN =
  /\b(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|api[_\s-]?key|secret|password|authorization|bearer|access[_\s-]?token)\b|(?:sk-(?:or-v1-|proj-)?|ghp_|github_pat_)[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const AGENT_ID_PATTERN = /\bagt_[a-z0-9]{20}\b/g;
const ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;
const URL_PATTERN = /https:\/\/[^\s<>"'`\])}]+/g;

export type Project360CandidateDraft = {
  sourceType: Project360SourceType;
  module: Project360Module;
  canonicalValue: string;
  valueHash: string;
  originKind: "primary" | "github_file" | "public_record";
  originRepository: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  safeExcerpt: string | null;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  reasonCode: string;
  validationStatus: "valid" | "unsupported" | "blocked";
  originFingerprint: string;
};

function safePath(path: string) {
  if (
    path.length < 1 ||
    path.length > 240 ||
    path.startsWith("/") ||
    path.includes("..") ||
    /[\0\r\n]/.test(path)
  ) return null;
  return path;
}

function safeExcerpt(line: string) {
  if (SECRET_LINE_PATTERN.test(line)) return null;
  const value = redactHostedWorkflowText(line)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return value || null;
}

function contextConfidence(input: {
  line: string;
  path: string;
  type: Project360SourceType;
}) {
  const text = input.line.toLowerCase();
  const path = input.path.toLowerCase();
  const explicitByType: Record<Project360SourceType, RegExp> = {
    github_repository: /\b(?:repository|repo|github|source)\b/,
    project_wallet: /\b(?:wallet|treasury|recipient|pay[_-]?to|seller[_-]?wallet)\b/,
    agent_id: /\b(?:agent[_ -]?id|veyra agent)\b/,
    arc_contract: /\b(?:contract|deployment|implementation|proxy|arc)\b/,
    public_api_endpoint: /\b(?:api|endpoint|base[_ -]?url|service[_ -]?url|webhook)\b/,
  };
  if (explicitByType[input.type].test(text)) {
    return { confidence: "high" as const, score: 0.92, reasonCode: "explicit_named_source" };
  }
  if (/readme|docs?\//.test(path)) {
    return { confidence: "medium" as const, score: 0.76, reasonCode: "documented_source" };
  }
  if (/config|deploy|\.ya?ml$|\.json$|\.toml$/.test(path)) {
    return { confidence: "medium" as const, score: 0.72, reasonCode: "configuration_source" };
  }
  return { confidence: "low" as const, score: 0.5, reasonCode: "unlabelled_literal" };
}

function addressType(line: string, path: string): Project360SourceType {
  if (/\b(?:wallet|treasury|recipient|pay[_-]?to|seller[_-]?wallet)\b/i.test(line)) {
    return "project_wallet";
  }
  if (
    /\b(?:contract|implementation|proxy|deployed|deployment)\b/i.test(line) ||
    /(?:^|\/)contracts?\//i.test(path) ||
    /\.(?:sol|vy)$/i.test(path)
  ) {
    return "arc_contract";
  }
  return "project_wallet";
}

function candidateFromValue(input: {
  type: Project360SourceType;
  value: string;
  originKind: Project360CandidateDraft["originKind"];
  originRepository: string | null;
  filePath: string | null;
  line: number | null;
  excerpt: string | null;
  confidence: Project360CandidateDraft["confidence"];
  confidenceScore: number;
  reasonCode: string;
}): Project360CandidateDraft | null {
  try {
    const normalized = normalizeProject360Source({ type: input.type, value: input.value });
    return {
      sourceType: normalized.type,
      module: normalized.module,
      canonicalValue: normalized.canonicalValue,
      valueHash: normalized.valueHash,
      originKind: input.originKind,
      originRepository: input.originRepository,
      filePath: input.filePath,
      lineStart: input.line,
      lineEnd: input.line,
      safeExcerpt: input.excerpt,
      confidence: input.confidence,
      confidenceScore: input.confidenceScore,
      reasonCode: input.reasonCode,
      validationStatus: "valid",
      originFingerprint: project360Hash(
        [
          input.originKind,
          input.originRepository ?? "none",
          input.filePath ?? "none",
          input.line ?? "none",
          normalized.valueHash,
        ].join("\n"),
      ),
    };
  } catch (error) {
    if (error instanceof Project360InputError) return null;
    throw error;
  }
}

function scanGitHubFile(repository: string, file: GitHubDiscoveryFile) {
  const path = safePath(file.path);
  if (!path) return { candidates: [] as Project360CandidateDraft[], blocked: 0 };
  const candidates: Project360CandidateDraft[] = [];
  let blocked = 0;
  const lines = file.content.split(/\r?\n/).slice(0, 4_000);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || SECRET_LINE_PATTERN.test(line)) continue;
    const excerpt = safeExcerpt(line);
    const hits: Array<{ type: Project360SourceType; value: string }> = [];
    for (const agentId of line.match(AGENT_ID_PATTERN) ?? []) {
      hits.push({ type: "agent_id", value: agentId });
    }
    for (const address of line.match(ADDRESS_PATTERN) ?? []) {
      hits.push({ type: addressType(line, path), value: address });
    }
    for (const rawUrl of line.match(URL_PATTERN) ?? []) {
      const url = rawUrl.replace(/[.,;:!?]+$/, "");
      try {
        const parsed = new URL(url);
        hits.push({
          type: /^(?:www\.)?github\.com$/i.test(parsed.hostname)
            ? "github_repository"
            : "public_api_endpoint",
          value: url,
        });
      } catch {
        blocked += 1;
      }
    }

    for (const hit of hits.slice(0, 12)) {
      const confidence = contextConfidence({ line, path, type: hit.type });
      const candidate = candidateFromValue({
        type: hit.type,
        value: hit.value,
        originKind: "github_file",
        originRepository: repository,
        filePath: path,
        line: index + 1,
        excerpt,
        confidence: confidence.confidence,
        confidenceScore: confidence.score,
        reasonCode: confidence.reasonCode,
      });
      if (candidate) candidates.push(candidate);
      else blocked += 1;
    }
  }
  return { candidates, blocked };
}

export function detectProject360CandidatesFromGitHubFiles(
  repository: string,
  files: GitHubDiscoveryFile[],
) {
  const candidates: Project360CandidateDraft[] = [];
  let blockedCandidates = 0;
  for (const file of files) {
    const result = scanGitHubFile(repository, file);
    candidates.push(...result.candidates);
    blockedCandidates += result.blocked;
  }
  return {
    candidates: deduplicateCandidates(candidates),
    blockedCandidates,
  };
}

function deduplicateCandidates(candidates: Project360CandidateDraft[]) {
  const best = new Map<string, Project360CandidateDraft>();
  for (const candidate of candidates) {
    const key = `${candidate.sourceType}\n${candidate.valueHash}`;
    const current = best.get(key);
    if (
      !current ||
      candidate.originKind === "primary" ||
      candidate.confidenceScore > current.confidenceScore
    ) {
      best.set(key, candidate);
    }
  }
  return [...best.values()].sort((left, right) => {
    if (left.originKind === "primary" && right.originKind !== "primary") return -1;
    if (right.originKind === "primary" && left.originKind !== "primary") return 1;
    if (left.confidenceScore !== right.confidenceScore) {
      return right.confidenceScore - left.confidenceScore;
    }
    return `${left.sourceType}\n${left.canonicalValue}`.localeCompare(
      `${right.sourceType}\n${right.canonicalValue}`,
    );
  });
}

export function limitProject360Candidates(
  candidates: Project360CandidateDraft[],
  limit = 25,
) {
  const ordered = deduplicateCandidates(candidates);
  const boundedLimit = Math.max(1, Math.min(limit, 25));
  const selected: Project360CandidateDraft[] = [];
  const fingerprints = new Set<string>();
  const add = (candidate: Project360CandidateDraft | undefined) => {
    if (!candidate || selected.length >= boundedLimit) return;
    const fingerprint = `${candidate.sourceType}\n${candidate.valueHash}`;
    if (fingerprints.has(fingerprint)) return;
    selected.push(candidate);
    fingerprints.add(fingerprint);
  };

  add(ordered.find((candidate) => candidate.originKind === "primary"));
  for (const sourceType of PROJECT_360_SOURCE_TYPES) {
    add(ordered.find((candidate) => candidate.sourceType === sourceType));
  }
  for (const candidate of ordered) add(candidate);
  return selected;
}

export async function discoverProject360Candidates(input: {
  primaryType: Project360SourceType;
  primaryValue: string;
}) {
  const primary = candidateFromValue({
    type: input.primaryType,
    value: input.primaryValue,
    originKind: "primary",
    originRepository:
      input.primaryType === "github_repository"
        ? parseGitHubRepositoryInput(input.primaryValue).fullName
        : null,
    filePath: null,
    line: null,
    excerpt: null,
    confidence: "high",
    confidenceScore: 1,
    reasonCode: "explicit_primary_source",
  });
  if (!primary) {
    throw new Project360InputError(
      "Primary project source is invalid.",
      "project_source_invalid",
    );
  }

  const candidates = [primary];
  const warnings: string[] = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let blockedCandidates = 0;
  if (input.primaryType === "github_repository") {
    const repository = parseGitHubRepositoryInput(input.primaryValue);
    const files = await fetchGitHubDiscoveryFiles(repository);
    filesScanned = files.length;
    bytesScanned = files.reduce((sum, file) => sum + file.sizeBytes, 0);
    const detected = detectProject360CandidatesFromGitHubFiles(
      repository.fullName,
      files,
    );
    candidates.push(...detected.candidates);
    blockedCandidates += detected.blockedCandidates;
    if (files.length === 0) warnings.push("github_files_unavailable");
  } else {
    warnings.push("primary_source_only");
  }
  if (blockedCandidates > 0) warnings.push("unsafe_candidates_blocked");

  const deduplicated = limitProject360Candidates(candidates);
  return {
    candidates: deduplicated,
    warnings,
    stats: {
      filesScanned,
      bytesScanned,
      blockedCandidates,
      candidateCount: deduplicated.length,
    },
  };
}

export function project360CandidateSetHash(candidates: Project360CandidateDraft[]) {
  return project360Hash(
    JSON.stringify(
      [...candidates]
        .sort((left, right) =>
          `${left.sourceType}\n${left.valueHash}\n${left.originFingerprint}`.localeCompare(
            `${right.sourceType}\n${right.valueHash}\n${right.originFingerprint}`,
          ),
        )
        .map((candidate) => ({
          sourceType: candidate.sourceType,
          module: candidate.module,
          valueHash: candidate.valueHash,
          originFingerprint: candidate.originFingerprint,
          confidence: candidate.confidence,
          confidenceScore: candidate.confidenceScore,
          validationStatus: candidate.validationStatus,
        })),
    ),
  );
}
