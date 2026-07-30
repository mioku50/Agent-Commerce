import type { AgentTrustReportInput } from "../agent-trust/types.ts";
import type { TrustSubjectType } from "./types.ts";

function canonicalEndpoint(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.searchParams.sort();
  return url.toString();
}

export function canonicalTrustSubject(input: AgentTrustReportInput): {
  key: string;
  type: TrustSubjectType;
  input: AgentTrustReportInput;
  displayName: string;
} {
  if (input.agentId) {
    return {
      key: `agent:${input.agentId.toLowerCase()}`,
      type: "ai_agent",
      input,
      displayName: input.agentId,
    };
  }
  if (input.repositoryUrl) {
    const repository = input.repositoryUrl
      .replace(/^https:\/\/github\.com\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    return {
      key: `github:${repository}`,
      type: "github_repository",
      input,
      displayName: repository,
    };
  }
  if (input.agentWallet) {
    return {
      key: `wallet:${input.agentWallet.toLowerCase()}`,
      type: "wallet",
      input,
      displayName: input.agentWallet,
    };
  }
  if (input.contractAddress) {
    return {
      key: `arc-testnet-contract:${input.contractAddress.toLowerCase()}`,
      type: "arc_contract",
      input,
      displayName: input.contractAddress,
    };
  }
  if (input.serviceEndpoint) {
    const endpoint = canonicalEndpoint(input.serviceEndpoint);
    return {
      key: `endpoint:${endpoint}`,
      type: "service_endpoint",
      input: { ...input, serviceEndpoint: endpoint },
      displayName: new URL(endpoint).hostname,
    };
  }
  throw new Error("A canonical trust subject requires a public identifier.");
}
