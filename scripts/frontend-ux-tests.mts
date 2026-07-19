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
  HOSTED_REQUESTER_PAYMENT_COPY,
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
  sidebarNavigation,
} from "../lib/navigation/sidebar.ts";

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
assert.equal(HOSTED_REQUESTER_IDENTITY_LABEL, "Requester identity");
assert.equal(
  HOSTED_REQUESTER_PAYMENT_COPY,
  "This wallet does not pay for hosted workflows. Payments are made by the project-owned Arc Testnet payer.",
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

assert.deepEqual(sidebarNavigation.map(({ label }) => label), [
  "Workflows",
  "Verification",
  "Advanced",
  "Operator",
]);
assert(sidebarNavigation.flatMap(({ items }) => items).some(({ label }) => label === "Seller"));
assert(DESKTOP_SIDEBAR_SCROLL_CLASS.includes("overflow-y-auto"));
assert(MOBILE_SIDEBAR_SCROLL_CLASS.includes("overflow-y-auto"));

console.log("[frontend-ux-test] passed: template deep links, safe query/symbol parsing, Results search/filter/sort, disabled-input helper, requester identity copy, generic provider presentation, and scrollable sidebar model");
