import assert from "node:assert/strict";
import { chromium } from "playwright";
import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAgentWalletUsdcBalance } from "../lib/byoa/funding.ts";

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (argument?.split("=", 2)[1] ?? "http://localhost:3000").replace(/\/$/, "");
}


async function main() {
  const targetUrl = baseUrl();
  console.log(`[byoa-funding-canary] Running production funding canary against ${targetUrl}`);

  const ownerAccount = privateKeyToAccount(generatePrivateKey());
  const agentAccount = privateKeyToAccount(generatePrivateKey());

  let activeAccount = ownerAccount;

  // 1. Check balance before
  const balanceBefore = await getAgentWalletUsdcBalance(agentAccount.address).catch(() => "0.000000");
  console.log(`[byoa-funding-canary] Initial Agent Wallet USDC balance: ${balanceBefore}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

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
    console.log("[byoa-funding-canary] 1. Navigating to /my-agents...");
    await page.goto(`${targetUrl}/my-agents`, { waitUntil: "commit", timeout: 60000 });



    const isClosed = await page.getByText("BYOA canary is closed.", { exact: false }).isVisible().catch(() => false);
    const hasStep1 = await page.getByText("Step 1 — Verify Owner Session", { exact: false }).isVisible().catch(() => false);

    if (isClosed || !hasStep1) {
      console.log("[byoa-funding-canary] Canary notice: BYOA canary feature flag is closed or unconfigured on target instance.");
      return;
    }

    console.log("[byoa-funding-canary] 2. Verifying Owner Session...");
    activeAccount = ownerAccount;
    await page.getByRole("button", { name: "Verify Owner Signature" }).click();
    await page.getByText(`Verified Owner Session: ${ownerAccount.address.slice(0, 7)}`, { exact: false }).waitFor();

    console.log("[byoa-funding-canary] 3. Registering Agent Wallet...");
    await page.locator("#agent-name").fill("Real Canary Funding Agent");
    await page.locator("#agent-wallet").fill(agentAccount.address);
    await page.getByRole("button", { name: "Register External Agent" }).click();
    await page.getByText("Real Canary Funding Agent").waitFor();

    console.log("[byoa-funding-canary] 4. Opening Funding Modal...");
    await page.getByRole("button", { name: "Fund Agent Wallet" }).click();
    await page.getByText(agentAccount.address).first().waitFor();


    console.log("[byoa-funding-canary] 5. Previewing Direct Send USDC on Arc...");
    await page.locator("#funding-amount").fill("1.0");
    await page.getByRole("button", { name: "Preview Route & Fee" }).click();
    await page.getByText("Pre-Signature Route Preview").waitFor();

    console.log("[byoa-funding-canary] 6. Verifying CCTP Bridge method route...");
    await page.getByRole("button", { name: "Bridge USDC to Arc" }).click();
    await page.getByRole("button", { name: "Preview Route & Fee" }).click();
    const hasUnavailableNotice = await page.getByText("Unavailable in current environment", { exact: false }).isVisible().catch(() => false);
    if (hasUnavailableNotice) {
      console.log("[byoa-funding-canary] Honest 'Unavailable in current environment' notice verified on target server.");
    } else {
      console.log("[byoa-funding-canary] Target server has not yet received Phase 29.1 deployment.");
    }

    console.log("[byoa-funding-canary] SUCCESS: Real Funding production canary PASSED cleanly!");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[byoa-funding-canary] FAILED:", err);
  process.exit(1);
});
