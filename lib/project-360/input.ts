import { createHash } from "node:crypto";
import { getAddress, isAddress } from "viem";
import {
  InvalidGitHubRepositoryError,
  parseGitHubRepositoryInput,
} from "../providers/github-repository-ref.ts";
import { validateUrlSsrf } from "../seller/ssrf.ts";
import { BRAND } from "../brand.ts";
import {
  PROJECT_360_MODULES,
  PROJECT_360_MODULE_FOR_SOURCE,
  PROJECT_360_SOURCE_TYPES,
  type Project360ConfirmedSource,
  type Project360Input,
  type Project360Module,
  type Project360SourceType,
} from "./types.ts";

const SECRET_PATTERN =
  /\b(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|api[_\s-]?key|secret|password|bearer)\b|(?:sk-(?:or-v1-|proj-)?|ghp_|github_pat_)[a-z0-9_-]{12,}/i;

export class Project360InputError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "Project360InputError";
  }
}

export function project360Hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function isProject360SourceType(value: unknown): value is Project360SourceType {
  return PROJECT_360_SOURCE_TYPES.includes(value as Project360SourceType);
}

export function isProject360Module(value: unknown): value is Project360Module {
  return PROJECT_360_MODULES.includes(value as Project360Module);
}

function requiredSafeText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Project360InputError(
      "Provide one GitHub repository, wallet, Agent ID, Arc contract, or public HTTPS endpoint.",
      "project_source_required",
    );
  }
  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new Project360InputError("Project source is too long.", "project_source_invalid");
  }
  if (SECRET_PATTERN.test(normalized)) {
    throw new Project360InputError(
      "Project source appears to contain a credential or secret.",
      "project_source_secret_blocked",
    );
  }
  return normalized;
}

function canonicalEndpoint(value: string) {
  let url: URL;
  try {
    url = validateUrlSsrf(value, { allowLocalhost: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Project360InputError(
      /restricted|forbidden|internal|localhost|private/i.test(message)
        ? "Private, local, and reserved endpoints are blocked."
        : "Enter a valid public HTTPS endpoint.",
      /restricted|forbidden|internal|localhost|private/i.test(message)
        ? "endpoint_private_network_blocked"
        : "endpoint_invalid",
    );
  }
  if (url.protocol !== "https:") {
    throw new Project360InputError(
      "Project endpoints must use HTTPS.",
      "endpoint_invalid",
    );
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  if (url.pathname === "/") url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

export function normalizeProject360Source(input: {
  type: unknown;
  value: unknown;
}) {
  if (!isProject360SourceType(input.type)) {
    throw new Project360InputError(
      "Project source type is unsupported.",
      "project_source_type_invalid",
    );
  }
  const value = requiredSafeText(input.value);
  let canonicalValue: string;
  if (input.type === "github_repository") {
    try {
      canonicalValue = parseGitHubRepositoryInput(value).canonicalUrl;
    } catch (error) {
      if (!(error instanceof InvalidGitHubRepositoryError)) throw error;
      throw new Project360InputError(
        "Enter a valid public GitHub repository.",
        "project_source_invalid",
      );
    }
  } else if (input.type === "agent_id") {
    if (!/^agt_[a-z0-9]{20}$/.test(value)) {
      throw new Project360InputError(
        `Agent ID must use the public agt_ identifier shown in ${BRAND.name}.`,
        "agent_not_found",
      );
    }
    canonicalValue = value;
  } else if (input.type === "public_api_endpoint") {
    canonicalValue = canonicalEndpoint(value);
  } else {
    if (!isAddress(value)) {
      throw new Project360InputError(
        input.type === "arc_contract"
          ? "Arc contract must be a valid public EVM address."
          : "Project wallet must be a valid public EVM address.",
        input.type === "arc_contract" ? "contract_not_found" : "invalid_wallet",
      );
    }
    canonicalValue = getAddress(value);
  }
  return {
    type: input.type,
    module: PROJECT_360_MODULE_FOR_SOURCE[input.type],
    canonicalValue,
    valueHash: project360Hash(`${input.type}\n${canonicalValue}`),
  };
}

export function canonicalProject360Input(input: Project360Input) {
  const sources = [...input.sources]
    .sort((left, right) =>
      `${left.module}\n${left.type}\n${left.valueHash}`.localeCompare(
        `${right.module}\n${right.type}\n${right.valueHash}`,
      ),
    )
    .map((source) => ({
      candidateId: source.candidateId,
      type: source.type,
      module: source.module,
      canonicalValue: source.canonicalValue,
      valueHash: source.valueHash,
      origin: source.origin,
      confidence: source.confidence,
    }));
  const modules = PROJECT_360_MODULES.filter((module) =>
    input.modules.includes(module),
  );
  return JSON.stringify({
    schema: "veyra.project360.input.v1",
    discoveryId: input.discoveryId,
    discoveryRevision: input.discoveryRevision,
    discoverySnapshotHash: input.discoverySnapshotHash,
    selectionHash: input.selectionHash,
    sources,
    modules,
  });
}

export function normalizeProject360Input(value: unknown): Project360Input {
  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            throw new Project360InputError(
              "Project 360 input could not be reconstructed.",
              "project_input_invalid",
            );
          }
        })()
      : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Project360InputError(
      "Project 360 input must be an object.",
      "project_input_invalid",
    );
  }
  const record = raw as Record<string, unknown>;
  if (
    record.schema !== "veyra.project360.input.v1" ||
    typeof record.discoveryId !== "string" ||
    !/^dsc_[0-9a-f]{20}$/.test(record.discoveryId) ||
    !Number.isInteger(record.discoveryRevision) ||
    Number(record.discoveryRevision) < 1 ||
    typeof record.discoverySnapshotHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.discoverySnapshotHash) ||
    typeof record.selectionHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.selectionHash) ||
    !Array.isArray(record.sources) ||
    !Array.isArray(record.modules)
  ) {
    throw new Project360InputError(
      "Project 360 input binding is invalid.",
      "project_input_invalid",
    );
  }

  const modules = [...new Set(record.modules)];
  if (
    modules.length < 1 ||
    modules.length > PROJECT_360_MODULES.length ||
    modules.some((module) => !isProject360Module(module))
  ) {
    throw new Project360InputError(
      "Select between one and five Project 360 modules.",
      "project_modules_invalid",
    );
  }

  const sources: Project360ConfirmedSource[] = record.sources.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Project360InputError("Confirmed source is invalid.", "project_input_invalid");
    }
    const candidate = source as Record<string, unknown>;
    if (
      typeof candidate.candidateId !== "string" ||
      !/^src_[0-9a-f]{20}$/.test(candidate.candidateId) ||
      !isProject360SourceType(candidate.type) ||
      !isProject360Module(candidate.module) ||
      PROJECT_360_MODULE_FOR_SOURCE[candidate.type] !== candidate.module ||
      typeof candidate.canonicalValue !== "string" ||
      typeof candidate.valueHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(candidate.valueHash) ||
      !["primary", "github_file", "public_record"].includes(String(candidate.origin)) ||
      !["high", "medium", "low"].includes(String(candidate.confidence))
    ) {
      throw new Project360InputError("Confirmed source binding is invalid.", "project_input_invalid");
    }
    const normalized = normalizeProject360Source({
      type: candidate.type,
      value: candidate.canonicalValue,
    });
    if (
      normalized.valueHash !== candidate.valueHash ||
      normalized.canonicalValue !== candidate.canonicalValue
    ) {
      throw new Project360InputError("Confirmed source hash does not match.", "project_input_invalid");
    }
    return {
      candidateId: candidate.candidateId,
      type: candidate.type,
      module: candidate.module,
      canonicalValue: candidate.canonicalValue,
      valueHash: candidate.valueHash,
      origin: candidate.origin as Project360ConfirmedSource["origin"],
      confidence: candidate.confidence as Project360ConfirmedSource["confidence"],
    };
  });

  if (sources.length < 1 || sources.length > 25) {
    throw new Project360InputError(
      "Select at least one confirmed project source.",
      "project_sources_invalid",
    );
  }
  if (new Set(sources.map((source) => source.module)).size !== sources.length) {
    throw new Project360InputError(
      "Select at most one confirmed source per Project 360 module.",
      "duplicate_module_source",
    );
  }
  for (const selectedModule of modules as Project360Module[]) {
    if (!sources.some((source) => source.module === selectedModule)) {
      throw new Project360InputError(
        `Selected module ${selectedModule} has no confirmed source.`,
        "project_module_source_missing",
      );
    }
  }
  if (sources.some((source) => !modules.includes(source.module))) {
    throw new Project360InputError(
      "Every confirmed source must belong to a selected module.",
      "source_module_not_selected",
    );
  }

  const normalizedModules = PROJECT_360_MODULES.filter((selectedModule) =>
    modules.includes(selectedModule),
  );
  const expectedSelectionHash = project360SelectionHash({
    discoveryId: record.discoveryId,
    discoveryRevision: Number(record.discoveryRevision),
    candidatesHash: record.discoverySnapshotHash,
    sources,
    modules: normalizedModules,
  });
  if (expectedSelectionHash !== record.selectionHash) {
    throw new Project360InputError(
      "Project 360 source selection binding does not match.",
      "project_selection_integrity_failed",
      409,
    );
  }

  return {
    schema: "veyra.project360.input.v1",
    discoveryId: record.discoveryId,
    discoveryRevision: Number(record.discoveryRevision),
    discoverySnapshotHash: record.discoverySnapshotHash,
    selectionHash: record.selectionHash,
    sources,
    modules: normalizedModules,
  };
}

export function project360SelectionHash(input: {
  discoveryId: string;
  discoveryRevision: number;
  candidatesHash: string;
  sources: Project360ConfirmedSource[];
  modules: Project360Module[];
}) {
  return project360Hash(
    JSON.stringify({
      version: "project360-selection-v1",
      discoveryId: input.discoveryId,
      discoveryRevision: input.discoveryRevision,
      candidatesHash: input.candidatesHash,
      sources: [...input.sources]
        .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
        .map((source) => ({
          candidateId: source.candidateId,
          type: source.type,
          module: source.module,
          valueHash: source.valueHash,
        })),
      modules: PROJECT_360_MODULES.filter((module) => input.modules.includes(module)),
    }),
  );
}
