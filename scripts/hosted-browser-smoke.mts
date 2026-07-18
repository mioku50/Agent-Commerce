/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { chromium, type Request } from "playwright";

type HostedStatus = {
  job: {
    id: string;
    status: "queued" | "running" | "completed" | "failed";
    spentUsdc: string;
    error: string | null;
  };
  receiptIds: string[];
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  confirmPaidRun();
  const url = baseUrl();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
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
    const launchResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/hosted-agent/jobs",
    );
    await page.getByRole("button", { name: "Run live demo agent" }).click();
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

    const deadline = Date.now() + 240_000;
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
      if (status.job.status === "completed" && status.proof?.status === "verified") {
        break;
      }
      await sleep(1_500);
    }

    assert(status?.job.status === "completed", "Hosted browser job did not complete in time.");
    assert(status.proof?.status === "verified", "Hosted proof was not Verified on Arc in time.");
    assert(status.receiptIds.length > 0, "Hosted browser job created no receipt.");
    assert(status.links.agentRun && status.links.receipt && status.links.passport, "Hosted result links are incomplete.");
    assert(status.links.proofTransaction, "Hosted result has no Arc proof transaction link.");

    await page.getByRole("link", { name: "Verified Arc proof" }).waitFor();
    const beforeRepeat = {
      jobId: status.job.id,
      receiptIds: [...status.receiptIds],
      transactionHash: status.proof.transactionHash,
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
      afterRepeat.proof?.transactionHash === beforeRepeat.transactionHash,
      "Repeated launch changed the onchain proof transaction.",
    );

    console.log(
      JSON.stringify(
        {
          browserTriggered: true,
          idempotencyReplayPassed: true,
          jobId: status.job.id,
          spentUsdc: status.job.spentUsdc,
          receiptId: status.receiptIds[0],
          proofTransaction: status.proof.transactionHash,
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
