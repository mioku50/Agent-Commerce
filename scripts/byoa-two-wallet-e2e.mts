import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET_CHAIN_ID, arcTestnetChain } from "../lib/wallet/arc.ts";

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (argument?.split("=", 2)[1] ?? "http://localhost:3000").replace(/\/$/, "");
}


async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = baseUrl();
  console.log(`[byoa-two-wallet-e2e] Running two-wallet Playwright test against ${url}`);

  // Create two distinct EVM accounts
  const ownerAccount = privateKeyToAccount(generatePrivateKey());
  const agentAccount = privateKeyToAccount(generatePrivateKey());

  assert.notEqual(
    ownerAccount.address.toLowerCase(),
    agentAccount.address.toLowerCase(),
    "Owner and Agent wallets must be distinct for the two-wallet flow test.",
  );

  console.log(`[byoa-two-wallet-e2e] Owner Wallet: ${ownerAccount.address}`);
  console.log(`[byoa-two-wallet-e2e] Agent Wallet: ${agentAccount.address}`);

  let activeAccount = ownerAccount;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Expose mock window.ethereum EIP-1193 handler allowing dynamic account switching
  await page.exposeFunction("__arcWalletRequest", async (args: { method: string; params?: unknown[] }) => {
    const method = args.method;
    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      return [activeAccount.address];
    }
    if (method === "eth_chainId") {
      return "0x4cef52"; // 5042002 in hex
    }
    if (method === "personal_sign") {
      const hexMsg = args.params?.[0] as Hex;
      const message = Buffer.from(hexMsg.slice(2), "hex").toString("utf-8");
      return await activeAccount.signMessage({ message });
    }
    if (method === "eth_signTypedData_v4") {
      const typedDataString = args.params?.[1] as string;
      const parsed = JSON.parse(typedDataString);
      return await activeAccount.signTypedData(parsed);
    }
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
      return null;
    }
    throw new Error(`Unhandled mock RPC method: ${method}`);
  });

  await page.addInitScript(() => {
    const listeners: Record<string, Function[]> = {};
    (window as any).__emitAccountsChanged = (accounts: string[]) => {
      const cbs = listeners["accountsChanged"] || [];
      for (const cb of cbs) {
        try { cb(accounts); } catch { /* ignore listener error */ }
      }
    };
    (window as any).ethereum = {
      isMetaMask: true,
      request: (args: any) => (window as any).__arcWalletRequest(args),
      on: (event: string, fn: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      removeListener: (event: string, fn: Function) => {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter((cb) => cb !== fn);
      },
    };
  });

  try {
    // 1. Navigate to /my-agents
    console.log("[byoa-two-wallet-e2e] 1. Navigating to /my-agents...");
    await page.goto(`${url}/my-agents`, { waitUntil: "networkidle" });

    const isClosed = await page.getByText("BYOA canary is closed.", { exact: false }).isVisible().catch(() => false);
    const hasStep1 = await page.getByText("Step 1 — Verify Owner Session", { exact: false }).isVisible().catch(() => false);

    if (isClosed || !hasStep1) {
      console.log("[byoa-two-wallet-e2e] Canary notice: BYOA canary feature flag is closed or unconfigured on target server.");
      return;
    }


    // 2. Verify Owner Session with Owner Wallet
    console.log("[byoa-two-wallet-e2e] 2. Verifying Owner Wallet signature...");
    activeAccount = ownerAccount;
    await page.evaluate((addr) => (window as any).__emitAccountsChanged([addr]), ownerAccount.address);
    await page.getByRole("button", { name: "Verify Owner Signature" }).click();
    await page.getByText(`Verified Owner Session: ${ownerAccount.address.slice(0, 7)}`, { exact: false }).waitFor();

    // 3. Register a DIFFERENT External Agent Wallet
    console.log("[byoa-two-wallet-e2e] 3. Registering distinct external agent wallet...");
    await page.locator("#agent-name").fill("Two-Wallet E2E Agent");
    await page.locator("#agent-wallet").fill(agentAccount.address);
    await page.getByRole("button", { name: "Register External Agent" }).click();

    await page.getByText("Two-Wallet E2E Agent").waitFor();
    await page.getByText(agentAccount.address).waitFor();

    // 4. Switch browser wallet to Agent Wallet and dispatch accountsChanged
    console.log("[byoa-two-wallet-e2e] 4. Switching browser wallet to Agent Wallet for binding & emitting accountsChanged...");
    activeAccount = agentAccount;
    await page.evaluate((addr) => (window as any).__emitAccountsChanged([addr]), agentAccount.address);


    await page.getByRole("button", { name: "Create Activation Challenge" }).click();
    await page.getByRole("button", { name: "Sign with Connected Agent Wallet" }).click();
    await page.getByRole("button", { name: "Verify Signature & Activate Wallet" }).click();

    await page.getByText("wallet verified", { exact: false }).waitFor();

    // 5. Configure Policy & Issue Credential
    console.log("[byoa-two-wallet-e2e] 5. Setting policy & issuing API credential...");
    await page.getByRole("button", { name: "Save Policy" }).click();
    await page.getByRole("button", { name: "Issue New Scoped Credential" }).click();
    await page.getByText("API Credential (Displayed Once)").waitFor();

    // 6. Test Console Execution: Sign & Run Workflow with Agent Wallet
    console.log("[byoa-two-wallet-e2e] 6. Signing & running workflow with Agent Wallet...");
    await page.getByRole("button", { name: "Sign and Run Workflow" }).click();

    // Wait for completion result panel
    console.log("[byoa-two-wallet-e2e] 7. Polling workflow completion & proofs...");
    await page.getByText("Execution Result & Proof Trail", { exact: false }).waitFor({ timeout: 120_000 });
    await page.getByText("completed", { exact: false }).waitFor();

    // 7. Test Idempotency Replay
    console.log("[byoa-two-wallet-e2e] 8. Testing idempotency replay...");
    await page.getByRole("button", { name: "Replay with Same Idempotency Key" }).click();
    await page.getByText("Idempotency Replay Verified:", { exact: false }).waitFor();
    await page.getByText("No duplicate payment").waitFor();

    console.log("[byoa-two-wallet-e2e] SUCCESS: Two-wallet BYOA flow passed end-to-end!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[byoa-two-wallet-e2e] FAILED:", err);
  process.exit(1);
});
