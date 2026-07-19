import assert from "node:assert/strict";
import { chromium } from "playwright";

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (argument?.slice("--base-url=".length) ?? process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
}

async function noHorizontalOverflow(page: import("playwright").Page, path: string) {
  await page.goto(`${baseUrl()}${path}`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(overflow.scroll <= overflow.client + 1, `${path} overflows horizontally (${overflow.scroll} > ${overflow.client}).`);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  await page.goto(`${baseUrl()}/`, { waitUntil: "networkidle" });
  await page.locator('a[href="/agent-runner?workflow=sentiment"]').first().waitFor();
  await page.locator('a[href="/agent-runner?workflow=builder_update"]').first().waitFor();
  await page.locator('a[href="/agent-runner?workflow=market_context&symbol=BTC%2FUSD"]').first().waitFor();

  await page.goto(`${baseUrl()}/agent-runner?workflow=builder_update`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#workflow-type").inputValue(), "builder_update");
  await page.locator("#workflow-type").selectOption("market_context");
  await page.locator("#market-symbol").waitFor();
  await page.locator("#workflow-type").selectOption("sentiment_tone");
  assert.equal(await page.locator("#market-symbol").count(), 0);
  await page.goto(`${baseUrl()}/agent-runner?workflow=market_context&symbol=ETH%2FUSD`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#workflow-type").inputValue(), "market_context");
  assert.equal(await page.locator("#market-symbol").inputValue(), "ETH/USD");
  await page.goto(`${baseUrl()}/agent-runner?workflow=invalid&symbol=DOGE%2FUSD`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#workflow-type").inputValue(), "sentiment_tone");
  await page.getByText("Enter at least 20 characters to preview the workflow.", { exact: true }).waitFor();
  await page.getByText("Requester identity", { exact: false }).first().waitFor();
  await page.getByText("Your wallet will not be charged.", { exact: false }).first().waitFor();
  await page.getByText("This wallet does not pay for hosted workflows.", { exact: false }).first().waitFor();
  await page.getByText("External LLM processing:", { exact: false }).waitFor();
  await page.getByLabel("Workflow", { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "hosted-task");

  await page.goto(`${baseUrl()}/workflows`, { waitUntil: "networkidle" });
  await page.locator('a[href="/agent-runner?workflow=custom"]').waitFor();
  const provider = page.locator('[data-provider-type="live_provider"]').first();
  await provider.getByText("Live Provider · Pyth Network", { exact: true }).waitFor();
  await provider.getByText("USDC pays Arc Agent Commerce", { exact: false }).waitFor();

  await page.goto(`${baseUrl()}/results?workflow=market_context&status=warnings&sort=spend&q=ETH`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("Search reports").inputValue(), "ETH");
  assert.equal(await page.getByLabel("Workflow").inputValue(), "market_context");
  assert.equal(await page.getByLabel("Completion status").inputValue(), "warnings");
  assert.equal(await page.getByLabel("Sort").inputValue(), "spend");
  await page.locator('[data-testid="results-count"]').waitFor();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1093, height: 614 },
    { width: 911, height: 512 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/agent-runner", "/workflows", "/results", "/proofs"]) {
      await noHorizontalOverflow(page, path);
    }
  }

  await page.setViewportSize({ width: 911, height: 512 });
  await page.goto(`${baseUrl()}/`, { waitUntil: "networkidle" });
  const desktopSidebar = page.locator('[data-testid="desktop-sidebar"]');
  await desktopSidebar.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await desktopSidebar.getByRole("link", { name: "Seller", exact: true }).scrollIntoViewIfNeeded();
  await desktopSidebar.getByRole("link", { name: "Seller", exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl()}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const mobileSidebar = page.locator('[data-testid="mobile-sidebar"]');
  assert.equal(await mobileSidebar.getAttribute("aria-hidden"), "false");
  await mobileSidebar.getByRole("link", { name: "Results", exact: true }).click();
  await page.waitForURL(`${baseUrl()}/results`);
  assert.equal(await mobileSidebar.getAttribute("aria-hidden"), "true");

  console.log("[frontend-responsive-smoke] passed: deep links, query-backed Results controls, helper/requester/provider copy, keyboard labels, desktop/125%/150%/tablet/mobile overflow, scrollable Seller link, and mobile close-on-navigation");
} finally {
  await browser.close();
}
