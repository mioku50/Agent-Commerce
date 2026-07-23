import assert from "node:assert/strict";
import {
  DEFAULT_HOSTED_WORKFLOW,
  DEFAULT_MARKET_SYMBOL,
  hostedWorkflowHref,
  parseHostedRunnerQuery,
} from "../lib/agent/workflow-links.ts";
import {
  filterAndSortResults,
  parseResultsFilters,
} from "../lib/agent/results-filters.ts";
import {
  HOSTED_REQUESTER_IDENTITY_LABEL,
  HOSTED_REQUESTER_NOT_CHARGED_COPY,
  HOSTED_REQUESTER_PAYMENT_COPY,
  hostedRequesterDisplayLine,
  hostedInputPreviewHelper,
} from "../lib/agent/hosted-ui.ts";
import {
  defaultServicePresentation,
  providerResponsePresentation,
  servicePresentationLabel,
} from "../lib/services/presentation.ts";
import {
  DESKTOP_SIDEBAR_SCROLL_CLASS,
  MOBILE_SIDEBAR_SCROLL_CLASS,
  publicSidebarNavigation,
  consoleSidebarNavigation,
  sidebarNavigation,
} from "../lib/navigation/sidebar.ts";
import { humanizeError } from "../lib/errors/humanize-error.ts";

assert.equal(hostedWorkflowHref("sentiment_tone"), "/agent-runner?workflow=sentiment");
assert.equal(hostedWorkflowHref("builder_update"), "/agent-runner?workflow=builder_update");
assert.equal(hostedWorkflowHref("market_context", "ETH/USD"), "/agent-runner?workflow=market_context&symbol=ETH%2FUSD");
assert.equal(hostedWorkflowHref("custom_task"), "/agent-runner?workflow=custom");

assert.deepEqual(parseHostedRunnerQuery({ workflow: "builder_update" }), {
  workflowType: "builder_update",
  marketSymbol: "BTC/USD",
});
assert.deepEqual(parseHostedRunnerQuery({ workflow: "market_context", symbol: "sol/usd" }), {
  workflowType: "market_context",
  marketSymbol: "SOL/USD",
});
assert.deepEqual(parseHostedRunnerQuery({ workflow: "invalid", symbol: "DOGE/USD" }), {
  workflowType: DEFAULT_HOSTED_WORKFLOW,
  marketSymbol: DEFAULT_MARKET_SYMBOL,
});
assert.deepEqual(parseHostedRunnerQuery({ workflow: "market_context", symbol: "invalid" }), {
  workflowType: "market_context",
  marketSymbol: DEFAULT_MARKET_SYMBOL,
});

const reports = [
  { id: "old", workflowType: "builder_update" as const, inputPreview: "Builder shipped", summary: "Completed builder report", spentUsdc: "0.001", completedWithWarnings: false, generatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "warning", workflowType: "market_context" as const, inputPreview: "ETH volatility", summary: "Market result with warning", spentUsdc: "0.0013", completedWithWarnings: true, generatedAt: "2026-02-01T00:00:00.000Z" },
  { id: "high", workflowType: "sentiment_tone" as const, inputPreview: "Clear update", summary: "Sentiment report", spentUsdc: "0.004", completedWithWarnings: false, generatedAt: "2026-03-01T00:00:00.000Z" },
];
assert.deepEqual(
  filterAndSortResults(reports, parseResultsFilters({ q: "eth", status: "warnings" })).map(({ id }) => id),
  ["warning"],
);
assert.deepEqual(
  filterAndSortResults(reports, parseResultsFilters({ workflow: "builder_update", sort: "oldest" })).map(({ id }) => id),
  ["old"],
);
assert.deepEqual(
  filterAndSortResults(reports, parseResultsFilters({ sort: "spend" })).map(({ id }) => id),
  ["high", "warning", "old"],
);

assert.equal(hostedInputPreviewHelper("short"), "Enter at least 20 characters to preview the workflow.");
assert.equal(hostedInputPreviewHelper("This input is definitely long enough."), null);
assert.equal(HOSTED_REQUESTER_IDENTITY_LABEL, "Requester & workflow payer");
assert.equal(HOSTED_REQUESTER_NOT_CHARGED_COPY, "Sponsored workflows will not charge your wallet.");
assert.equal(
  hostedRequesterDisplayLine("0x1234567890abcdef1234567890abcdef12345678"),
  "Requested by 0x1234567890abcdef1234567890abcdef12345678",
);
assert.equal(hostedRequesterDisplayLine(null), "No requester identity supplied.");
assert.equal(
  HOSTED_REQUESTER_PAYMENT_COPY,
  "After the sponsored quota, this wallet confirms one Arc Testnet USDC workflow payment.",
);

const futureProvider = {
  ...defaultServicePresentation("provider_backed"),
  providerName: "Future Data Network",
  assetSymbol: "ABC/USD",
};
assert.equal(servicePresentationLabel(futureProvider), "Live Provider · Future Data Network");
assert.deepEqual(
  providerResponsePresentation({
    provider: "Future Data Network",
    symbol: "ABC/USD",
    price: "12.34",
    paidAmountUsdc: "0.001",
    feedId: "must-not-be-presented",
    authorization: "must-not-be-presented",
  }),
  {
    providerName: "Future Data Network",
    assetSymbol: "ABC/USD",
    price: "12.34",
    confidence: null,
    confidenceLow: null,
    confidenceHigh: null,
    publishTime: null,
    fetchedAt: null,
    priceAgeSeconds: null,
    paidAmountUsdc: "0.001",
  },
);

assert.deepEqual(publicSidebarNavigation.map(({ label }) => label), ["Menu"]);
assert.deepEqual(
  publicSidebarNavigation[0].items.map(({ label, href }) => ({ label, href })),
  [
    { label: "Home", href: "/" },
    { label: "New Report", href: "/agent-runner" },
    { label: "My Reports", href: "/results" },
  ],
);
assert.deepEqual(sidebarNavigation, publicSidebarNavigation);

assert.deepEqual(consoleSidebarNavigation.map(({ label }) => label), ["Developer Console"]);
assert.deepEqual(
  consoleSidebarNavigation[0].items.map(({ label, href }) => ({ label, href })),
  [
    { label: "Console Home", href: "/console" },
    { label: "Agents", href: "/console/agents" },
    { label: "Services / Seller", href: "/console/seller" },
    { label: "Developer Tools", href: "/console/developer-tools" },
    { label: "Audit & Verification", href: "/console/audit" },
  ],
);

assert(DESKTOP_SIDEBAR_SCROLL_CLASS.includes("overflow-y-auto"));
assert(MOBILE_SIDEBAR_SCROLL_CLASS.includes("overflow-y-auto"));

assert.deepEqual(humanizeError("wallet_already_registered"), {
  title: "Wallet already connected",
  message: "This wallet is already assigned to an agent. Open the existing agent or use another wallet.",
  actionLabel: "Open Agent",
  actionHref: "/console/agents",
  technicalCode: "wallet_already_registered",
});

assert.deepEqual(humanizeError("policy_denied: workflow_not_allowed"), {
  title: "Workflow disabled",
  message: "This workflow is not enabled for the selected agent.",
  actionLabel: "Open Spending Policy",
  actionHref: "/console/agents",
  technicalCode: "policy_denied:workflow_not_allowed",
});

assert.deepEqual(humanizeError("policy_denied: service_type_not_allowed Live Data"), {
  title: "Required service unavailable",
  message: "This workflow requires Live Data, but Live Data is disabled in the agent policy.",
  actionLabel: "Enable Live Data",
  actionHref: "/console/agents",
  technicalCode: "policy_denied:service_type_not_allowed",
});

assert.deepEqual(humanizeError("policy_denied: max_run_exceeded"), {
  title: "Price exceeds agent limit",
  message: "This report costs more than the agent's maximum amount per run.",
  actionLabel: "Update Limit",
  actionHref: "/console/agents",
  technicalCode: "policy_denied:max_run_exceeded",
});

assert.deepEqual(humanizeError("policy_denied: daily_spend_exceeded"), {
  title: "Daily spending limit reached",
  message: "The agent has reached its daily USDC limit. Increase the limit or try again tomorrow.",
  actionLabel: "Update Limit",
  actionHref: "/console/agents",
  technicalCode: "policy_denied:daily_spend_exceeded",
});

assert.deepEqual(humanizeError("policy_denied: daily_calls_exceeded"), {
  title: "Daily run limit reached",
  message: "The agent has used all allowed calls for today.",
  actionLabel: "Update Limit",
  actionHref: "/console/agents",
  technicalCode: "policy_denied:daily_calls_exceeded",
});

assert.deepEqual(humanizeError("policy_denied"), {
  title: "Action denied by agent policy",
  message: "The selected action violates the agent's active spending policy.",
  actionLabel: "Open Spending Policy",
  actionHref: "/console/agents",
  technicalCode: "policy_denied",
});

assert.deepEqual(humanizeError("connected wallet mismatch"), {
  title: "Switch wallet to continue",
  message: "The connected wallet is not the registered agent payment wallet.",
  actionLabel: "Switch Wallet",
  technicalCode: "wallet_mismatch",
});

assert.deepEqual(humanizeError("wrong network: requires Arc Testnet"), {
  title: "Switch to Arc Testnet",
  message: "This action requires Arc Testnet.",
  actionLabel: "Switch Network",
  technicalCode: "wrong_network",
});

assert.deepEqual(humanizeError("quote expired"), {
  title: "Price expired",
  message: "Refresh the price before continuing. No payment has been made.",
  actionLabel: "Refresh Price",
  technicalCode: "quote_expired",
});

assert.deepEqual(humanizeError("credential missing or revoked"), {
  title: "Active credential required",
  message: "Create a new API credential before running this external agent.",
  actionLabel: "Create Credential",
  actionHref: "/console/agents",
  technicalCode: "credential_missing",
});

assert.deepEqual(humanizeError("unexpected backend crash (err_500)"), {
  title: "Something went wrong",
  message: "unexpected backend crash",
  actionLabel: "Try Again",
  technicalCode: "generic_error",
});

console.log("[frontend-ux-test] passed: template deep links, safe query/symbol parsing, Results search/filter/sort, disabled-input helper, requester/payer checkout copy, generic provider presentation, scrollable sidebar model, and humanized error mapper");
