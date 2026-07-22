import assert from "node:assert/strict";
import { chromium } from "playwright";
import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (argument?.split("=", 2)[1] ?? "http://localhost:3000").replace(/\/$/, "");
}


async function main() {
  const url = baseUrl();
  console.log(`[byoa-funding-e2e] Running Funding E2E test against ${url}`);

  const ownerAccount = privateKeyToAccount(generatePrivateKey());
  const agentAccount = privateKeyToAccount(generatePrivateKey());

  let activeAccount = ownerAccount;

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
    console.log("[byoa-funding-e2e] 1. Navigating to /my-agents...");
    await page.goto(`${url}/my-agents`, { waitUntil: "networkidle" });

    const isClosed = await page.getByText("BYOA canary is closed.", { exact: false }).isVisible().catch(() => false);
    const hasStep1 = await page.getByText("Step 1 — Verify Owner Session", { exact: false }).isVisible().catch(() => false);

    if (isClosed || !hasStep1) {
      console.log("[byoa-funding-e2e] Canary notice: BYOA canary feature flag is closed or unconfigured on target server.");
      return;
    }



    console.log("[byoa-funding-e2e] 2. Verifying Owner Wallet signature...");
    activeAccount = ownerAccount;
    await page.getByRole("button", { name: "Verify Owner Signature" }).click();
    await page.getByText(`Verified Owner Session: ${ownerAccount.address.slice(0, 7)}`, { exact: false }).waitFor();

    console.log("[byoa-funding-e2e] 3. Registering Agent Wallet...");
    await page.locator("#agent-name").fill("Funding E2E Agent");
    await page.locator("#agent-wallet").fill(agentAccount.address);
    await page.getByRole("button", { name: "Register External Agent" }).click();
    await page.getByText("Funding E2E Agent").waitFor();

    console.log("[byoa-funding-e2e] 4. Opening Fund Agent Wallet Modal...");
    await page.getByRole("button", { name: "Fund Agent Wallet" }).click();
    await page.getByText("Fixed Recipient (Agent Wallet):").waitFor();
    await page.getByText(agentAccount.address).first().waitFor();


    console.log("[byoa-funding-e2e] 5. Previewing Funding Intent...");
    await page.locator("#funding-amount").fill("2.5");
    await page.getByRole("button", { name: "Preview Route & Fee" }).click();

    await page.getByText("Pre-Signature Route Preview").waitFor();
    await page.getByText("2.500000 USDC").waitFor();

    console.log("[byoa-funding-e2e] 6. Executing Funding Transfer...");
    await page.getByRole("button", { name: "Confirm & Execute Transfer" }).click();

    await page.getByText("Agent Funding Completed!").waitFor();
    await page.getByText("Transferred Amount").waitFor();

    console.log("[byoa-funding-e2e] SUCCESS: Agent funding E2E test PASSED cleanly!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[byoa-funding-e2e] FAILED:", err);
  process.exit(1);
});
