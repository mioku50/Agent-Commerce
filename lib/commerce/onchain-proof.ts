/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  concat,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";

export type OnchainProofStatus = "pending" | "verified" | "failed";

export type OnchainProofMetadata = {
  status: OnchainProofStatus;
  receiptHash: Hex | null;
  serviceHash: Hex | null;
  requestHash: Hex | null;
  responseHash: Hex | null;
  contractAddress: Address | null;
  chainId: number | null;
  transactionHash: Hex | null;
};

export type AgentCommerceProof = {
  receiptHash: Hex;
  serviceHash: Hex;
  buyer: Address;
  seller: Address;
  amountAtomic: string;
  requestHash: Hex;
  responseHash: Hex;
  timestamp: number;
};

const proofRegistryAbi = [
  {
    type: "function",
    name: "getProof",
    stateMutability: "view",
    inputs: [{ name: "receiptId", type: "bytes32" }],
    outputs: [
      { name: "serviceHash", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "requestHash", type: "bytes32" },
      { name: "responseHash", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "receiptId", type: "bytes32" }],
    outputs: [{ name: "registered", type: "bool" }],
  },
  {
    type: "function",
    name: "registerProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "receiptId", type: "bytes32" },
      { name: "serviceHash", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "requestHash", type: "bytes32" },
      { name: "responseHash", type: "bytes32" },
    ],
    outputs: [{ name: "timestamp", type: "uint64" }],
  },
] as const;

function rpcUrl() {
  return (
    process.env.ARC_TESTNET_RPC_URL ?? arcTestnet.rpcUrls.default.http[0]
  );
}

function configuredRegistryAddress() {
  const value = process.env.AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS;
  return value && isAddress(value) ? getAddress(value) : null;
}

function configuredAttesterAccount() {
  const value = process.env.AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY;
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return privateKeyToAccount(value as Hex);
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const configuredSecrets = [
    process.env.AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY,
    process.env.ARC_TESTNET_RPC_URL,
  ].filter((value): value is string => Boolean(value));
  let sanitized = message;

  for (const secret of configuredSecrets) {
    sanitized = sanitized.split(secret).join("[redacted]");
  }

  return sanitized
    .replace(/0x[0-9a-fA-F]{64}/g, "[redacted]")
    .replace(/bearer\s+[^\s]+/gi, "bearer [redacted]")
    .slice(0, 800);
}

function bytes32(value: string | null | undefined): Hex | null {
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null;
}

export function createProofIdentifiers(paymentEventId: string, endpoint: string) {
  return {
    receiptHash: keccak256(toBytes(paymentEventId)),
    serviceHash: keccak256(toBytes(endpoint)),
    contractAddress: configuredRegistryAddress(),
    chainId: ARC_TESTNET_CHAIN_ID,
  };
}

async function hashRequest(request: Request, endpoint: string) {
  const body = new Uint8Array(await request.arrayBuffer());
  const search = new URL(request.url).search;
  const context = toBytes(`${request.method}\n${endpoint}\n${search}\n`);
  return keccak256(concat([context, body]));
}

async function hashResponse(response: Response) {
  return keccak256(new Uint8Array(await response.arrayBuffer()));
}

async function updatePaymentEvent(
  supabase: SupabaseClient,
  paymentEventId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("payment_events")
    .update(values)
    .eq("id", paymentEventId);

  if (error) throw new Error(error.message);
}

export async function markOnchainProofFailed(
  supabase: SupabaseClient,
  paymentEventId: string,
) {
  try {
    await updatePaymentEvent(supabase, paymentEventId, {
      onchain_status: "failed",
    });
  } catch (error) {
    console.error(
      `[proof-registry] Failed to persist failed status for receipt ${paymentEventId}: ${safeErrorMessage(error)}`,
    );
  }
}

export async function attestPaymentEvent(input: {
  supabase: SupabaseClient;
  paymentEventId: string;
  endpoint: string;
  amountAtomic: string;
  buyer: string;
  seller: string;
  request: Request;
  response: Response;
}) {
  const {
    supabase,
    paymentEventId,
    endpoint,
    amountAtomic,
    buyer,
    seller,
    request,
    response,
  } = input;
  let transactionHash: Hex | null = null;

  try {
    const { receiptHash, serviceHash, contractAddress, chainId } =
      createProofIdentifiers(paymentEventId, endpoint);
    const [requestHash, responseHash] = await Promise.all([
      hashRequest(request, endpoint),
      hashResponse(response),
    ]);

    await updatePaymentEvent(supabase, paymentEventId, {
      receipt_hash: receiptHash,
      service_hash: serviceHash,
      request_hash: requestHash,
      response_hash: responseHash,
      onchain_contract_address: contractAddress,
      onchain_chain_id: chainId,
      onchain_status: "pending",
    });

    const account = configuredAttesterAccount();
    if (!contractAddress) {
      throw new Error("AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS is missing or invalid");
    }
    if (!account) {
      throw new Error(
        "AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY is missing or invalid",
      );
    }
    if (!isAddress(buyer) || !isAddress(seller)) {
      throw new Error("Settlement returned an invalid buyer or seller address");
    }

    const amount = BigInt(amountAtomic);
    if (amount <= BigInt(0)) {
      throw new Error("Settlement amount must be positive");
    }

    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl()),
    });
    const observedChainId = await publicClient.getChainId();
    if (observedChainId !== ARC_TESTNET_CHAIN_ID) {
      throw new Error(
        `Refusing proof write on chain ${observedChainId}; expected ${ARC_TESTNET_CHAIN_ID}`,
      );
    }

    const alreadyRegistered = await publicClient.readContract({
      address: contractAddress,
      abi: proofRegistryAbi,
      functionName: "isRegistered",
      args: [receiptHash],
    });

    if (alreadyRegistered) {
      await updatePaymentEvent(supabase, paymentEventId, {
        onchain_status: "verified",
      });
      return;
    }

    const { request: writeRequest } = await publicClient.simulateContract({
      account,
      address: contractAddress,
      abi: proofRegistryAbi,
      functionName: "registerProof",
      args: [
        receiptHash,
        serviceHash,
        getAddress(buyer),
        getAddress(seller),
        amount,
        requestHash,
        responseHash,
      ],
    });
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(rpcUrl()),
    });

    transactionHash = await walletClient.writeContract(writeRequest);
    await updatePaymentEvent(supabase, paymentEventId, {
      onchain_tx_hash: transactionHash,
      onchain_status: "pending",
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    if (receipt.status !== "success") {
      throw new Error(`Proof transaction ${transactionHash} reverted`);
    }

    await updatePaymentEvent(supabase, paymentEventId, {
      onchain_tx_hash: transactionHash,
      onchain_status: "verified",
    });
  } catch (error) {
    console.error(
      `[proof-registry] Proof attestation failed for receipt ${paymentEventId}: ${safeErrorMessage(error)}`,
    );
    await markOnchainProofFailed(supabase, paymentEventId);
  }
}

export function onchainProofMetadataFromRow(row: {
  receipt_hash: string | null;
  service_hash: string | null;
  request_hash: string | null;
  response_hash: string | null;
  onchain_contract_address: string | null;
  onchain_chain_id: number | string | null;
  onchain_tx_hash: string | null;
  onchain_status: string | null;
}): OnchainProofMetadata | null {
  if (
    row.onchain_status !== "pending" &&
    row.onchain_status !== "verified" &&
    row.onchain_status !== "failed"
  ) {
    return null;
  }

  const contractAddress =
    row.onchain_contract_address && isAddress(row.onchain_contract_address)
      ? getAddress(row.onchain_contract_address)
      : null;
  const numericChainId = Number(row.onchain_chain_id);

  return {
    status: row.onchain_status,
    receiptHash: bytes32(row.receipt_hash),
    serviceHash: bytes32(row.service_hash),
    requestHash: bytes32(row.request_hash),
    responseHash: bytes32(row.response_hash),
    contractAddress,
    chainId: Number.isInteger(numericChainId) ? numericChainId : null,
    transactionHash: bytes32(row.onchain_tx_hash),
  };
}

export async function readAgentCommerceProof(
  metadata: OnchainProofMetadata,
): Promise<AgentCommerceProof | null> {
  if (
    !metadata.receiptHash ||
    !metadata.contractAddress ||
    metadata.chainId !== ARC_TESTNET_CHAIN_ID
  ) {
    return null;
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl()),
  });
  const observedChainId = await publicClient.getChainId();
  if (observedChainId !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(
      `Arc RPC returned chain ${observedChainId}; expected ${ARC_TESTNET_CHAIN_ID}`,
    );
  }

  const registered = await publicClient.readContract({
    address: metadata.contractAddress,
    abi: proofRegistryAbi,
    functionName: "isRegistered",
    args: [metadata.receiptHash],
  });
  if (!registered) return null;

  const [serviceHash, buyer, seller, amount, requestHash, responseHash, timestamp] =
    await publicClient.readContract({
      address: metadata.contractAddress,
      abi: proofRegistryAbi,
      functionName: "getProof",
      args: [metadata.receiptHash],
    });

  return {
    receiptHash: metadata.receiptHash,
    serviceHash,
    buyer,
    seller,
    amountAtomic: amount.toString(),
    requestHash,
    responseHash,
    timestamp: Number(timestamp),
  };
}
