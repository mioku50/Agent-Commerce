/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { chromium, type Request } from "playwright";

type HostedStatus = {
  job: {
    id: string;
    workflowType: string;
    status: "queued" | "running" | "completed" | "failed";
    spentUsdc: string;
    inputPreview: string;
    inputSha256: string;
    inputText?: unknown;
    error: string | null;
    structuredResult: {
      aggregationMode: string;
      summary: string;
      apiResults: Array<{
        serviceSlug: string;
        status: "paid" | "failed";
        amountUsdc: string | null;
        stepId: string | null;
        response: Record<string, unknown> | null;
      }>;
      receiptIds: string[];
      proofTransactionHashes: string[];
      input: { preview: string; sha256: string };
      marketSymbol: "BTC/USD" | "ETH/USD" | "SOL/USD" | null;
    } | null;
  };
  receiptIds: string[];
  proofs: Array<{
    receiptId: string;
    status: "pending" | "verified" | "failed";
    transactionHash: string | null;
  }>;
  proof: {
    status: "pending" | "verified" | "failed";
    transactionHash: string | null;
  } | null;
  links: {
    agentRun: string | null;
    receipt: string | null;
    passport: string | null;
    proofTransaction: string | null;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (
    argument?.split("=", 2)[1] ??
    process.env.BASE_URL ??
    "https://agent-commerce-six.vercel.app"
  ).replace(/\/$/, "");
}

function confirmPaidRun() {
  if (!process.argv.includes("--confirm-paid-run")) {
    throw new Error(
      "This smoke spends Arc Testnet USDC. Re-run with --confirm-paid-run.",
    );
  }
}

function requestedSymbol() {
  const argument = process.argv.find((value) => value.startsWith("--symbol="));
  const symbol = argument?.slice("--symbol=".length).toUpperCase() ?? "BTC/USD";
  if (symbol !== "BTC/USD" && symbol !== "ETH/USD" && symbol !== "SOL/USD") {
    throw new Error("--symbol must be BTC/USD, ETH/USD, or SOL/USD.");
  }
  return symbol;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  confirmPaidRun();
  const url = baseUrl();
  const symbol = requestedSymbol();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const submittedInput =
    `Phase 24 Pyth ${symbol} request: return the current provider-backed price, confidence interval, data publish time, price age, and server fetch time for an Arc builder. Do not invent market analysis.`;
  let idempotencyKey: string | null = null;
  let launchBody: Record<string, unknown> | null = null;

  function captureLaunch(request: Request) {
    if (
      request.method() !== "POST" ||
      new URL(request.url()).pathname !== "/api/hosted-agent/jobs"
    ) {
      return;
    }
    idempotencyKey = request.headers()["idempotency-key"] ?? null;
    launchBody = request.postDataJSON() as Record<string, unknown>;
  }

  page.on("request", captureLaunch);

  try {
    await page.goto(`${url}/agent-runner`, { waitUntil: "networkidle" });
    await page.getByText("Project-owned payer wallet", { exact: true }).waitFor();
    await page.locator("#workflow-type").selectOption("market_context");
    await page.locator("#market-symbol").selectOption(symbol);
    await page.locator("#hosted-input").fill(submittedInput);
    await page.getByRole("button", { name: "Preview plan and cost" }).click();
    await page.getByText("2 paid APIs", { exact: true }).waitFor();
    const launchResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/hosted-agent/jobs",
    );
    await page.getByRole("button", { name: "Run this workflow" }).click();
    const launchResponse = await launchResponsePromise;
    assert(
      launchResponse.status() === 202 || launchResponse.status() === 200,
      `Hosted browser launch returned HTTP ${launchResponse.status()}.`,
    );
    const launch = (await launchResponse.json()) as {
      jobId?: string;
      created?: boolean;
    };
    assert(launch.jobId, "Hosted browser launch returned no job ID.");
    assert(idempotencyKey && launchBody, "Browser idempotency request was not captured.");

    const deadline = Date.now() + 120_000;
    let status: HostedStatus | null = null;
    while (Date.now() < deadline) {
      status = await page.evaluate(async (jobId) => {
        const response = await fetch(`/api/hosted-agent/jobs/${jobId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Status request returned ${response.status}`);
        return (await response.json()) as HostedStatus;
      }, launch.jobId);

      if (status.job.status === "failed") {
        throw new Error(`Hosted browser job failed: ${status.job.error ?? "unknown error"}`);
      }
      if (status.job.status === "completed") {
        break;
      }
      await sleep(1_500);
    }

    assert(status?.job.status === "completed", "Hosted browser job did not complete in time.");
    assert(status.job.workflowType === "market_context", "Hosted browser job used the wrong workflow type.");
    assert(status.job.inputText === undefined, "Hosted status API leaked full workflow input.");
    assert(status.job.inputPreview.includes(`Phase 24 Pyth ${symbol}`), "Safe input preview is missing from the hosted result.");
    assert(/^[0-9a-f]{64}$/.test(status.job.inputSha256), "Hosted input SHA-256 is invalid.");
    assert(status.proofs.length >= 2, "Hosted workflow did not create a proof per paid service.");
    assert(status.receiptIds.length >= 2, "Hosted multi-service workflow created fewer than two receipts.");
    assert(Number(status.job.spentUsdc) === 0.0013, "Hosted multi-service spend was not 0.0013 USDC.");
    assert(status.job.structuredResult?.aggregationMode === "deterministic_structured", "Final Report aggregation mode is incorrect.");
    assert(status.job.structuredResult.input.sha256 === status.job.inputSha256, "Final Report input hash differs from the job metadata.");
    assert(status.job.structuredResult.marketSymbol === symbol, "Final Report did not preserve the selected market symbol.");
    assert(status.job.structuredResult.apiResults.length >= 2, "Final Report is missing API results.");
    assert(status.links.agentRun && status.links.receipt && status.links.passport, "Hosted result links are incomplete.");

    const providerResult = status.job.structuredResult.apiResults.find(
      (result) => result.serviceSlug === "pyth-market-price",
    );
    assert(providerResult?.status === "paid", "Pyth provider service was not paid successfully.");
    assert(providerResult.amountUsdc === "0.001", "Pyth provider paid amount is not 0.001 USDC.");
    assert(providerResult.stepId, "Pyth provider receipt ID is missing.");
    assert(providerResult.response?.provider === "Pyth Network", "Final Report does not identify Pyth Network.");
    assert(providerResult.response.symbol === symbol, "Pyth provider returned the wrong symbol.");
    assert(Number(providerResult.response.price) > 0, "Pyth provider price is not a positive live value.");
    assert(Number(providerResult.response.confidence) >= 0, "Pyth provider confidence is invalid.");
    const confidenceInterval = providerResult.response.confidenceInterval as Record<string, unknown> | undefined;
    assert(Number(confidenceInterval?.low) <= Number(providerResult.response.price), "Pyth confidence interval low bound is invalid.");
    assert(Number(confidenceInterval?.high) >= Number(providerResult.response.price), "Pyth confidence interval high bound is invalid.");
    assert(Number(providerResult.response.priceAgeSeconds) >= 0, "Pyth provider price age is invalid.");
    assert(Number(providerResult.response.priceAgeSeconds) <= 120, "Pyth provider returned stale price metadata.");
    const publishTime = Date.parse(String(providerResult.response.publishTime));
    const fetchedAt = Date.parse(String(providerResult.response.fetchedAt));
    assert(Number.isFinite(publishTime), "Pyth provider publish time is invalid.");
    assert(Number.isFinite(fetchedAt) && fetchedAt >= publishTime, "Pyth provider fetch time is invalid.");
    assert(Date.now() - publishTime < 5 * 60_000, "Pyth provider timestamp is not live.");

    await page.getByText("Final Report", { exact: true }).waitFor();
    const beforeRepeat = {
      jobId: status.job.id,
      receiptIds: [...status.receiptIds],
      transactionHashes: status.proofs.map((proof) => proof.transactionHash),
    };

    const repeated = await page.evaluate(
      async ({ key, body }) => {
        const response = await fetch("/api/hosted-agent/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          body: (await response.json()) as {
            jobId?: string;
            idempotent?: boolean;
          },
        };
      },
      { key: idempotencyKey, body: launchBody },
    );
    assert(repeated.status === 200, `Repeated launch returned HTTP ${repeated.status}.`);
    assert(repeated.body.idempotent === true, "Repeated launch was not marked idempotent.");
    assert(repeated.body.jobId === beforeRepeat.jobId, "Repeated launch returned a different job.");

    const conflict = await page.evaluate(
      async ({ key, body }) => {
        const response = await fetch("/api/hosted-agent/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            ...body,
            inputText: `${String(body.inputText)} Different input must conflict.`,
          }),
        });
        return {
          status: response.status,
          body: (await response.json()) as { reason?: string },
        };
      },
      { key: idempotencyKey, body: launchBody },
    );
    assert(
      conflict.status === 409 && conflict.body.reason === "idempotency_conflict",
      "Idempotency key reuse with changed input did not return a conflict.",
    );

    const afterRepeat = await page.evaluate(async (jobId) => {
      const response = await fetch(`/api/hosted-agent/jobs/${jobId}`, {
        cache: "no-store",
      });
      return (await response.json()) as HostedStatus;
    }, beforeRepeat.jobId);
    assert(
      JSON.stringify(afterRepeat.receiptIds) === JSON.stringify(beforeRepeat.receiptIds),
      "Repeated launch changed the receipt set.",
    );
    assert(
      JSON.stringify(afterRepeat.proofs.map((proof) => proof.transactionHash)) ===
        JSON.stringify(beforeRepeat.transactionHashes),
      "Repeated launch changed the onchain proof transactions.",
    );
    console.log(
      `[hosted-browser-smoke] idempotency replay passed for job=${beforeRepeat.jobId} receipts=${beforeRepeat.receiptIds.length}`,
    );

    const proofDeadline = Date.now() + 180_000;
    status = afterRepeat;
    while (
      Date.now() < proofDeadline &&
      !status.proofs.every((proof) => proof.status === "verified")
    ) {
      await sleep(1_500);
      status = await page.evaluate(async (jobId) => {
        const response = await fetch(`/api/hosted-agent/jobs/${jobId}`, {
          cache: "no-store",
        });
        return (await response.json()) as HostedStatus;
      }, beforeRepeat.jobId);
    }
    assert(status.proofs.every((proof) => proof.status === "verified"), "Every hosted proof was not Verified on Arc in time.");
    assert(status.links.proofTransaction, "Hosted result has no Arc proof transaction link.");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Verified on Arc", { exact: true }).first().waitFor();

    console.log(
      JSON.stringify(
        {
          browserTriggered: true,
          idempotencyReplayPassed: true,
          jobId: status.job.id,
          spentUsdc: status.job.spentUsdc,
          receiptIds: status.receiptIds,
          proofTransactions: status.proofs.map((proof) => proof.transactionHash),
          provider: {
            symbol: providerResult.response.symbol,
            price: providerResult.response.price,
            confidence: providerResult.response.confidence,
            confidenceInterval: providerResult.response.confidenceInterval,
            publishTime: providerResult.response.publishTime,
            fetchedAt: providerResult.response.fetchedAt,
            priceAgeSeconds: providerResult.response.priceAgeSeconds,
            receiptId: providerResult.stepId,
            proofTransaction: status.proofs.find(
              (proof) => proof.receiptId === providerResult.stepId,
            )?.transactionHash ?? null,
          },
          links: status.links,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    `[hosted-browser-smoke] failed: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exitCode = 1;
});
