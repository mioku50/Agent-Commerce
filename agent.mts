import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GatewayClient, type PayResult } from "@circle-fin/x402-batching/client";
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
  type PaymentHttpExchange,
} from "./lib/agent/payment-http-diagnostics.ts";
import {
  createAgentRun,
  createAgentStep,
  findRecentPaymentEvent,
  updateAgentRun,
  updateAgentStep,
  type AgentRunStatus,
  type AgentStepRow,
  type AgentStepStatus,
} from "./lib/agent/run-persistence.ts";
import {
  createOrUpdateAgentProfileByWallet,
  recalculateAgentProfile,
} from "./lib/agent/passport-persistence.ts";
import type {
  ApiService,
  ServiceMethod,
  ServiceSourceType,
  ServiceStatus,
} from "./lib/services/registry.ts";

type ServiceDiscoveryResponse = {
  services?: ApiService[];
};

type CliArgs = {
  task: string;
  spendingLimit: number;
  mode: "scripted";
};

type RunStatus =
  | "created"
  | "discovering"
  | "planning"
  | "funding"
  | "funded"
  | "depositing"
  | "deposited"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

type LocalStepLog = {
  stepIndex: number;
  serviceSlug: string;
  serviceName: string;
  status: AgentStepStatus;
  reasoning: string;
  requestId?: string | null;
  paymentEventId?: string | null;
  error?: string | null;
};

type RunLog = {
  runId: string;
  supabaseRunId: string | null;
  createdAt: string;
  updatedAt: string;
  task: string;
  mode: "scripted";
  baseUrl: string;
  funderAddress: string;
  sellerAddress: string;
  ephemeralAgentAddress: string;
  ephemeralAgentPrivateKey: string;
  walletSource: "generated" | "AGENT_PRIVATE_KEY";
  budgetUsdc: string;
  spentUsdc: string;
  depositAmountUsdc: string;
  targetNetwork: string;
  fundingTxHash: string | null;
  usdcTransferTxHash: string | null;
  depositTxHash: string | null;
  status: RunStatus;
  steps: LocalStepLog[];
  summary: string | null;
  errors: Array<{
    at: string;
    stage: string;
    message: string;
  }>;
};

type ServiceDecision = {
  service: ApiService;
  decision: "selected" | "skipped";
  reasoning: string;
  expectedPriceUsd: number;
};

type ExecutableDecision = ServiceDecision & {
  step: AgentStepRow | null;
  stepIndex: number;
};

type PreflightResult = {
  requestId?: string;
  paymentRequired?: unknown;
  responseBody?: string;
};

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC =
  process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const TARGET_NETWORK = "Arc Testnet (chain ID 5042002)";
const GAS_FUND_AMOUNT = parseEther("0.01");
const RUN_DIR = ".agent-runs";
const DEFAULT_TASK =
  "Explore the API Store and buy the minimum useful services to produce a short agent commerce proof.";
const DEFAULT_BUDGET_USDC = 0.0113;
const PURCHASE_ORDER = [
  "premium-quote",
  "market-snapshot",
  "text-analyzer",
  "agent-task",
] as const;

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let spendingLimit: number | null = null;
  let task = DEFAULT_TASK;
  let mode = "scripted";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const val = Number(args[i + 1]);
      if (!Number.isFinite(val) || val <= 0) {
        throw new Error("--limit must be a positive number (USDC amount).");
      }
      spendingLimit = val;
      i++;
    } else if (args[i] === "--task" && args[i + 1]) {
      task = args[i + 1].trim();
      if (!task) throw new Error("--task must not be empty.");
      i++;
    } else if (args[i] === "--mode" && args[i + 1]) {
      mode = args[i + 1].trim();
      i++;
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    }
  }

  if (mode !== "scripted") {
    throw new Error("Phase 3 supports --mode scripted only.");
  }

  return {
    task,
    spendingLimit: spendingLimit ?? DEFAULT_BUDGET_USDC,
    mode,
  };
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

function formatUsdc(amount: number) {
  const formatted = amount.toFixed(6).replace(/\.?0+$/, "");
  return formatted === "" ? "0" : formatted;
}

function roundUsdc(amount: number) {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

function isServiceStatus(value: unknown): value is ServiceStatus {
  return (
    value === "draft" ||
    value === "live" ||
    value === "mock" ||
    value === "coming-soon" ||
    value === "disabled"
  );
}

function isServiceMethod(value: unknown): value is ServiceMethod {
  return value === "GET" || value === "POST";
}

function isServiceSourceType(value: unknown): value is ServiceSourceType {
  return (
    value === "static" ||
    value === "seller_mock" ||
    value === "external_placeholder"
  );
}

function isApiService(value: unknown): value is ApiService {
  if (!value || typeof value !== "object") return false;
  const service = value as Record<string, unknown>;

  return (
    typeof service.id === "string" &&
    typeof service.slug === "string" &&
    typeof service.name === "string" &&
    typeof service.shortDescription === "string" &&
    typeof service.category === "string" &&
    isServiceMethod(service.method) &&
    typeof service.endpoint === "string" &&
    typeof service.priceUsd === "number" &&
    isServiceStatus(service.status) &&
    isServiceSourceType(service.sourceType)
  );
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

function retryCommand(runFilePath: string, args: CliArgs) {
  const task = args.task.replace(/"/g, '\\"');
  return `AGENT_PRIVATE_KEY=$(node -e "console.log(require('./${runFilePath}').ephemeralAgentPrivateKey)") AGENT_SKIP_FUNDING=1 AGENT_SKIP_DEPOSIT=1 npm run agent -- --task "${task}" --limit ${formatUsdc(args.spendingLimit)} --mode ${args.mode}`;
}

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

function sortedServices(services: ApiService[]) {
  return [...services].sort((a, b) => {
    const aIndex = PURCHASE_ORDER.indexOf(a.slug as (typeof PURCHASE_ORDER)[number]);
    const bIndex = PURCHASE_ORDER.indexOf(b.slug as (typeof PURCHASE_ORDER)[number]);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    if (a.priceUsd !== b.priceUsd) return a.priceUsd - b.priceUsd;
    return a.name.localeCompare(b.name);
  });
}

function matches(task: string, pattern: RegExp) {
  return pattern.test(task.toLowerCase());
}

function taskTokens(task: string) {
  const stopwords = new Set([
    "with",
    "using",
    "from",
    "only",
    "when",
    "useful",
    "small",
    "create",
    "prepare",
    "agent",
    "commerce",
    "proof",
  ]);

  return task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function sellerServiceMatchesTask(service: ApiService, task: string) {
  const normalizedCategory = service.category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "\\W+");
  const haystack = [
    service.name,
    service.slug,
    service.category,
    service.shortDescription,
    service.longDescription,
    service.exampleUseCase,
    service.agentReasoningHint,
  ]
    .join(" ")
    .toLowerCase();

  if (normalizedCategory && matches(task, new RegExp(`\\b${normalizedCategory}\\b`))) {
    return true;
  }

  return taskTokens(task).some((token) => haystack.includes(token));
}

function serviceReasonForSelection(service: ApiService, task: string) {
  if (service.sourceType === "seller_mock") {
    return `Seller-created mock service matches the task context and is safe for the Phase 4 stored-response MVP: ${task}`;
  }

  if (service.slug === "premium-quote") {
    return "Low-cost proof of payment and useful short context for the task.";
  }

  if (service.slug === "market-snapshot") {
    return "The task asks for market, data, context, research, or report material, and this service provides paid market data at a reasonable cost.";
  }

  if (service.slug === "text-analyzer") {
    return "The task involves analysis, summary, text, or report generation, so a paid compute step can analyze the generated context.";
  }

  if (service.slug === "agent-task") {
    return "The task justifies a higher-value multi-step agent task, and the remaining budget can cover it.";
  }

  return `The service appears useful for this task: ${task}`;
}

function shouldSelectLiveService(service: ApiService, task: string, budget: number) {
  if (service.sourceType === "seller_mock") {
    return sellerServiceMatchesTask(service, task);
  }

  if (service.sourceType === "external_placeholder") {
    return false;
  }

  if (service.slug === "premium-quote") return true;
  if (service.slug === "market-snapshot") {
    return matches(task, /\b(market|data|context|report|research|snapshot|financial)\b/);
  }
  if (service.slug === "text-analyzer") {
    return matches(task, /\b(text|summary|summarize|analysis|analyze|report|draft|write)\b/);
  }
  if (service.slug === "agent-task") {
    return (
      budget >= 0.0413 &&
      matches(task, /\b(agent task|task|multi[- ]step|puzzle|work order)\b/)
    );
  }
  return false;
}

function planPurchases(task: string, budget: number, services: ApiService[]) {
  let remaining = budget;

  return sortedServices(services).map((service): ServiceDecision => {
    if (service.status === "coming-soon") {
      return {
        service,
        decision: "skipped",
        reasoning: "This service is coming soon and does not have a live paid endpoint in Phase 4.",
        expectedPriceUsd: service.priceUsd,
      };
    }

    if (service.sourceType === "external_placeholder") {
      return {
        service,
        decision: "skipped",
        reasoning: "External fulfillment is not enabled in this MVP, so the buyer-agent will not call this seller-created placeholder.",
        expectedPriceUsd: service.priceUsd,
      };
    }

    if (service.status !== "live") {
      return {
        service,
        decision: "skipped",
        reasoning: "This service is not marked live, so the scripted buyer-agent will not spend budget on it.",
        expectedPriceUsd: service.priceUsd,
      };
    }

    if (!service.isPaid) {
      return {
        service,
        decision: "skipped",
        reasoning: "This listing is not priced as a paid x402 service, so the buyer-agent will not spend Gateway balance on it.",
        expectedPriceUsd: service.priceUsd,
      };
    }

    if (!shouldSelectLiveService(service, task, budget)) {
      return {
        service,
        decision: "skipped",
        reasoning: "The scripted policy did not find enough task relevance to justify this paid call.",
        expectedPriceUsd: service.priceUsd,
      };
    }

    if (service.priceUsd > remaining + 0.0000001) {
      return {
        service,
        decision: "skipped",
        reasoning: `Skipped because ${service.priceLabel} exceeds the remaining budget of ${formatUsdc(remaining)} USDC.`,
        expectedPriceUsd: service.priceUsd,
      };
    }

    remaining = roundUsdc(remaining - service.priceUsd);

    return {
      service,
      decision: "selected",
      reasoning: serviceReasonForSelection(service, task),
      expectedPriceUsd: service.priceUsd,
    };
  });
}

function serviceUrl(baseUrl: string, service: ApiService) {
  return `${baseUrl}${service.endpoint}`;
}

function createTextAnalyzerBody(task: string, paidPreviews: unknown[]) {
  const context = paidPreviews.length > 0
    ? JSON.stringify(paidPreviews, null, 2)
    : "No paid context has been collected yet.";

  return {
    text: `Task: ${task}\n\nPaid context collected so far:\n${context}`,
  };
}

function requestBodyForService(
  service: ApiService,
  task: string,
  paidPreviews: unknown[],
) {
  if (service.method !== "POST") return undefined;

  if (service.slug === "text-analyzer") {
    return createTextAnalyzerBody(task, paidPreviews);
  }

  const example = service.exampleRequest as { body?: Record<string, unknown> };
  return example.body ?? {};
}

function requestInitForService(service: ApiService, body: unknown): RequestInit {
  return {
    method: service.method,
    headers: service.method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function latestExchange(
  exchanges: PaymentHttpExchange[],
  paidAttempt?: boolean,
) {
  const filtered = paidAttempt === undefined
    ? exchanges
    : exchanges.filter((exchange) => exchange.paidAttempt === paidAttempt);

  return filtered.at(-1);
}

function previewJson(value: unknown, maxChars = 1600): unknown {
  const encoded = JSON.stringify(value);
  if (!encoded) return null;
  if (encoded.length <= maxChars) return value;

  return {
    truncated: true,
    preview: encoded.slice(0, maxChars),
  };
}

function safeRaw(value: Record<string, unknown>) {
  return previewJson(value, 2200) as Record<string, unknown>;
}

function updateLocalStep(
  runLog: RunLog,
  stepIndex: number,
  patch: Partial<LocalStepLog>,
) {
  const index = runLog.steps.findIndex((step) => step.stepIndex === stepIndex);
  if (index === -1) return;
  runLog.steps[index] = { ...runLog.steps[index], ...patch };
}

function runSummary(input: {
  selected: number;
  skipped: number;
  paid: number;
  failed: number;
  spent: number;
}) {
  return `Selected ${input.selected}, paid ${input.paid}, skipped ${input.skipped}, failed ${input.failed}. Spent ${formatUsdc(input.spent)} USDC.`;
}

async function fetchServiceRegistry(baseUrl: string, retries: number, timeoutMs: number) {
  const response = await fetchWithRetry(
    `${baseUrl}/api/store/services`,
    { method: "GET" },
    {
      retries,
      timeoutMs,
      label: "Service discovery GET /api/store/services",
    },
  );

  if (!response.ok) {
    throw new Error(`Service discovery failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as ServiceDiscoveryResponse;
  const services = data.services;

  if (!Array.isArray(services)) {
    throw new Error("Service discovery response did not include a services array.");
  }

  const invalid = services.find((service) => !isApiService(service));
  if (invalid) {
    throw new Error(`Service discovery returned an invalid service record: ${JSON.stringify(invalid)}`);
  }

  return services;
}

async function main() {
  const args = parseArgs();
  const baseUrl = normalizeBaseUrl(requireEnv("BASE_URL"));
  const buyerAddress = requireAddress("BUYER_ADDRESS");
  const sellerAddress = requireAddress("SELLER_ADDRESS");
  const funderKey = requirePrivateKey("BUYER_PRIVATE_KEY");
  const agentKeyFromEnv = optionalPrivateKey("AGENT_PRIVATE_KEY");
  const depositAmount = parsePositiveAmountEnv("AGENT_DEPOSIT_USDC", "1");
  const fetchRetries = parsePositiveIntegerEnv("AGENT_FETCH_RETRIES", 3);
  const fetchTimeoutMs = parsePositiveIntegerEnv("AGENT_FETCH_TIMEOUT_MS", 30_000);
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
    supabaseRunId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    task: args.task,
    mode: args.mode,
    baseUrl,
    funderAddress: funderAccount.address,
    sellerAddress,
    ephemeralAgentAddress: agentAccount.address,
    ephemeralAgentPrivateKey: agentKey,
    walletSource: agentKeyFromEnv ? "AGENT_PRIVATE_KEY" : "generated",
    budgetUsdc: formatUsdc(args.spendingLimit),
    spentUsdc: "0",
    depositAmountUsdc: depositAmount,
    targetNetwork: TARGET_NETWORK,
    fundingTxHash: null,
    usdcTransferTxHash: null,
    depositTxHash: null,
    status: "created",
    steps: [],
    summary: null,
    errors: [],
  };
  await writeRunLog(runFilePath, runLog);

  const supabaseRun = await createAgentRun({
    task: args.task,
    mode: args.mode,
    status: "running",
    base_url: baseUrl,
    agent_wallet: agentAccount.address,
    budget_usdc: formatUsdc(args.spendingLimit),
    spent_usdc: "0",
    raw: {
      localRunId: runId,
      walletSource: runLog.walletSource,
      targetNetwork: TARGET_NETWORK,
      mcp: "raw Arc Docs MCP fallback verified before implementation",
    },
  });
  runLog.supabaseRunId = supabaseRun?.id ?? null;
  await createOrUpdateAgentProfileByWallet(agentAccount.address);
  await writeRunLog(runFilePath, runLog);

  console.log(`Run file: ${runFilePath}`);
  console.log(`Supabase run: ${runLog.supabaseRunId ?? "not persisted"}`);
  console.log(`Task: ${args.task}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Budget: ${formatUsdc(args.spendingLimit)} USDC`);
  console.log(`Agent wallet: ${agentAccount.address}`);
  console.log(`Funder wallet: ${funderAccount.address}`);
  console.log(`Seller address: ${sellerAddress}`);
  console.log(`Target network: ${TARGET_NETWORK}`);
  console.log(`Base URL: ${baseUrl}`);

  async function gracefulFailure(stage: string, error: unknown) {
    runLog.status = "failed";
    runLog.summary = `${stage} failed: ${toErrorMessage(error)}`;
    await appendRunError(runFilePath, runLog, stage, error);
    await updateAgentRun(runLog.supabaseRunId, {
      status: "failed",
      spent_usdc: runLog.spentUsdc,
      summary: runLog.summary,
      error: toErrorMessage(error),
    });
    await recalculateAgentProfile(agentAccount.address, {
      runId: runLog.supabaseRunId,
    });

    console.error("\nAgent runner stopped gracefully.");
    if (runLog.depositTxHash) {
      console.error(`Deposit completed: ${runLog.depositTxHash}`);
    }
    console.error(`${stage} failed.`);
    console.error(`Reason: ${toErrorMessage(error)}`);
    console.error(`Run file: ${runFilePath}`);
    console.error("Retry with the same wallet and existing Gateway balance:");
    console.error(retryCommand(runFilePath, args));
  }

  process.once("SIGINT", () => {
    void (async () => {
      runLog.status = "stopped";
      runLog.summary = "Agent run stopped by SIGINT.";
      await writeRunLog(runFilePath, runLog);
      await updateAgentRun(runLog.supabaseRunId, {
        status: "stopped",
        spent_usdc: runLog.spentUsdc,
        summary: runLog.summary,
      });
      await recalculateAgentProfile(agentAccount.address, {
        runId: runLog.supabaseRunId,
      });
      console.log(`\nAgent stopped. Run file: ${runFilePath}`);
      process.exit(0);
    })();
  });

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
    if (skipDeposit) {
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

  async function preflightPaymentRequirement(
    service: ApiService,
    body: unknown,
  ): Promise<PreflightResult> {
    const url = serviceUrl(baseUrl, service);
    const response = await fetchWithRetry(
      url,
      requestInitForService(service, body),
      {
        retries: fetchRetries,
        timeoutMs: fetchTimeoutMs,
        label: `Payment requirement preflight ${service.method} ${url}`,
      },
    );
    const exchanges = httpDiagnostics.getRecent(url);
    const exchange = latestExchange(exchanges, false);
    const responseBody = await response.clone().text().catch(() => "");

    if (response.status !== 402) {
      console.warn(
        `Preflight expected HTTP 402 from ${service.endpoint}, received ${response.status}. Continuing to paid request.`,
      );
    } else {
      console.log(`  ${service.name}: payment requirement received (HTTP 402).`);
    }

    return {
      requestId:
        response.headers.get("X-Agent-Commerce-Request-Id") ??
        exchange?.requestId,
      paymentRequired: exchange?.paymentRequired,
      responseBody: responseBody.slice(0, 800),
    };
  }

  async function executePaidStep(decision: ExecutableDecision, paidPreviews: unknown[]) {
    const { service, step, stepIndex } = decision;
    const url = serviceUrl(baseUrl, service);
    const body = requestBodyForService(service, args.task, paidPreviews);

    updateLocalStep(runLog, stepIndex, { status: "selected" });
    await writeRunLog(runFilePath, runLog);
    await updateAgentStep(step?.id ?? null, {
      status: "selected",
      raw: safeRaw({ decision: "selected" }),
    });

    const preflight = await preflightPaymentRequirement(service, body);
    updateLocalStep(runLog, stepIndex, {
      status: "payment_required",
      requestId: preflight.requestId ?? null,
    });
    await writeRunLog(runFilePath, runLog);
    await updateAgentStep(step?.id ?? null, {
      status: "payment_required",
      request_id: preflight.requestId ?? null,
      raw: safeRaw({
        paymentRequired: preflight.paymentRequired,
        responseBody: preflight.responseBody,
      }),
    });

    const paymentStartedAt = new Date(Date.now() - 5000);
    let result: PayResult<unknown>;
    try {
      result = await withRetry(
        () => gateway.pay(url, { method: service.method, body }),
        {
          retries: fetchRetries,
          timeoutMs: fetchTimeoutMs,
          label: `Paid API request ${service.method} ${url}`,
        },
      );
    } catch (error) {
      const exchanges = httpDiagnostics.getRecent(url);
      const exchange = latestExchange(exchanges);
      const requestId = exchange?.requestId ?? preflight.requestId ?? null;

      updateLocalStep(runLog, stepIndex, {
        status: "failed",
        requestId,
        error: toErrorMessage(error),
      });
      await writeRunLog(runFilePath, runLog);
      await updateAgentStep(step?.id ?? null, {
        status: "failed",
        request_id: requestId,
        error: toErrorMessage(error),
        raw: safeRaw({ diagnostics: exchanges }),
      });
      printPaymentHttpDiagnostics(exchanges, runFilePath);
      throw error;
    }

    const amount = Number(result.formattedAmount);
    const safeAmount = Number.isFinite(amount) ? amount : service.priceUsd;
    const currentSpent = Number(runLog.spentUsdc);
    const nextSpent = roundUsdc(currentSpent + safeAmount);
    runLog.spentUsdc = formatUsdc(nextSpent);

    const paidExchange = latestExchange(httpDiagnostics.getRecent(url), true);
    const requestId = paidExchange?.requestId ?? preflight.requestId ?? null;
    const paymentEventId = await findRecentPaymentEvent({
      endpoint: service.endpoint,
      payer: agentAccount.address,
      amountUsdc: result.formattedAmount,
      since: paymentStartedAt,
    });
    const responsePreview = previewJson(result.data);
    paidPreviews.push({
      service: service.name,
      response: responsePreview,
    });

    updateLocalStep(runLog, stepIndex, {
      status: "paid",
      requestId,
      paymentEventId,
    });
    await writeRunLog(runFilePath, runLog);
    await updateAgentStep(step?.id ?? null, {
      status: "paid",
      request_id: requestId,
      payment_event_id: paymentEventId,
      response_preview: responsePreview,
      raw: safeRaw({
        amount: result.formattedAmount,
        transaction: result.transaction,
        status: result.status,
        paymentResponse: paidExchange?.paymentResponse,
      }),
    });
    await updateAgentRun(runLog.supabaseRunId, {
      spent_usdc: runLog.spentUsdc,
    });

    console.log(
      `  ${service.name}: paid ${result.formattedAmount} USDC (spent ${runLog.spentUsdc}/${formatUsdc(args.spendingLimit)} USDC).`,
    );
  }

  try {
    runLog.status = "discovering";
    await writeRunLog(runFilePath, runLog);
    console.log("\nDiscovering services from /api/store/services...");
    const services = await fetchServiceRegistry(baseUrl, fetchRetries, fetchTimeoutMs);
    console.log(`Discovered ${services.length} services.`);

    runLog.status = "planning";
    await writeRunLog(runFilePath, runLog);
    const decisions = planPurchases(args.task, args.spendingLimit, services);
    const selectedCount = decisions.filter((decision) => decision.decision === "selected").length;
    const skippedCount = decisions.length - selectedCount;
    console.log(`Planner selected ${selectedCount} service(s), skipped ${skippedCount}.`);

    await updateAgentRun(runLog.supabaseRunId, {
      raw: {
        localRunId: runId,
        walletSource: runLog.walletSource,
        targetNetwork: TARGET_NETWORK,
        serviceCount: services.length,
        selectedCount,
        skippedCount,
      },
    });

    const executableDecisions: ExecutableDecision[] = [];
    for (const [index, decision] of decisions.entries()) {
      const stepIndex = index + 1;
      const { service } = decision;
      const step = runLog.supabaseRunId
        ? await createAgentStep({
            run_id: runLog.supabaseRunId,
            step_index: stepIndex,
            service_id: service.id,
            service_slug: service.slug,
            service_name: service.name,
            service_source_type: service.sourceType,
            endpoint: service.endpoint,
            method: service.method,
            price_usdc: formatUsdc(service.priceUsd),
            status: "discovered",
            reasoning: decision.reasoning,
            raw: safeRaw({
              decision: decision.decision,
              expectedPriceUsd: decision.expectedPriceUsd,
              sourceType: service.sourceType,
            }),
          })
        : null;

      const status: AgentStepStatus =
        decision.decision === "selected" ? "selected" : "skipped";
      runLog.steps.push({
        stepIndex,
        serviceSlug: service.slug,
        serviceName: service.name,
        status,
        reasoning: decision.reasoning,
      });
      await updateAgentStep(step?.id ?? null, {
        status,
        raw: safeRaw({
          decision: decision.decision,
          expectedPriceUsd: decision.expectedPriceUsd,
          sourceType: service.sourceType,
        }),
      });
      executableDecisions.push({ ...decision, step, stepIndex });
    }
    await writeRunLog(runFilePath, runLog);

    const selected = executableDecisions.filter(
      (decision) => decision.decision === "selected",
    );

    if (selected.length > 0) {
      console.log(
        skipDeposit
          ? "This run will reuse existing Gateway balance and skip the initial deposit."
          : `This run will deposit ${depositAmount} USDC into Gateway from the ephemeral wallet.`,
      );
      await fundAgentWallet();
      await depositToGateway();
      await waitAfterDepositIfConfigured();
    } else {
      console.log("No services selected for purchase; skipping funding and Gateway deposit.");
    }

    runLog.status = "running";
    await writeRunLog(runFilePath, runLog);

    const paidPreviews: unknown[] = [];
    for (const decision of selected) {
      await executePaidStep(decision, paidPreviews);
    }

    const paidCount = runLog.steps.filter((step) => step.status === "paid").length;
    const failedCount = runLog.steps.filter((step) => step.status === "failed").length;
    const summary = runSummary({
      selected: selected.length,
      skipped: skippedCount,
      paid: paidCount,
      failed: failedCount,
      spent: Number(runLog.spentUsdc),
    });
    const finalStatus: AgentRunStatus = failedCount > 0 ? "failed" : "completed";
    runLog.status = finalStatus;
    runLog.summary = summary;
    await writeRunLog(runFilePath, runLog);
    await updateAgentRun(runLog.supabaseRunId, {
      status: finalStatus,
      spent_usdc: runLog.spentUsdc,
      summary,
      error: failedCount > 0 ? "One or more selected services failed." : null,
    });
    const passport = await recalculateAgentProfile(agentAccount.address, {
      runId: runLog.supabaseRunId,
    });

    console.log(`\nAgent run complete. ${summary}`);
    console.log(`Run file: ${runFilePath}`);
    if (runLog.supabaseRunId) {
      console.log(`Timeline: ${baseUrl}/runs/${runLog.supabaseRunId}`);
    }
    if (passport) {
      console.log(`Agent Passport: ${baseUrl}/agents/${agentAccount.address}`);
      console.log(`Demo trust score: ${passport.trust_score}/100`);
    }
  } catch (error) {
    await gracefulFailure("Agent run", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Agent failed before run setup completed: ${toErrorMessage(error)}`);
  process.exit(1);
});
