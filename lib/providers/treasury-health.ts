/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PublicClient } from "viem";
import { createPublicClient, getAddress, http, isAddress, parseAbiItem } from "viem";
import {
  ARC_TESTNET_USDC_ADDRESS,
  arcTestnetChain,
} from "../wallet/arc.ts";
import type {
  UsdcTransfer,
  TreasuryAnalytics,
  TreasuryPeriodMetrics,
  RecurringPayment,
  AnomalousTransfer,
} from "./treasury-health-types.ts";

export async function fetchUsdcTransfers(
  walletAddress: string,
  fromBlock: bigint,
  toBlock: bigint,
  client: PublicClient
): Promise<{ transfers: UsdcTransfer[]; dataTruncated: boolean }> {
  const transfers: UsdcTransfer[] = [];
  let dataTruncated = false;

  const eventAbi = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  );

  // Arc produces sub-second blocks. Keep historical RPC backfills narrow so a
  // shared node never receives an unbounded eth_getLogs range.
  const CHUNK_SIZE = BigInt(1000);

  for (let currentFrom = fromBlock; currentFrom <= toBlock; currentFrom += CHUNK_SIZE) {
    if (transfers.length >= 50000) {
      dataTruncated = true;
      break;
    }
    const currentTo =
      currentFrom + CHUNK_SIZE - BigInt(1) > toBlock
        ? toBlock
        : currentFrom + CHUNK_SIZE - BigInt(1);

    const logsFrom = await client.getLogs({
      address: ARC_TESTNET_USDC_ADDRESS as `0x${string}`,
      event: eventAbi,
      args: { from: walletAddress as `0x${string}` },
      fromBlock: currentFrom,
      toBlock: currentTo,
    });

    const logsTo = await client.getLogs({
      address: ARC_TESTNET_USDC_ADDRESS as `0x${string}`,
      event: eventAbi,
      args: { to: walletAddress as `0x${string}` },
      fromBlock: currentFrom,
      toBlock: currentTo,
    });

    const combined = [...logsFrom, ...logsTo].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return Number(a.blockNumber! - b.blockNumber!);
      }
      return a.transactionIndex! - b.transactionIndex!;
    });

    const unique = [];
    const seen = new Set();
    for (const log of combined) {
      const key = `${log.transactionHash}-${log.logIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(log);
      }
    }

    for (const log of unique) {
      if (transfers.length >= 50000) {
        dataTruncated = true;
        break;
      }
      transfers.push({
        blockNumber: log.blockNumber!,
        transactionHash: log.transactionHash!,
        from: log.args.from!.toLowerCase(),
        to: log.args.to!.toLowerCase(),
        value: log.args.value!,
      });
    }
  }

  return { transfers, dataTruncated };
}

export function analyzeTreasury(
  transfers: UsdcTransfer[],
  walletAddress: string,
  currentBalanceUsdc: number,
  blocksScanned: number,
  dataTruncated: boolean,
  observationEndMs: number = Date.now(),
  observationWindowDays: number = 180,
  dataSource: string = "Arc JSON-RPC",
): TreasuryAnalytics {
  const normWallet = walletAddress.toLowerCase();
  let totalIn = 0;
  let totalOut = 0;
  const counterparties = new Set<string>();

  const recipientTotals = new Map<string, { totalUsdc: number; txCount: number }>();

  for (const tx of transfers) {
    const val = Number(tx.value) / 1e6;
    if (tx.to === normWallet && tx.from !== normWallet) {
      totalIn += val;
      counterparties.add(tx.from);
    } else if (tx.from === normWallet && tx.to !== normWallet) {
      totalOut += val;
      counterparties.add(tx.to);
      const rec = recipientTotals.get(tx.to) || { totalUsdc: 0, txCount: 0 };
      rec.totalUsdc += val;
      rec.txCount += 1;
      recipientTotals.set(tx.to, rec);
    }
  }

  let hhi = 0;
  let topShare = 0;
  if (totalOut > 0) {
    let top = 0;
    for (const rec of recipientTotals.values()) {
      const share = rec.totalUsdc / totalOut;
      hhi += (share * 100) ** 2;
      if (share > top) top = share;
    }
    topShare = top;
  }
  let concLevel: "low" | "moderate" | "high" | "critical" = "low";
  if (hhi > 2500) concLevel = "high";
  else if (hhi > 1500) concLevel = "moderate";
  if (topShare > 0.8) concLevel = "critical";

  const maxBlock =
    transfers.length > 0
      ? transfers.reduce((max, t) => (t.blockNumber > max ? t.blockNumber : max), BigInt(0))
      : BigInt(0);

  const getPeriodMetrics = (days: number): TreasuryPeriodMetrics => {
    const blocksInWindow = BigInt(days * 43200); // 1 day = 86400 / 2 = 43200 blocks
    const minBlock = maxBlock > blocksInWindow ? maxBlock - blocksInWindow : BigInt(0);

    let wIn = 0;
    let wOut = 0;
    let wCount = 0;

    const timestampCutoff = observationEndMs - days * 86_400_000;
    const hasTimestampedHistory = transfers.every(
      (transfer) =>
        typeof transfer.timestamp === "string" &&
        Number.isFinite(Date.parse(transfer.timestamp)),
    );

    for (const tx of transfers) {
      const inWindow = hasTimestampedHistory
        ? Date.parse(tx.timestamp!) >= timestampCutoff
        : tx.blockNumber >= minBlock;
      if (inWindow) {
        wCount++;
        const val = Number(tx.value) / 1e6;
        if (tx.to === normWallet) wIn += val;
        if (tx.from === normWallet) wOut += val;
      }
    }

    return {
      windowDays: days,
      inboundUsdc: wIn,
      outboundUsdc: wOut,
      netFlowUsdc: wIn - wOut,
      transferCount: wCount,
      avgDailyBurnUsdc: days > 0 ? wOut / days : 0,
    };
  };

  const p7 = getPeriodMetrics(7);
  const p30 = getPeriodMetrics(30);
  const p90 = getPeriodMetrics(90);

  const burnRateChange =
    p30.avgDailyBurnUsdc === 0
      ? 0
      : ((p7.avgDailyBurnUsdc - p30.avgDailyBurnUsdc) / p30.avgDailyBurnUsdc) * 100;
  let trendDirection: "increasing" | "stable" | "decreasing" = "stable";
  if (burnRateChange > 10) trendDirection = "increasing";
  else if (burnRateChange < -10) trendDirection = "decreasing";

  const runway = p30.avgDailyBurnUsdc > 0 ? currentBalanceUsdc / p30.avgDailyBurnUsdc : 9999;

  const recurring: RecurringPayment[] = [];
  for (const [rec, data] of recipientTotals.entries()) {
    if (data.txCount >= 3) {
      recurring.push({
        counterparty: rec,
        avgAmountUsdc: data.totalUsdc / data.txCount,
        frequency: "regular",
        occurrences: data.txCount,
      });
    }
  }

  const anomalies: AnomalousTransfer[] = [];
  const avgOut = recipientTotals.size > 0 ? totalOut / recipientTotals.size : 0;
  for (const tx of transfers) {
    const val = Number(tx.value) / 1e6;
    if (tx.from === normWallet && val > avgOut * 5 && val > 1000) {
      anomalies.push({
        txHash: tx.transactionHash,
        amountUsdc: val,
        direction: "outbound",
        reason: "Unusually large outbound transfer",
        timestamp: tx.timestamp ?? "",
      });
    }
  }

  const sortedRecipients = Array.from(recipientTotals.entries())
    .map(([addr, data]) => ({
      address: addr,
      totalUsdc: data.totalUsdc,
      percentage: totalOut > 0 ? (data.totalUsdc / totalOut) * 100 : 0,
      txCount: data.txCount,
    }))
    .sort((a, b) => b.totalUsdc - a.totalUsdc);

  const topRecipients = sortedRecipients.slice(0, 5);
  const otherRecipients = sortedRecipients.slice(5);

  const timestamps = transfers
    .map((transfer) => transfer.timestamp)
    .filter((value): value is string =>
      typeof value === "string" && Number.isFinite(Date.parse(value)),
    )
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  return {
    walletAddress: normWallet,
    totalInboundUsdc: totalIn,
    totalOutboundUsdc: totalOut,
    netFlowUsdc: totalIn - totalOut,
    transferCount: transfers.length,
    uniqueCounterparties: counterparties.size,
    periods: [p7, p30, p90],
    identifiedAgentPayments: 0,
    totalAgentSpendUsdc: 0,
    agentRecipients: [],
    topRecipients,
    otherRecipientsCount: otherRecipients.length,
    otherRecipientsUsdc: otherRecipients.reduce((sum, r) => sum + r.totalUsdc, 0),
    herfindahlIndex: hhi,
    concentrationLevel: concLevel,
    topCounterpartyShare: topShare,
    recurringPayments: recurring,
    currentDailyBurnUsdc: p7.avgDailyBurnUsdc,
    previousDailyBurnUsdc: p30.avgDailyBurnUsdc,
    burnRateChangePercent: burnRateChange,
    trendDirection,
    anomalousTransfers: anomalies,
    currentBalanceUsdc,
    estimatedRunwayDays: runway,
    firstTransferAt: timestamps[0] ?? null,
    lastTransferAt: timestamps.at(-1) ?? null,
    blocksScanned,
    dataTruncated,
    observationWindowDays,
    dataSource,
  };
}

export function calculateTreasuryHealthScore(analytics: TreasuryAnalytics) {
  if (analytics.transferCount === 0) {
    return {
      overallScore: null,
      confidence: "low" as const,
      breakdown: {
        liquidityScore: null,
        burnRateStabilityScore: null,
        counterpartyDiversificationScore: null,
        inflowOutflowBalanceScore: null,
        anomalyAbsenceScore: null,
        recurringPaymentRegularityScore: null,
      },
    };
  }

  let liquidityScore = Math.min(100, Math.max(0, (analytics.estimatedRunwayDays / 180) * 100));
  if (analytics.estimatedRunwayDays > 180) liquidityScore = 100;

  let burnRateStabilityScore = 100 - Math.min(100, Math.abs(analytics.burnRateChangePercent));

  let counterpartyDiversificationScore = 100;
  if (analytics.concentrationLevel === "critical") counterpartyDiversificationScore = 20;
  else if (analytics.concentrationLevel === "high") counterpartyDiversificationScore = 50;
  else if (analytics.concentrationLevel === "moderate") counterpartyDiversificationScore = 80;

  let inflowOutflowBalanceScore = 50;
  if (analytics.netFlowUsdc > 0) inflowOutflowBalanceScore = 100;
  else if (analytics.netFlowUsdc > -1000) inflowOutflowBalanceScore = 75;
  else inflowOutflowBalanceScore = 30;

  let anomalyAbsenceScore = 100 - analytics.anomalousTransfers.length * 20;
  if (anomalyAbsenceScore < 0) anomalyAbsenceScore = 0;

  let recurringPaymentRegularityScore = Math.min(
    100,
    analytics.recurringPayments.length * 20 + 50
  );

  const overall =
    liquidityScore * 0.2 +
    burnRateStabilityScore * 0.2 +
    counterpartyDiversificationScore * 0.15 +
    inflowOutflowBalanceScore * 0.15 +
    anomalyAbsenceScore * 0.15 +
    recurringPaymentRegularityScore * 0.15;

  const conf =
    analytics.transferCount >= 100
      ? "high"
      : analytics.transferCount >= 10
      ? "medium"
      : "low";

  return {
    overallScore: Math.round(overall),
    confidence: conf as "high" | "medium" | "low",
    breakdown: {
      liquidityScore: Math.round(liquidityScore),
      burnRateStabilityScore: Math.round(burnRateStabilityScore),
      counterpartyDiversificationScore: Math.round(counterpartyDiversificationScore),
      inflowOutflowBalanceScore: Math.round(inflowOutflowBalanceScore),
      anomalyAbsenceScore: Math.round(anomalyAbsenceScore),
      recurringPaymentRegularityScore: Math.round(recurringPaymentRegularityScore),
    },
  };
}

const TREASURY_HISTORY_PROVIDER = "arcscan_blockscout";
const TREASURY_BALANCE_PROVIDER = "arc_json_rpc";
const ARC_BLOCKSCOUT_API_ORIGIN = "https://testnet.arcscan.app";
const TREASURY_PUBLIC_REASON =
  "Treasury data could not be collected from the configured provider.";

export type TreasuryProviderName =
  | typeof TREASURY_HISTORY_PROVIDER
  | typeof TREASURY_BALANCE_PROVIDER
  | "treasury_input";

export class TreasuryProviderError extends Error {
  constructor(
    readonly internalErrorCode:
      | "invalid_wallet"
      | "unsupported_network"
      | "missing_input"
      | "policy_denial"
      | "treasury_provider_unavailable"
      | "treasury_provider_malformed_response",
    readonly provider: TreasuryProviderName,
    readonly retryable: boolean,
    readonly httpStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "TreasuryProviderError";
  }
}

export type TreasuryAttemptTelemetry = {
  attempt: number;
  provider: TreasuryProviderName;
  errorCode: string | null;
  retryable: boolean;
  durationMs: number;
};

export class TreasuryHealthExecutionError extends Error {
  constructor(
    readonly failure: TreasuryProviderError,
    readonly attempts: TreasuryAttemptTelemetry[],
    readonly durationMs: number,
  ) {
    super(TREASURY_PUBLIC_REASON);
    this.name = "TreasuryHealthExecutionError";
  }
}

type BlockscoutTransfer = {
  blockNumber?: string;
  hash?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  contractAddress?: string;
  tokenDecimal?: string;
  value?: string;
};

type BlockscoutTransferPage = {
  status?: string;
  message?: string;
  result?: BlockscoutTransfer[] | string;
};

function nestedHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const direct = Number(record.status ?? record.statusCode);
  if (Number.isInteger(direct) && direct >= 100 && direct <= 599) return direct;
  return nestedHttpStatus(record.cause);
}

function errorTokens(error: unknown, values: string[] = []): string[] {
  if (!error || values.length > 20) return values;
  if (error instanceof Error) {
    values.push(error.name, error.message);
    errorTokens((error as Error & { cause?: unknown }).cause, values);
  } else if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["name", "code", "message", "details"]) {
      if (record[key] !== undefined) values.push(String(record[key]));
    }
    errorTokens(record.cause, values);
  }
  return values;
}

export function normalizeTreasuryProviderError(
  error: unknown,
  provider: TreasuryProviderName,
) {
  if (error instanceof TreasuryProviderError) return error;
  if (error instanceof TreasuryHealthExecutionError) return error.failure;
  const status = nestedHttpStatus(error);
  const tokens = errorTokens(error).join(" ").toLowerCase();
  const retryable =
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    [
      "aborted",
      "econnreset",
      "etimedout",
      "fetch failed",
      "headers timeout",
      "rate limit",
      "socket hang up",
      "temporarily unavailable",
      "timed out",
      "timeout",
    ].some((token) => tokens.includes(token));
  return new TreasuryProviderError(
    retryable
      ? "treasury_provider_unavailable"
      : "treasury_provider_malformed_response",
    provider,
    retryable,
    status,
    TREASURY_PUBLIC_REASON,
  );
}

function assertBlockscoutTransfer(value: BlockscoutTransfer): UsdcTransfer | null {
  const tokenAddress = value.contractAddress;
  if (
    typeof tokenAddress !== "string" ||
    tokenAddress.toLowerCase() !== ARC_TESTNET_USDC_ADDRESS.toLowerCase()
  ) return null;
  const from = value.from;
  const to = value.to;
  const transactionHash = value.hash;
  const timestampSeconds = String(value.timeStamp ?? "");
  const blockNumber = String(value.blockNumber ?? "");
  const rawValue = value.value;
  const decimals = Number(value.tokenDecimal);
  if (
    !from ||
    !to ||
    !isAddress(from) ||
    !isAddress(to) ||
    typeof transactionHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(transactionHash) ||
    !/^\d+$/.test(timestampSeconds) ||
    !/^\d+$/.test(blockNumber) ||
    typeof rawValue !== "string" ||
    !/^\d+$/.test(rawValue) ||
    decimals !== 6
  ) {
    throw new TreasuryProviderError(
      "treasury_provider_malformed_response",
      TREASURY_HISTORY_PROVIDER,
      false,
      null,
      "The treasury history provider returned an invalid transfer record.",
    );
  }
  return {
    blockNumber: BigInt(blockNumber),
    transactionHash,
    from: getAddress(from).toLowerCase(),
    to: getAddress(to).toLowerCase(),
    value: BigInt(rawValue),
    timestamp: new Date(Number(timestampSeconds) * 1_000).toISOString(),
  };
}

async function fetchBlockscoutUsdcTransfers(input: {
  walletAddress: string;
  scanDays: number;
  latestBlock: bigint;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  nowMs: number;
  maxTransfers?: number;
}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const cutoffMs = input.nowMs - input.scanDays * 86_400_000;
  const maxTransfers = input.maxTransfers ?? 50_000;
  const transfers: UsdcTransfer[] = [];
  let dataTruncated = false;
  let reachedCutoff = false;
  let queryCount = 0;
  // 200k blocks/day is a conservative envelope around Arc's documented
  // ~0.48-second block time. Timestamp filtering enforces the exact window.
  const totalWindowBlocks = BigInt(input.scanDays * 200_000);
  const startBlock = input.latestBlock > totalWindowBlocks
    ? input.latestBlock - totalWindowBlocks
    : BigInt(0);
  const initialRangeSize = BigInt(30 * 200_000);
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let toBlock = input.latestBlock; toBlock >= startBlock;) {
    const fromBlock = toBlock - startBlock + BigInt(1) > initialRangeSize
      ? toBlock - initialRangeSize + BigInt(1)
      : startBlock;
    ranges.push({ fromBlock, toBlock });
    if (fromBlock === BigInt(0) || fromBlock === startBlock) break;
    toBlock = fromBlock - BigInt(1);
  }

  while (ranges.length > 0 && !dataTruncated && transfers.length < maxTransfers) {
    input.signal?.throwIfAborted();
    const range = ranges.shift()!;
    const url = new URL("/api", ARC_BLOCKSCOUT_API_ORIGIN);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("contractaddress", ARC_TESTNET_USDC_ADDRESS);
    url.searchParams.set("address", getAddress(input.walletAddress));
    url.searchParams.set("startblock", range.fromBlock.toString());
    url.searchParams.set("endblock", range.toBlock.toString());
    url.searchParams.set("page", "1");
    url.searchParams.set("offset", "10000");
    url.searchParams.set("sort", "desc");
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: input.signal,
      });
    } catch (error) {
      throw normalizeTreasuryProviderError(error, TREASURY_HISTORY_PROVIDER);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      throw new TreasuryProviderError(
        retryable
          ? "treasury_provider_unavailable"
          : response.status === 403
            ? "policy_denial"
            : "treasury_provider_malformed_response",
        TREASURY_HISTORY_PROVIDER,
        retryable,
        response.status,
        TREASURY_PUBLIC_REASON,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TreasuryProviderError(
        "treasury_provider_malformed_response",
        TREASURY_HISTORY_PROVIDER,
        false,
        response.status,
        "The treasury history provider returned malformed JSON.",
      );
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      !("result" in payload)
    ) {
      throw new TreasuryProviderError(
        "treasury_provider_malformed_response",
        TREASURY_HISTORY_PROVIDER,
        false,
        response.status,
        "The treasury history provider returned an invalid response shape.",
      );
    }
    const typed = payload as BlockscoutTransferPage;
    const noTransactions =
      typed.status === "0" &&
      /no transactions found/i.test(String(typed.message ?? typed.result ?? ""));
    if (!Array.isArray(typed.result) && !noTransactions) {
      const providerMessage = String(typed.message ?? typed.result ?? "");
      const retryable = /rate limit|timeout|temporar|unavailable/i.test(providerMessage);
      throw new TreasuryProviderError(
        retryable
          ? "treasury_provider_unavailable"
          : "treasury_provider_malformed_response",
        TREASURY_HISTORY_PROVIDER,
        retryable,
        response.status,
        TREASURY_PUBLIC_REASON,
      );
    }
    const items = Array.isArray(typed.result) ? typed.result : [];
    queryCount += 1;
    if (queryCount > 100) {
      dataTruncated = true;
      break;
    }
    if (items.length === 10_000 && range.toBlock > range.fromBlock) {
      const midpoint = (range.fromBlock + range.toBlock) / BigInt(2);
      ranges.unshift({ fromBlock: range.fromBlock, toBlock: midpoint });
      ranges.unshift({ fromBlock: midpoint + BigInt(1), toBlock: range.toBlock });
      continue;
    }
    for (const item of items) {
      const transfer = assertBlockscoutTransfer(item);
      if (!transfer) continue;
      if (Date.parse(transfer.timestamp!) < cutoffMs) {
        reachedCutoff = true;
        continue;
      }
      transfers.push(transfer);
      if (transfers.length >= maxTransfers) {
        dataTruncated = true;
        break;
      }
    }
    if (items.length === 10_000) dataTruncated = true;
    if (reachedCutoff) break;
  }

  transfers.sort((left, right) =>
    left.blockNumber === right.blockNumber
      ? left.transactionHash.localeCompare(right.transactionHash)
      : left.blockNumber < right.blockNumber ? -1 : 1,
  );
  return {
    transfers,
    dataTruncated,
    blocksScanned: Number(input.latestBlock - startBlock),
  };
}

export type AnalyzeTreasuryHealthOptions = {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  maxTransfers?: number;
};

export async function analyzeTreasuryHealth(
  walletAddress: string,
  scanDays: number = 180,
  options: AnalyzeTreasuryHealthOptions = {},
): Promise<TreasuryAnalytics> {
  if (!walletAddress?.trim()) {
    throw new TreasuryProviderError(
      "missing_input",
      "treasury_input",
      false,
      400,
      "A treasury wallet is required.",
    );
  }
  if (!isAddress(walletAddress)) {
    throw new TreasuryProviderError(
      "invalid_wallet",
      "treasury_input",
      false,
      400,
      "The treasury wallet is invalid.",
    );
  }
  if (!Number.isInteger(scanDays) || scanDays < 1 || scanDays > 365) {
    throw new TreasuryProviderError(
      "policy_denial",
      "treasury_input",
      false,
      400,
      "The treasury observation window is not allowed.",
    );
  }
  const nowMs = (options.now ?? new Date()).getTime();
  const rpcUrl =
    options.rpcUrl?.trim() ||
    process.env.ARC_TESTNET_RPC_URL?.trim() ||
    arcTestnetChain.rpcUrls.default.http[0];
  const client = createPublicClient({
    chain: arcTestnetChain,
    transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }),
  });
  let latestBlock: bigint;
  let balanceWei: bigint;
  try {
    [latestBlock, balanceWei] = await Promise.all([
      client.getBlockNumber(),
      client.readContract({
        address: ARC_TESTNET_USDC_ADDRESS as `0x${string}`,
        abi: [parseAbiItem("function balanceOf(address account) view returns (uint256)")],
        functionName: "balanceOf",
        args: [getAddress(walletAddress)],
      }) as Promise<bigint>,
    ]);
  } catch (error) {
    throw normalizeTreasuryProviderError(error, TREASURY_BALANCE_PROVIDER);
  }
  options.signal?.throwIfAborted();
  const { transfers, dataTruncated, blocksScanned } =
    await fetchBlockscoutUsdcTransfers({
      walletAddress,
      scanDays,
      latestBlock,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
      nowMs,
      maxTransfers: options.maxTransfers,
    });
  return analyzeTreasury(
    transfers,
    getAddress(walletAddress),
    Number(balanceWei) / 1e6,
    blocksScanned,
    dataTruncated,
    nowMs,
    scanDays,
    "Arcscan Blockscout API + Arc JSON-RPC",
  );
}

export async function executeTreasuryHealthWithRetry(input: {
  walletAddress: string;
  scanDays?: number;
  maxAttempts?: number;
  initialDelayMs?: number;
  deadlineMs?: number;
  operation?: (signal: AbortSignal, attempt: number) => Promise<TreasuryAnalytics>;
  sleepImpl?: (durationMs: number) => Promise<void>;
  onAttempt?: (telemetry: TreasuryAttemptTelemetry) => void | Promise<void>;
}) {
  const startedAt = Date.now();
  const maxAttempts = input.maxAttempts ?? 3;
  const initialDelayMs = input.initialDelayMs ?? 500;
  const deadlineMs = input.deadlineMs ?? 120_000;
  const attempts: TreasuryAttemptTelemetry[] = [];
  const sleepImpl = input.sleepImpl ?? ((durationMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("Treasury retry attempts must be between one and three.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const elapsed = Date.now() - startedAt;
    const remaining = deadlineMs - elapsed;
    if (remaining <= 0) {
      const failure = new TreasuryProviderError(
        "treasury_provider_unavailable",
        TREASURY_HISTORY_PROVIDER,
        true,
        null,
        TREASURY_PUBLIC_REASON,
      );
      throw new TreasuryHealthExecutionError(failure, attempts, elapsed);
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Treasury provider attempt timed out.")),
      Math.min(40_000, remaining),
    );
    const attemptStartedAt = Date.now();
    try {
      const analytics = await (input.operation
        ? input.operation(controller.signal, attempt)
        : analyzeTreasuryHealth(input.walletAddress, input.scanDays ?? 180, {
            signal: controller.signal,
          }));
      const telemetry: TreasuryAttemptTelemetry = {
        attempt,
        provider: TREASURY_HISTORY_PROVIDER,
        errorCode: null,
        retryable: false,
        durationMs: Date.now() - attemptStartedAt,
      };
      attempts.push(telemetry);
      await input.onAttempt?.(telemetry);
      return { analytics, attempts, durationMs: Date.now() - startedAt };
    } catch (error) {
      const failure = normalizeTreasuryProviderError(error, TREASURY_HISTORY_PROVIDER);
      const telemetry: TreasuryAttemptTelemetry = {
        attempt,
        provider: failure.provider,
        errorCode: failure.internalErrorCode,
        retryable: failure.retryable,
        durationMs: Date.now() - attemptStartedAt,
      };
      attempts.push(telemetry);
      await input.onAttempt?.(telemetry);
      const delayMs = initialDelayMs * 2 ** (attempt - 1);
      const canRetry =
        failure.retryable &&
        attempt < maxAttempts &&
        Date.now() - startedAt + delayMs < deadlineMs;
      if (!canRetry) {
        throw new TreasuryHealthExecutionError(
          failure,
          attempts,
          Date.now() - startedAt,
        );
      }
      await sleepImpl(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Treasury retry loop ended unexpectedly.");
}
