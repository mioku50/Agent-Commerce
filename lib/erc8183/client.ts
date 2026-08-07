/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPublicClient, encodeFunctionData, http, numberToHex, padHex, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
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
  const calldata = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "jobs",
        stateMutability: "view",
        inputs: [{ type: "uint256", name: "jobId" }],
        outputs: [],
      },
    ],
    args: [jobId],
  });

  const res = await client.call({
    to: commerceAddress,
    data: calldata,
  });

  if (!res.data || res.data === "0x") {
    throw new Error(`Job ${jobId} not found onchain`);
  }

  const rawHex = res.data.slice(2);
  const clientAddr = `0x${rawHex.slice(64 + 24, 128)}` as `0x${string}`;
  const providerAddr = `0x${rawHex.slice(128 + 24, 192)}` as `0x${string}`;
  const evaluatorAddr = `0x${rawHex.slice(192 + 24, 256)}` as `0x${string}`;
  const budget = BigInt(`0x${rawHex.slice(320, 384)}`);
  const expiredAt = BigInt(`0x${rawHex.slice(384, 448)}`);
  const statusCode = parseInt(rawHex.slice(448, 512), 16);

  const statusMap: Record<number, Erc8183Job["status"]> = {
    0: "Open",
    1: "Submitted",
    2: "Completed",
    3: "Rejected",
    4: "Expired",
  };

  return {
    jobId,
    client: clientAddr,
    provider: providerAddr,
    evaluator: evaluatorAddr,
    budget,
    expiredAt,
    status: statusMap[statusCode] ?? "Open",
    description: "ERC-8183 Job",
  };
}

export async function fetchJobSubmittedLogs(
  commerceAddress: `0x${string}`,
  jobId: bigint,
  client = getArcPublicClient(),
): Promise<Array<{ jobId: bigint; deliverableHash: `0x${string}`; blockNumber: bigint; transactionHash: Hex }>> {
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - BigInt(5000) > BigInt(0) ? currentBlock - BigInt(5000) : BigInt(0);

  const topic1 = padHex(numberToHex(jobId));

  const logs = await client.getLogs({
    address: commerceAddress,
    topics: ["0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e", topic1],
    fromBlock,
    toBlock: "latest",
  } as any);

  const filteredLogs = logs.filter(
    (log) => log.topics[1] && BigInt(log.topics[1]) === jobId,
  );

  const uniqueLogs = Array.from(new Map(filteredLogs.map((l) => [l.transactionHash, l])).values());
  const latestLogs = uniqueLogs.length > 0 ? [uniqueLogs[uniqueLogs.length - 1]] : [];

  return latestLogs.map((log) => ({
    jobId,
    deliverableHash: (log.data && log.data !== "0x" ? log.data : log.topics[2]) as `0x${string}`,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  }));
}
