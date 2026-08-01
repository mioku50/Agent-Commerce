/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { ARC_TESTNET_USDC_ADDRESS } from "../wallet/arc.ts";
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

  const CHUNK_SIZE = BigInt(10000);

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
  dataTruncated: boolean
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

    for (const tx of transfers) {
      if (tx.blockNumber >= minBlock) {
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
        timestamp: "", // Block timestamp not available from getLogs; filled during report rendering if needed
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
    firstTransferAt: null,
    lastTransferAt: null,
    blocksScanned,
    dataTruncated,
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

import { createPublicClient, http } from "viem";
import { arcTestnetChain } from "../wallet/arc.ts";

export async function analyzeTreasuryHealth(walletAddress: string, scanDays: number = 180): Promise<TreasuryAnalytics> {
  const client = createPublicClient({
    chain: arcTestnetChain,
    transport: http(),
  });

  const latestBlock = await client.getBlockNumber();
  const blocksToScan = BigInt(scanDays * 43200);
  const fromBlock = latestBlock > blocksToScan ? latestBlock - blocksToScan : BigInt(0);

  const { transfers, dataTruncated } = await fetchUsdcTransfers(
    walletAddress,
    fromBlock,
    latestBlock,
    client
  );

  const balanceWei = (await client.readContract({
    address: ARC_TESTNET_USDC_ADDRESS as `0x${string}`,
    abi: [parseAbiItem("function balanceOf(address account) view returns (uint256)")],
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  })) as bigint;
  const currentBalanceUsdc = Number(balanceWei) / 1e6;

  const blocksScanned = Number(latestBlock - fromBlock);

  return analyzeTreasury(
    transfers,
    walletAddress,
    currentBalanceUsdc,
    blocksScanned,
    dataTruncated
  );
}
