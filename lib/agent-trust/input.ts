import { getAddress, isAddress } from "viem";
import {
  InvalidGitHubRepositoryError,
  parseGitHubRepositoryInput,
} from "../providers/github-repository-ref.ts";
import { validateUrlSsrf } from "../seller/ssrf.ts";
import type { AgentTrustReportInput } from "./types.ts";

export class AgentTrustInputError extends Error {
  constructor(
    readonly code:
      | "agent_trust_input_required"
      | "agent_not_found"
      | "contract_not_found"
      | "endpoint_invalid"
      | "endpoint_private_network_blocked"
      | "invalid_repository"
      | "invalid_wallet",
    message: string,
  ) {
    super(message);
    this.name = "AgentTrustInputError";
  }
}
const SECRET_PATTERN =
  /\b(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|api[_\s-]?key|secret|bearer)\b|(?:sk-(?:or-v1-|proj-)?|ghp_|github_pat_)[a-z0-9_-]{12,}/i;

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new AgentTrustInputError(
      "agent_trust_input_required",
      `${field} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new AgentTrustInputError(
      "agent_trust_input_required",
      `${field} is too long.`,
    );
  }
  if (SECRET_PATTERN.test(normalized)) {
    throw new AgentTrustInputError(
      "agent_trust_input_required",
      `${field} appears to contain a credential or secret. Remove it before continuing.`,
    );
  }
  return normalized;
}

export function normalizeAgentTrustInput(
  value: unknown,
): AgentTrustReportInput {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const agentId = optionalText(input.agentId, "Agent ID", 80);
  const rawAgentWallet = optionalText(input.agentWallet, "Agent wallet", 80);
  const rawRepositoryUrl = optionalText(
    input.repositoryUrl ?? input.repository,
    "GitHub repository",
    300,
  );
  const rawContractAddress = optionalText(
    input.contractAddress,
    "Contract address",
    80,
  );
  const rawServiceEndpoint = optionalText(
    input.serviceEndpoint,
    "Service endpoint",
    500,
  );

  if (
    !agentId &&
    !rawAgentWallet &&
    !rawRepositoryUrl &&
    !rawContractAddress &&
    !rawServiceEndpoint
  ) {
    throw new AgentTrustInputError(
      "agent_trust_input_required",
      "Provide an Agent ID, agent wallet, public GitHub repository, Arc contract, or public HTTPS endpoint.",
    );
  }
  if (agentId && !/^agt_[a-z0-9]{20}$/.test(agentId)) {
    throw new AgentTrustInputError(
      "agent_not_found",
      "Check the public Agent ID. Expected the agt_ identifier shown in Veyra.",
    );
  }

  let agentWallet: string | undefined;
  if (rawAgentWallet) {
    if (!isAddress(rawAgentWallet)) {
      throw new AgentTrustInputError(
        "invalid_wallet",
        "Check the agent wallet. It must be a valid EVM address.",
      );
    }
    agentWallet = getAddress(rawAgentWallet);
  }

  let repositoryUrl: string | undefined;
  if (rawRepositoryUrl) {
    try {
      repositoryUrl =
        parseGitHubRepositoryInput(rawRepositoryUrl).canonicalUrl;
    } catch (error) {
      throw new AgentTrustInputError(
        "invalid_repository",
        error instanceof InvalidGitHubRepositoryError
          ? error.message
          : "Check the public GitHub repository URL.",
      );
    }
  }

  let contractAddress: string | undefined;
  if (rawContractAddress) {
    if (!isAddress(rawContractAddress)) {
      throw new AgentTrustInputError(
        "contract_not_found",
        "Check the Arc Testnet contract address.",
      );
    }
    contractAddress = getAddress(rawContractAddress);
  }

  let serviceEndpoint: string | undefined;
  if (rawServiceEndpoint) {
    try {
      serviceEndpoint = validateUrlSsrf(rawServiceEndpoint, {
        allowLocalhost: false,
      }).toString();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new AgentTrustInputError(
        /restricted|forbidden|internal|localhost|private/i.test(message)
          ? "endpoint_private_network_blocked"
          : "endpoint_invalid",
        /restricted|forbidden|internal|localhost|private/i.test(message)
          ? "Remove the endpoint because private and local networks are blocked."
          : "Check the service endpoint. It must be a public HTTPS URL.",
      );
    }
  }

  return {
    ...(agentId ? { agentId } : {}),
    ...(agentWallet ? { agentWallet } : {}),
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(contractAddress ? { contractAddress } : {}),
    ...(serviceEndpoint ? { serviceEndpoint } : {}),
  };
}

export function canonicalAgentTrustInput(input: AgentTrustReportInput) {
  return JSON.stringify({
    agentId: input.agentId ?? null,
    agentWallet: input.agentWallet ?? null,
    repositoryUrl: input.repositoryUrl ?? null,
    contractAddress: input.contractAddress ?? null,
    serviceEndpoint: input.serviceEndpoint ?? null,
  });
}

export function parseCanonicalAgentTrustInput(value: string) {
  try {
    return normalizeAgentTrustInput(JSON.parse(value));
  } catch (error) {
    if (error instanceof AgentTrustInputError) throw error;
    throw new AgentTrustInputError(
      "agent_trust_input_required",
      "The Agent Trust Report input could not be reconstructed.",
    );
  }
}
