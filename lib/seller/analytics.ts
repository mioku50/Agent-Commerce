import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../supabase/server-env";
import {
  serviceRegistry,
  type ApiService,
  type ServiceMethod,
  type ServiceSourceType,
} from "@/lib/services/registry";
import {
  listDynamicStoreServiceRows,
  rowToApiService,
} from "@/lib/services/store-service-persistence";
import { ARC_TESTNET_EXPLORER_URL } from "@/lib/commerce/onchain-proof";

type JsonRecord = Record<string, unknown>;

type AgentRunRow = {
  id: string;
  created_at: string;
  task: string;
  status: string;
  agent_wallet: string | null;
  budget_usdc: string;
  spent_usdc: string;
  summary: string | null;
};

type AgentPurchaseStepRow = {
  id: string;
  created_at: string;
  run_id: string;
  step_index: number;
  service_id: string | null;
  service_slug: string | null;
  service_name: string | null;
  service_source_type: string | null;
  endpoint: string | null;
  method: string | null;
  price_usdc: string | null;
  status: string;
  reasoning: string | null;
  request_id: string | null;
  payment_event_id: string | null;
  error: string | null;
};

type PaymentEventRow = {
  id: string;
  created_at: string;
  endpoint: string;
  payer: string;
  amount_usdc: string;
  network: string;
  gateway_tx: string | null;
  onchain_status: string | null;
  onchain_tx_hash: string | null;
  onchain_contract_address: string | null;
  onchain_block_number: number | string | null;
  onchain_proof_id: string | null;
  raw: JsonRecord | null;
};

export type SellerAnalyticsOverview = {
  totalServices: number;
  liveServices: number;
  sellerCreatedServices: number;
  paidCalls: number;
  skippedCalls: number;
  failedCalls: number;
  estimatedUsdcRevenue: string;
  buyerAgentWallets: number;
  linkedPaymentEvents: number;
  verifiedProofs: number;
  pendingProofs: number;
  failedProofs: number;
};

export type SellerAnalyticsService = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  endpoint: string;
  method: ServiceMethod;
  status: string;
  sourceType: ServiceSourceType;
  priceLabel: string;
  paidCalls: number;
  skippedCalls: number;
  failedCalls: number;
  estimatedUsdcRevenue: string;
  buyerAgentWallets: number;
  lastPurchaseAt: string | null;
};

export type SellerAnalyticsPurchase = {
  stepId: string;
  createdAt: string;
  runId: string;
  runTask: string | null;
  buyerWallet: string | null;
  serviceId: string | null;
  serviceSlug: string | null;
  serviceName: string;
  serviceSourceType: ServiceSourceType;
  endpoint: string | null;
  method: string | null;
  priceUsdc: string;
  status: string;
  requestId: string | null;
  paymentEventId: string | null;
  matchedPaymentEventId: string | null;
  gatewayTx: string | null;
  onchainProofStatus: string | null;
  onchainTransactionHash: string | null;
  onchainContractAddress: string | null;
  onchainBlockNumber: number | string | null;
  onchainProofId: string | null;
  onchainTransactionUrl: string | null;
};

export type SellerAnalyticsBuyerWallet = {
  wallet: string;
  paidCalls: number;
  skippedCalls: number;
  failedCalls: number;
  estimatedUsdcSpent: string;
  lastRunAt: string | null;
};

export type SellerAnalyticsSourceBreakdown = {
  sourceType: ServiceSourceType;
  label: string;
  services: number;
  paidCalls: number;
  estimatedUsdcRevenue: string;
};

export type SellerAnalytics = {
  generatedAt: string;
  warning: string | null;
  overview: SellerAnalyticsOverview;
  sourceBreakdown: SellerAnalyticsSourceBreakdown[];
  topServices: SellerAnalyticsService[];
  recentPurchases: SellerAnalyticsPurchase[];
  buyerWallets: SellerAnalyticsBuyerWallet[];
};

const runColumns = [
  "id",
  "created_at",
  "task",
  "status",
  "agent_wallet",
  "budget_usdc",
  "spent_usdc",
  "summary",
].join(",");

const stepColumns = [
  "id",
  "created_at",
  "run_id",
  "step_index",
  "service_id",
  "service_slug",
  "service_name",
  "service_source_type",
  "endpoint",
  "method",
  "price_usdc",
  "status",
  "reasoning",
  "request_id",
  "payment_event_id",
  "error",
].join(",");

const paymentEventColumns = [
  "id",
  "created_at",
  "endpoint",
  "payer",
  "amount_usdc",
  "network",
  "gateway_tx",
  "onchain_status",
  "onchain_tx_hash",
  "onchain_contract_address",
  "onchain_block_number",
  "onchain_proof_id",
  "raw",
].join(",");

let supabase: SupabaseClient | null = null;

function getServiceSupabase() {
  const config = tryGetServerSupabaseConfig();

  if (!config) return null;

  supabase ??= createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundUsdc(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatUsdc(value: number) {
  const formatted = roundUsdc(value).toFixed(6).replace(/\.?0+$/, "");
  return formatted === "" ? "0" : formatted;
}

function sourceLabel(sourceType: ServiceSourceType) {
  if (sourceType === "static") return "Internal deterministic";
  if (sourceType === "provider_backed") return "Live Provider";
  if (sourceType === "seller_mock") return "Seller-created mock";
  if (sourceType === "external_seller") return "External Seller API";
  return "Seller-created placeholder";
}

function emptyAnalytics(warning: string | null): SellerAnalytics {
  return {
    generatedAt: new Date().toISOString(),
    warning,
    overview: {
      totalServices: 0,
      liveServices: 0,
      sellerCreatedServices: 0,
      paidCalls: 0,
      skippedCalls: 0,
      failedCalls: 0,
      estimatedUsdcRevenue: "0",
      buyerAgentWallets: 0,
      linkedPaymentEvents: 0,
      verifiedProofs: 0,
      pendingProofs: 0,
      failedProofs: 0,
    },
    sourceBreakdown: [],
    topServices: [],
    recentPurchases: [],
    buyerWallets: [],
  };
}

function isKnownAnalyticsTableError(message: string) {
  return (
    message.includes("agent_runs") ||
    message.includes("agent_purchase_steps") ||
    message.includes("payment_events") ||
    message.includes("store_services")
  );
}

async function selectRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  orderColumn: string,
  limit = 1000,
) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .order(orderColumn, { ascending: false })
    .limit(limit);

  if (error) {
    if (isKnownAnalyticsTableError(error.message)) {
      console.warn(`[seller-analytics] ${table} unavailable: ${error.message}`);
      return [] as T[];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as T[];
}

function serviceKey(service: ApiService) {
  return service.slug;
}

function createServiceMetric(service: ApiService): SellerAnalyticsService {
  return {
    serviceId: service.id,
    serviceSlug: service.slug,
    serviceName: service.name,
    endpoint: service.endpoint,
    method: service.method,
    status: service.status,
    sourceType: service.sourceType,
    priceLabel: service.priceLabel,
    paidCalls: 0,
    skippedCalls: 0,
    failedCalls: 0,
    estimatedUsdcRevenue: "0",
    buyerAgentWallets: 0,
    lastPurchaseAt: null,
  };
}

function resolveService(
  step: AgentPurchaseStepRow,
  servicesBySlug: Map<string, ApiService>,
  servicesByEndpoint: Map<string, ApiService>,
) {
  if (step.service_slug && servicesBySlug.has(step.service_slug)) {
    return servicesBySlug.get(step.service_slug) ?? null;
  }

  if (step.endpoint && servicesByEndpoint.has(step.endpoint)) {
    return servicesByEndpoint.get(step.endpoint) ?? null;
  }

  if (step.service_source_type === "seller_mock" && step.service_slug) {
    return {
      id: step.service_id ?? step.service_slug,
      slug: step.service_slug,
      name: step.service_name ?? step.service_slug,
      endpoint: step.endpoint ?? "",
      method: step.method === "POST" ? "POST" : "GET",
      sourceType: "seller_mock",
      status: "live",
      priceLabel: `${step.price_usdc ?? "0"} USDC`,
    } as ApiService;
  }

  return null;
}

function normalizedAmount(value: string | null | undefined) {
  return roundUsdc(toNumber(value));
}

function findPaymentEventForStep(
  step: AgentPurchaseStepRow,
  run: AgentRunRow | undefined,
  paymentEvents: PaymentEventRow[],
) {
  if (step.payment_event_id) {
    return paymentEvents.find((event) => event.id === step.payment_event_id) ?? null;
  }

  if (!step.endpoint || !run?.agent_wallet || !step.price_usdc) return null;

  const expectedAmount = normalizedAmount(step.price_usdc);
  const stepTime = new Date(step.created_at).getTime();

  return (
    paymentEvents
      .filter((event) => {
        const sameEndpoint = event.endpoint === step.endpoint;
        const samePayer =
          event.payer.toLowerCase() === run.agent_wallet?.toLowerCase();
        const sameAmount =
          Math.abs(normalizedAmount(event.amount_usdc) - expectedAmount) < 0.000001;
        const eventTime = new Date(event.created_at).getTime();
        const closeEnough = Math.abs(eventTime - stepTime) <= 10 * 60 * 1000;

        return sameEndpoint && samePayer && sameAmount && closeEnough;
      })
      .sort(
        (a, b) =>
          Math.abs(new Date(a.created_at).getTime() - stepTime) -
          Math.abs(new Date(b.created_at).getTime() - stepTime),
      )[0] ?? null
  );
}

function mergeWarnings(...warnings: Array<string | null | undefined>) {
  return warnings.filter(Boolean).join(" ") || null;
}

function sortByPaidThenRevenue(a: SellerAnalyticsService, b: SellerAnalyticsService) {
  if (b.paidCalls !== a.paidCalls) return b.paidCalls - a.paidCalls;
  return toNumber(b.estimatedUsdcRevenue) - toNumber(a.estimatedUsdcRevenue);
}

export async function getSellerAnalytics(options: { serviceId?: string } = {}) {
  const client = getServiceSupabase();
  const dynamicRowsResult = await listDynamicStoreServiceRows();
  const dynamicRows = dynamicRowsResult.services;
  const dynamicServices = dynamicRows.map(rowToApiService);
  const staticSlugs = new Set(serviceRegistry.map((service) => service.slug));
  const services = [
    ...serviceRegistry,
    ...dynamicServices.filter((service) => !staticSlugs.has(service.slug)),
  ];
  const selectedServiceIds = new Set(
    options.serviceId ? [options.serviceId] : services.map((service) => service.id),
  );
  const selectedServices = services.filter((service) => selectedServiceIds.has(service.id));

  if (!client) {
    return {
      ...emptyAnalytics(
        mergeWarnings(
          dynamicRowsResult.warning,
          "Supabase service role env is missing; seller analytics are unavailable.",
        ),
      ),
      overview: {
        ...emptyAnalytics(null).overview,
        totalServices: services.length,
        liveServices: services.filter((service) => service.status === "live").length,
        sellerCreatedServices: dynamicRows.length,
      },
    };
  }

  const [runs, steps, paymentEvents] = await Promise.all([
    selectRows<AgentRunRow>(client, "agent_runs", runColumns, "created_at"),
    selectRows<AgentPurchaseStepRow>(
      client,
      "agent_purchase_steps",
      stepColumns,
      "created_at",
    ),
    selectRows<PaymentEventRow>(
      client,
      "payment_events",
      paymentEventColumns,
      "created_at",
    ),
  ]);

  const servicesBySlug = new Map(services.map((service) => [service.slug, service]));
  const servicesByEndpoint = new Map(services.map((service) => [service.endpoint, service]));
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const metricsByService = new Map(
    selectedServices.map((service) => [serviceKey(service), createServiceMetric(service)]),
  );
  const sourceMetrics = new Map<
    ServiceSourceType,
    { services: number; paidCalls: number; revenue: number }
  >();
  const serviceWallets = new Map<string, Set<string>>();
  const buyerWallets = new Map<
    string,
    { paidCalls: number; skippedCalls: number; failedCalls: number; spent: number; lastRunAt: string | null }
  >();
  const purchases: SellerAnalyticsPurchase[] = [];

  for (const service of selectedServices) {
    sourceMetrics.set(service.sourceType, {
      services: (sourceMetrics.get(service.sourceType)?.services ?? 0) + 1,
      paidCalls: sourceMetrics.get(service.sourceType)?.paidCalls ?? 0,
      revenue: sourceMetrics.get(service.sourceType)?.revenue ?? 0,
    });
  }

  for (const step of steps) {
    const service = resolveService(step, servicesBySlug, servicesByEndpoint);
    if (!service || !selectedServiceIds.has(service.id)) continue;

    const key = serviceKey(service);
    const metric = metricsByService.get(key) ?? createServiceMetric(service);
    const run = runsById.get(step.run_id);
    const wallet = run?.agent_wallet ?? null;
    const amount = normalizedAmount(step.price_usdc);
    const matchedPaymentEvent = findPaymentEventForStep(step, run, paymentEvents);
    const revenueAmount =
      matchedPaymentEvent?.amount_usdc && step.status === "paid"
        ? normalizedAmount(matchedPaymentEvent.amount_usdc)
        : step.status === "paid"
          ? amount
          : 0;

    if (step.status === "paid") {
      metric.paidCalls++;
      metric.estimatedUsdcRevenue = formatUsdc(
        toNumber(metric.estimatedUsdcRevenue) + revenueAmount,
      );
      metric.lastPurchaseAt =
        !metric.lastPurchaseAt || step.created_at > metric.lastPurchaseAt
          ? step.created_at
          : metric.lastPurchaseAt;

      const source = sourceMetrics.get(service.sourceType) ?? {
        services: 0,
        paidCalls: 0,
        revenue: 0,
      };
      source.paidCalls++;
      source.revenue = roundUsdc(source.revenue + revenueAmount);
      sourceMetrics.set(service.sourceType, source);
    }

    if (step.status === "skipped") metric.skippedCalls++;
    if (step.status === "failed") metric.failedCalls++;

    if (wallet) {
      const normalizedWallet = wallet.toLowerCase();
      const walletsForService = serviceWallets.get(key) ?? new Set<string>();
      walletsForService.add(normalizedWallet);
      serviceWallets.set(key, walletsForService);

      const buyer = buyerWallets.get(normalizedWallet) ?? {
        paidCalls: 0,
        skippedCalls: 0,
        failedCalls: 0,
        spent: 0,
        lastRunAt: null,
      };
      if (step.status === "paid") {
        buyer.paidCalls++;
        buyer.spent = roundUsdc(buyer.spent + revenueAmount);
      }
      if (step.status === "skipped") buyer.skippedCalls++;
      if (step.status === "failed") buyer.failedCalls++;
      buyer.lastRunAt =
        run?.created_at && (!buyer.lastRunAt || run.created_at > buyer.lastRunAt)
          ? run.created_at
          : buyer.lastRunAt;
      buyerWallets.set(normalizedWallet, buyer);
    }

    metric.buyerAgentWallets = serviceWallets.get(key)?.size ?? 0;
    metricsByService.set(key, metric);

    if (step.status === "paid") {
      const explorerBase = (
        process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? ARC_TESTNET_EXPLORER_URL
      ).replace(/\/$/, "");
      purchases.push({
        stepId: step.id,
        createdAt: step.created_at,
        runId: step.run_id,
        runTask: run?.task ?? null,
        buyerWallet: wallet,
        serviceId: service.id,
        serviceSlug: service.slug,
        serviceName: service.name,
        serviceSourceType: service.sourceType,
        endpoint: step.endpoint,
        method: step.method,
        priceUsdc: formatUsdc(revenueAmount || amount),
        status: step.status,
        requestId: step.request_id,
        paymentEventId: step.payment_event_id,
        matchedPaymentEventId: matchedPaymentEvent?.id ?? null,
        gatewayTx: matchedPaymentEvent?.gateway_tx ?? null,
        onchainProofStatus: matchedPaymentEvent?.onchain_status ?? null,
        onchainTransactionHash: matchedPaymentEvent?.onchain_tx_hash ?? null,
        onchainContractAddress:
          matchedPaymentEvent?.onchain_contract_address ?? null,
        onchainBlockNumber: matchedPaymentEvent?.onchain_block_number ?? null,
        onchainProofId: matchedPaymentEvent?.onchain_proof_id ?? null,
        onchainTransactionUrl: matchedPaymentEvent?.onchain_tx_hash
          ? `${explorerBase}/tx/${matchedPaymentEvent.onchain_tx_hash}`
          : null,
      });
    }
  }

  const allMetrics = Array.from(metricsByService.values()).sort(sortByPaidThenRevenue);
  const paidCalls = allMetrics.reduce((sum, metric) => sum + metric.paidCalls, 0);
  const skippedCalls = allMetrics.reduce((sum, metric) => sum + metric.skippedCalls, 0);
  const failedCalls = allMetrics.reduce((sum, metric) => sum + metric.failedCalls, 0);
  const estimatedRevenue = allMetrics.reduce(
    (sum, metric) => sum + toNumber(metric.estimatedUsdcRevenue),
    0,
  );
  const linkedPaymentEvents = purchases.filter(
    (purchase) => purchase.paymentEventId || purchase.matchedPaymentEventId,
  ).length;
  const verifiedProofs = purchases.filter(
    (purchase) => purchase.onchainProofStatus === "verified",
  ).length;
  const pendingProofs = purchases.filter(
    (purchase) => purchase.onchainProofStatus === "pending",
  ).length;
  const failedProofs = purchases.filter(
    (purchase) => purchase.onchainProofStatus === "failed",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    warning: mergeWarnings(dynamicRowsResult.warning),
    overview: {
      totalServices: selectedServices.length,
      liveServices: selectedServices.filter((service) => service.status === "live")
        .length,
      sellerCreatedServices: dynamicRows.length,
      paidCalls,
      skippedCalls,
      failedCalls,
      estimatedUsdcRevenue: formatUsdc(estimatedRevenue),
      buyerAgentWallets: buyerWallets.size,
      linkedPaymentEvents,
      verifiedProofs,
      pendingProofs,
      failedProofs,
    },
    sourceBreakdown: Array.from(sourceMetrics.entries()).map(([sourceType, stats]) => ({
      sourceType,
      label: sourceLabel(sourceType),
      services: stats.services,
      paidCalls: stats.paidCalls,
      estimatedUsdcRevenue: formatUsdc(stats.revenue),
    })),
    topServices: allMetrics,
    recentPurchases: purchases
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 25),
    buyerWallets: Array.from(buyerWallets.entries())
      .map(([wallet, stats]) => ({
        wallet,
        paidCalls: stats.paidCalls,
        skippedCalls: stats.skippedCalls,
        failedCalls: stats.failedCalls,
        estimatedUsdcSpent: formatUsdc(stats.spent),
        lastRunAt: stats.lastRunAt,
      }))
      .sort(
        (a, b) => toNumber(b.estimatedUsdcSpent) - toNumber(a.estimatedUsdcSpent),
      ),
  } satisfies SellerAnalytics;
}
