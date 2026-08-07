/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPublicClient, http, parseAbiItem, getContract } from "viem";
import { arcTestnet } from "viem/chains";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
  type Erc8004AgentIdentityRecord,
  type Erc8004ValidationStatus,
} from "./types.ts";

export {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
};
import { getByoaClient } from "../byoa/service.ts";

export const ARC_TESTNET_RPC_URL =
  process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

export function getArcPublicClient(rpcUrl = ARC_TESTNET_RPC_URL) {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl, { retryCount: 3, timeout: 15_000 }),
  });
}

export async function getVeyraAgentIdentityRecord(): Promise<Erc8004AgentIdentityRecord | null> {
  const envAgentId = process.env.ERC8004_VEYRA_AGENT_ID || process.env.NEXT_PUBLIC_ERC8004_VEYRA_AGENT_ID;

  try {
    const supabase = getByoaClient();
    let query = supabase.from("erc8004_agent_identity").select("*");
    if (envAgentId) {
      query = query.eq("agent_id", envAgentId);
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (data) {
      return data as Erc8004AgentIdentityRecord;
    }
  } catch (err) {
    console.error("Failed to query erc8004_agent_identity from DB:", err);
  }

  if (envAgentId) {
    return {
      id: "env-fallback",
      agent_id: envAgentId,
      registry_address: process.env.ERC8004_IDENTITY_REGISTRY || ARC_ERC8004_IDENTITY_REGISTRY,
      chain_id: 5042002,
      owner_address: process.env.VEYRA_EVALUATOR_ATTESTER_ADDRESS || "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
      metadata_uri: `${process.env.NEXT_PUBLIC_APP_URL || "https://agent-commerce-six.vercel.app"}/.well-known/veyra-agent.json`,
      registration_tx: "0x0000000000000000000000000000000000000000000000000000000000000000",
      created_at: new Date().toISOString(),
    };
  }

  return null;
}

export async function getCanonicalVeyraAgentIdentity(
  publicClient = getArcPublicClient()
): Promise<Erc8004AgentIdentityRecord | null> {
  const dbRecord = await getVeyraAgentIdentityRecord();
  if (!dbRecord || !dbRecord.agent_id) {
    return null;
  }

  try {
    const agentId = BigInt(dbRecord.agent_id);
    const registryAddress = (dbRecord.registry_address || ARC_ERC8004_IDENTITY_REGISTRY) as `0x${string}`;
    const onchain = await fetchAgentIdentityOnchain(agentId, registryAddress, publicClient);

    return {
      ...dbRecord,
      owner_address: onchain.owner || dbRecord.owner_address,
      metadata_uri: onchain.tokenURI || dbRecord.metadata_uri,
    };
  } catch (err) {
    console.warn("⚠️ Onchain identity verification warning for canonical agentId:", err);
    return dbRecord;
  }
}

/**
 * Fetch onchain owner and tokenURI for a given ERC-8004 agentId from IdentityRegistry.
 */
export async function fetchAgentIdentityOnchain(
  agentId: bigint,
  registryAddress = ARC_ERC8004_IDENTITY_REGISTRY,
  client = getArcPublicClient()
) {
  const contract = getContract({
    address: registryAddress as `0x${string}`,
    abi: [
      {
        name: "ownerOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
      },
      {
        name: "tokenURI",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
      },
    ],
    client,
  });

  const [owner, tokenURI] = await Promise.all([
    contract.read.ownerOf([agentId]),
    contract.read.tokenURI([agentId]),
  ]);

  return { owner, tokenURI };
}

/**
 * Reads validation status from Arc ValidationRegistry.
 */
export async function fetchValidationStatusOnchain(
  requestHash: `0x${string}`,
  registryAddress = ARC_ERC8004_VALIDATION_REGISTRY,
  client = getArcPublicClient()
): Promise<Erc8004ValidationStatus> {
  const contract = getContract({
    address: registryAddress as `0x${string}`,
    abi: [
      {
        name: "getValidationStatus",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "requestHash", type: "bytes32" }],
        outputs: [
          { name: "validatorAddress", type: "address" },
          { name: "agentId", type: "uint256" },
          { name: "response", type: "uint8" },
          { name: "responseHash", type: "bytes32" },
          { name: "tag", type: "string" },
          { name: "lastUpdate", type: "uint256" },
        ],
      },
    ],
    client,
  });

  const res = (await contract.read.getValidationStatus([requestHash])) as readonly [
    `0x${string}`,
    bigint,
    number,
    `0x${string}`,
    string,
    bigint,
  ];

  return {
    validatorAddress: res[0],
    agentId: res[1],
    response: res[2],
    responseHash: res[3],
    tag: res[4],
    lastUpdate: res[5],
  };
}

/**
 * Searches for minted Transfer events on IdentityRegistry to recover newly minted agentId for an owner address.
 */
export async function recoverAgentIdFromLogs(
  ownerAddress: `0x${string}`,
  registryAddress = ARC_ERC8004_IDENTITY_REGISTRY,
  client = getArcPublicClient()
): Promise<string | null> {
  const latestBlock = await client.getBlockNumber();
  const blockRange = BigInt(9900);
  const fromBlock = latestBlock > blockRange ? latestBlock - blockRange : BigInt(0);

  const logs = await client.getLogs({
    address: registryAddress as `0x${string}`,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
    args: { to: ownerAddress },
    fromBlock,
    toBlock: latestBlock,
  });

  if (logs.length === 0) return null;
  const lastLog = logs[logs.length - 1];
  return lastLog.args.tokenId ? lastLog.args.tokenId.toString() : null;
}
