import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as readline from "node:readline/promises";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
  parseEther,
  parseUnits,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  fetchWithRetry,
  installFetchWithRetry,
  toErrorMessage,
  withRetry,
} from "./lib/agent/fetch-with-retry.ts";
import {
  installPaymentHttpDiagnostics,
  printPaymentHttpDiagnostics,
} from "./lib/agent/payment-http-diagnostics.ts";

type Endpoint = {
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
};

type RunStatus =
  | "created"
  | "preflight"
  | "funding"
  | "funded"
  | "depositing"
  | "deposited"
  | "running"
  | "failed"
  | "stopped";

type RunLog = {
  runId: string;
  createdAt: string;
  updatedAt: string;
  baseUrl: string;
  funderAddress: string;
  ephemeralAgentAddress: string;
  ephemeralAgentPrivateKey: string;
  walletSource: "generated" | "AGENT_PRIVATE_KEY";
  depositAmountUsdc: string;
  targetNetwork: string;
  fundingTxHash: string | null;
  usdcTransferTxHash: string | null;
  depositTxHash: string | null;
  status: RunStatus;
  errors: Array<{
    at: string;
    stage: string;
    message: string;
  }>;
};

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC =
  process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const TARGET_NETWORK = "Arc Testnet (chain ID 5042002)";
const GAS_FUND_AMOUNT = parseEther("0.01");
const RUN_DIR = ".agent-runs";

// --- Parse CLI args ---
function parseArgs() {
  const args = process.argv.slice(2);
  let spendingLimit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const val = parseFloat(args[i + 1]);
      if (Number.isNaN(val) || val <= 0) {
        console.error("--limit must be a positive number (USDC amount)");
        process.exit(1);
      }
      spendingLimit = val;
      i++;
    }
  }

  return { spendingLimit };
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local before running npm run agent.`);
  }
  return value;
}

function requireAddress(name: string) {
  const value = requireEnv(name);
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid 0x EVM address.`);
  }
  return value;
}

function requirePrivateKey(name: string) {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x-prefixed private key.`);
  }
  return value as Hex;
}

function optionalPrivateKey(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x-prefixed private key.`);
  }
  return value as Hex;
}

function parsePositiveAmountEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim() || fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive USDC amount.`);
  }
  return value;
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function parseStrictlyPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = parsePositiveIntegerEnv(name, fallback);
  if (parsed <= 0) {
    throw new Error(`${name} must be greater than 0.`);
  }
  return parsed;
}

function parseBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeBaseUrl(raw: string) {
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    throw new Error("BASE_URL must be a valid URL, for example http://localhost:3000.");
  }
}

function createRunId(date = new Date()) {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

async function writeRunLog(runFilePath: string, runLog: RunLog) {
  runLog.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(runFilePath), { recursive: true });
  await writeFile(runFilePath, `${JSON.stringify(runLog, null, 2)}\n`);
}

async function appendRunError(
  runFilePath: string,
  runLog: RunLog,
  stage: string,
  error: unknown,
) {
  runLog.errors.push({
    at: new Date().toISOString(),
    stage,
    message: toErrorMessage(error),
  });
  await writeRunLog(runFilePath, runLog);
}

function retryCommand(runFilePath: string, spendingLimit: number | null) {
  const limitArgs = spendingLimit === null ? "" : ` -- --limit ${spendingLimit}`;
  return `AGENT_PRIVATE_KEY=$(node -e "console.log(require('./${runFilePath}').ephemeralAgentPrivateKey)") AGENT_SKIP_FUNDING=1 AGENT_SKIP_DEPOSIT=1 npm run agent${limitArgs}`;
}

async function promptForAllowance(totalSpent: number): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "\nSpending limit reached. Enter additional allowance in USDC (or 0 to quit): ",
    );
    const val = parseFloat(answer);
    if (Number.isNaN(val) || val < 0) {
      console.error("Invalid amount. Exiting.");
      process.exit(0);
    }
    if (val === 0) {
      console.log(`Agent stopped. Total spent: ${totalSpent.toFixed(6)} USDC`);
      process.exit(0);
    }
    return val;
  } finally {
    rl.close();
  }
}

// Retry helper for nonce collisions when multiple agents fund from the same wallet concurrently.
// On collision the other agent's tx confirms first, shifting the nonce — a short retry resolves it.
async function withNonceRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = toErrorMessage(err);
      const isNonceError =
        msg.includes("replacement transaction underpriced") ||
        msg.includes("nonce too low") ||
        msg.includes("already known");
      if (!isNonceError || attempt === maxRetries - 1) throw err;
      const delay = 1000 + Math.random() * 2000;
      console.log(`  ${label}: nonce collision, retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const { spendingLimit: initialSpendingLimit } = parseArgs();
  let spendingLimit = initialSpendingLimit;
  let totalSpent = 0;
  let paused = false;
  let index = 0;
  let inFlight = 0;
  let redepositing = false;
  let paymentInterval: ReturnType<typeof setInterval> | null = null;
  let balanceInterval: ReturnType<typeof setInterval> | null = null;
  let shutdownStarted = false;

  const baseUrl = normalizeBaseUrl(requireEnv("BASE_URL"));
  const buyerAddress = requireAddress("BUYER_ADDRESS");
  const sellerAddress = requireAddress("SELLER_ADDRESS");
  const funderKey = requirePrivateKey("BUYER_PRIVATE_KEY");
  const agentKeyFromEnv = optionalPrivateKey("AGENT_PRIVATE_KEY");
  const depositAmount = parsePositiveAmountEnv("AGENT_DEPOSIT_USDC", "1");
  const fetchRetries = parsePositiveIntegerEnv("AGENT_FETCH_RETRIES", 3);
  const fetchTimeoutMs = parsePositiveIntegerEnv("AGENT_FETCH_TIMEOUT_MS", 30_000);
  const maxInFlight = parseStrictlyPositiveIntegerEnv("AGENT_MAX_IN_FLIGHT", 1);
  const postDepositWaitMs = parsePositiveIntegerEnv("AGENT_POST_DEPOSIT_WAIT_MS", 0);
  const skipFunding = parseBooleanEnv("AGENT_SKIP_FUNDING");
  const skipDeposit = parseBooleanEnv("AGENT_SKIP_DEPOSIT");

  if ((skipFunding || skipDeposit) && !agentKeyFromEnv) {
    throw new Error("AGENT_SKIP_FUNDING and AGENT_SKIP_DEPOSIT require AGENT_PRIVATE_KEY.");
  }

  installFetchWithRetry({
    retries: fetchRetries,
    timeoutMs: fetchTimeoutMs,
    label: "agent HTTP request",
  });
  const httpDiagnostics = installPaymentHttpDiagnostics(baseUrl);

  const endpoints: Endpoint[] = [
    { url: `${baseUrl}/api/premium/quote`, method: "GET" },
    { url: `${baseUrl}/api/premium/dataset`, method: "GET" },
    {
      url: `${baseUrl}/api/premium/compute`,
      method: "POST",
      body: { text: "Hello from the Arc Agent Commerce API Store Demo!" },
    },
    { url: `${baseUrl}/api/premium/agent-task`, method: "GET" },
  ];

  const agentKey = agentKeyFromEnv ?? generatePrivateKey();
  const agentAccount = privateKeyToAccount(agentKey);
  const funderAccount = privateKeyToAccount(funderKey);

  if (funderAccount.address.toLowerCase() !== buyerAddress.toLowerCase()) {
    throw new Error("BUYER_ADDRESS does not match BUYER_PRIVATE_KEY.");
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });
  const funderWallet = createWalletClient({
    account: funderAccount,
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });
  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: agentKey,
  });

  const runId = createRunId();
  const runFilePath = path.join(RUN_DIR, `${runId}.json`);
  const runLog: RunLog = {
    runId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    baseUrl,
    funderAddress: funderAccount.address,
    ephemeralAgentAddress: agentAccount.address,
    ephemeralAgentPrivateKey: agentKey,
    walletSource: agentKeyFromEnv ? "AGENT_PRIVATE_KEY" : "generated",
    depositAmountUsdc: depositAmount,
    targetNetwork: TARGET_NETWORK,
    fundingTxHash: null,
    usdcTransferTxHash: null,
    depositTxHash: null,
    status: "created",
    errors: [],
  };
  await writeRunLog(runFilePath, runLog);

  console.log(`Run file: ${runFilePath}`);
  console.log(`Agent wallet: ${agentAccount.address}`);
  console.log(`Funder wallet: ${funderAccount.address}`);
  console.log(`Seller address: ${sellerAddress}`);
  console.log(`Target network: ${TARGET_NETWORK}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(
    skipDeposit
      ? "This run will reuse existing Gateway balance and skip the initial deposit."
      : `This run will deposit ${depositAmount} USDC into Gateway from the ephemeral wallet.`,
  );
  console.log(`Max in-flight paid requests: ${maxInFlight}`);
  if (postDepositWaitMs > 0) {
    console.log(`Post-deposit wait: ${postDepositWaitMs}ms`);
  }

  if (spendingLimit !== null) {
    console.log(`Spending limit: ${spendingLimit} USDC`);
  }

  async function stopIntervals() {
    if (paymentInterval) clearInterval(paymentInterval);
    if (balanceInterval) clearInterval(balanceInterval);
  }

  async function gracefulFailure(stage: string, error: unknown) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    paused = true;
    await stopIntervals();
    runLog.status = "failed";
    await appendRunError(runFilePath, runLog, stage, error);

    console.error("\nAgent runner stopped gracefully.");
    if (runLog.depositTxHash) {
      console.error(`Deposit completed: ${runLog.depositTxHash}`);
    }
    console.error(`${stage} failed.`);
    console.error(`Reason: ${toErrorMessage(error)}`);
    console.error(`Run file: ${runFilePath}`);
    console.error("Retry with the same wallet and existing Gateway balance:");
    console.error(retryCommand(runFilePath, spendingLimit));
    process.exitCode = 1;

    setTimeout(() => process.exit(1), 50);
  }

  process.once("SIGINT", () => {
    void (async () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      await stopIntervals();
      runLog.status = "stopped";
      await writeRunLog(runFilePath, runLog);
      console.log(`\nAgent stopped. Run file: ${runFilePath}`);
      process.exit(0);
    })();
  });

  async function preflightProtectedEndpoint() {
    runLog.status = "preflight";
    await writeRunLog(runFilePath, runLog);

    const response = await fetchWithRetry(endpoints[0].url, {
      method: "GET",
    }, {
      retries: fetchRetries,
      timeoutMs: fetchTimeoutMs,
      label: `Protected endpoint preflight ${endpoints[0].url}`,
    });

    if (response.status !== 402) {
      console.warn(
        `Preflight expected HTTP 402 from ${endpoints[0].url}, received ${response.status}. Continuing because the app is reachable.`,
      );
      return;
    }

    console.log("Protected endpoint preflight passed: received HTTP 402.");
  }

  async function fundAgentWallet() {
    if (skipFunding) {
      console.log("Skipping funding because AGENT_SKIP_FUNDING=1.");
      return;
    }

    runLog.status = "funding";
    await writeRunLog(runFilePath, runLog);

    console.log(`Funding agent wallet from funder ${funderAccount.address}...`);

    const gasTxHash = await withNonceRetry(
      () => funderWallet.sendTransaction({
        to: agentAccount.address,
        value: GAS_FUND_AMOUNT,
      }),
      "Gas tx",
    );
    await publicClient.waitForTransactionReceipt({ hash: gasTxHash });
    runLog.fundingTxHash = gasTxHash;
    await writeRunLog(runFilePath, runLog);
    console.log(`  Gas funded (${gasTxHash.slice(0, 10)}...)`);

    const usdcAmount = parseUnits(depositAmount, 6);
    const usdcTxHash = await withNonceRetry(
      () => funderWallet.writeContract({
        address: ARC_TESTNET_USDC,
        abi: erc20Abi,
        functionName: "transfer",
        args: [agentAccount.address, usdcAmount],
      }),
      "USDC tx",
    );
    await publicClient.waitForTransactionReceipt({ hash: usdcTxHash });
    runLog.usdcTransferTxHash = usdcTxHash;
    runLog.status = "funded";
    await writeRunLog(runFilePath, runLog);
    console.log(`  USDC transferred (${usdcTxHash.slice(0, 10)}...)`);
  }

  async function depositToGateway() {
    if (skipDeposit && !runLog.depositTxHash) {
      console.log("Skipping initial Gateway deposit because AGENT_SKIP_DEPOSIT=1.");
      return;
    }

    runLog.status = "depositing";
    await writeRunLog(runFilePath, runLog);

    console.log("\nGateway deposit details:");
    console.log(`  Wallet: ${agentAccount.address}`);
    console.log(`  Deposit amount: ${depositAmount} USDC`);
    console.log(`  Network: ${TARGET_NETWORK}`);
    console.log(`  Base URL: ${baseUrl}`);

    const result = await withRetry(
      () => gateway.deposit(depositAmount),
      {
        retries: fetchRetries,
        timeoutMs: fetchTimeoutMs,
        label: "Gateway deposit",
      },
    );
    runLog.depositTxHash = result.depositTxHash;
    runLog.status = "deposited";
    await writeRunLog(runFilePath, runLog);
    console.log(`Deposit complete! TX: ${result.depositTxHash}`);

    try {
      const updated = await withRetry(
        () => gateway.getBalances(),
        {
          retries: fetchRetries,
          timeoutMs: fetchTimeoutMs,
          label: "Gateway balance refresh after deposit",
        },
      );
      console.log(`Gateway available balance: ${updated.gateway.formattedAvailable}`);
    } catch (error) {
      await appendRunError(runFilePath, runLog, "Gateway balance refresh after deposit", error);
      console.warn(
        `Gateway balance refresh failed after deposit: ${toErrorMessage(error)}. Continuing to paid requests.`,
      );
    }
  }

  async function waitAfterDepositIfConfigured() {
    if (postDepositWaitMs <= 0) return;

    console.log(
      `Waiting ${postDepositWaitMs}ms after Gateway deposit before paid API requests...`,
    );
    await new Promise((resolve) => setTimeout(resolve, postDepositWaitMs));
  }

  const redepositThreshold = 500_000n;
  const usdcAmount = parseUnits(depositAmount, 6);

  async function refundAndRedeposit() {
    const txHash = await withNonceRetry(
      () => funderWallet.writeContract({
        address: ARC_TESTNET_USDC,
        abi: erc20Abi,
        functionName: "transfer",
        args: [agentAccount.address, usdcAmount],
      }),
      "Redeposit tx",
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    await depositToGateway();
  }

  async function checkAndRedeposit() {
    if (redepositing || paused || shutdownStarted) return;
    redepositing = true;
    try {
      const balances = await withRetry(
        () => gateway.getBalances(),
        {
          retries: fetchRetries,
          timeoutMs: fetchTimeoutMs,
          label: "Gateway balance check",
        },
      );
      if (balances.gateway.available < redepositThreshold) {
        console.log(
          `\nGateway balance low (${balances.gateway.formattedAvailable}), redepositing...`,
        );
        if (balances.wallet.balance > 0n) {
          await depositToGateway();
        } else {
          await refundAndRedeposit();
        }
      }
    } catch (error) {
      await appendRunError(runFilePath, runLog, "Gateway balance check", error);
      console.error("Balance check failed:", toErrorMessage(error));
    } finally {
      redepositing = false;
    }
  }

  async function handleLimitReached() {
    if (spendingLimit === null || shutdownStarted) return;

    paused = true;
    await stopIntervals();

    while (inFlight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`\nSpent ${totalSpent.toFixed(6)} / ${spendingLimit.toFixed(6)} USDC (limit reached)`);

    const additional = await promptForAllowance(totalSpent);
    spendingLimit += additional;
    console.log(`New limit: ${spendingLimit.toFixed(6)} USDC (total spent so far: ${totalSpent.toFixed(6)} USDC)`);

    paused = false;
    startPaymentLoop();
  }

  function startPaymentLoop() {
    balanceInterval = setInterval(() => {
      void checkAndRedeposit();
    }, 30_000);

    paymentInterval = setInterval(() => {
      if (paused || shutdownStarted) return;
      if (inFlight >= maxInFlight) return;

      const sequence = index + 1;
      const ep = endpoints[index % endpoints.length];
      index++;
      inFlight++;

      const start = Date.now();
      withRetry(
        () => gateway.pay(ep.url, { method: ep.method, body: ep.body }),
        {
          retries: fetchRetries,
          timeoutMs: fetchTimeoutMs,
          label: `Paid API request #${sequence} ${ep.method} ${ep.url}`,
        },
      )
        .then((result) => {
          inFlight--;
          const ms = Date.now() - start;
          const amount = parseFloat(result.formattedAmount);
          totalSpent += amount;

          const limitInfo = spendingLimit !== null
            ? ` [spent: ${totalSpent.toFixed(6)}/${spendingLimit.toFixed(6)} USDC]`
            : "";
          console.log(
            `#${sequence} ${ep.method} ${ep.url.split("/").pop()} -> ${result.formattedAmount} USDC (${ms}ms) [in-flight: ${inFlight}]${limitInfo}`,
          );

          if (spendingLimit !== null && totalSpent >= spendingLimit) {
            void handleLimitReached();
          }
        })
        .catch((error) => {
          inFlight--;
          const ms = Date.now() - start;
          console.error(
            `#${sequence} ${ep.url.split("/").pop()} FAILED (${ms}ms): ${toErrorMessage(error)} [in-flight: ${inFlight}]`,
          );
          printPaymentHttpDiagnostics(httpDiagnostics.getRecent(ep.url), runFilePath);
          void gracefulFailure("Paid API request", error);
        });
    }, 1000);
  }

  try {
    await preflightProtectedEndpoint();
    await fundAgentWallet();
    await depositToGateway();
    await waitAfterDepositIfConfigured();

    runLog.status = "running";
    await writeRunLog(runFilePath, runLog);

    console.log(`\nTarget: 1 transaction/second across ${endpoints.length} endpoints\n`);
    startPaymentLoop();
  } catch (error) {
    await gracefulFailure(runLog.depositTxHash ? "Paid API request" : "Agent setup", error);
  }
}

main().catch((error) => {
  console.error(`Agent failed before run setup completed: ${toErrorMessage(error)}`);
  process.exit(1);
});
