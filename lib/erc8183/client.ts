/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPublicClient, http, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { ERC8183_AGENTIC_COMMERCE_ABI } from "./abi.ts";
import type { Erc8183Job } from "./types.ts";

export const ARC_TESTNET_RPC_URL =
  process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

export function getArcPublicClient(rpcUrl = ARC_TESTNET_RPC_URL) {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl, { retryCount: 3, timeout: 15_000 }),
  });
}

export async function fetchOnchainJob(
  commerceAddress: `0x${string}`,
  jobId: bigint,
  client = getArcPublicClient(),
): Promise<Erc8183Job> {
  const result = await client.readContract({
    address: commerceAddress,
    abi: ERC8183_AGENTIC_COMMERCE_ABI,
    functionName: "getJob",
    args: [jobId],
  });

  const rawJob = result as {
    jobId: bigint;
    client: `0x${string}`;
    provider: `0x${string}`;
    evaluator: `0x${string}`;
    budget: bigint;
    expiredAt: bigint;
    status: number;
    description: string;
  };

  const statusMap: Record<number, Erc8183Job["status"]> = {
    0: "Open",
    1: "Submitted",
    2: "Completed",
    3: "Rejected",
    4: "Expired",
  };

  return {
    jobId: rawJob.jobId,
    client: rawJob.client,
    provider: rawJob.provider,
    evaluator: rawJob.evaluator,
    budget: rawJob.budget,
    expiredAt: rawJob.expiredAt,
    status: statusMap[rawJob.status] ?? "Open",
    description: rawJob.description,
  };
}

export async function fetchJobSubmittedLogs(
  commerceAddress: `0x${string}`,
  jobId: bigint,
  client = getArcPublicClient(),
): Promise<Array<{ jobId: bigint; deliverableHash: `0x${string}`; blockNumber: bigint; transactionHash: Hex }>> {
  const logs = await client.getLogs({
    address: commerceAddress,
    event: {
      type: "event",
      name: "JobSubmitted",
      inputs: [
        { type: "uint256", name: "jobId", indexed: true },
        { type: "bytes32", name: "deliverableHash", indexed: true },
      ],
    },
    args: {
      jobId,
    },
    fromBlock: "earliest",
    toBlock: "latest",
  });

  return logs.map((log) => ({
    jobId: log.args.jobId!,
    deliverableHash: log.args.deliverableHash!,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  }));
}
