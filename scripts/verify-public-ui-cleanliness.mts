/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const FORBIDDEN_JARGON = [
  "Phase 28",
  "Canary only",
  "project-owned payer",
  "treasury",
  "SHA-256",
  "idempotency",
  "provider cost",
  "platform fee",
  "policy_denied",
  "wallet_already_registered",
];

const PUBLIC_PATHS = ["/", "/agent-runner", "/results"];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

function baseUrl() {
  const argument = process.argv.find((value) => value.startsWith("--base-url="));
  return (argument?.slice("--base-url=".length) ?? process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
}

async function verifyPageCleanliness(page: Page, path: string) {
  await page.goto(`${baseUrl()}${path}`, { waitUntil: "load" });

  const { visibleText, innerHtmlWithoutDetails } = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    const hiddenElements = clone.querySelectorAll("details, script, style");
    hiddenElements.forEach((el) => el.remove());

    return {
      visibleText: clone.innerText || clone.textContent || "",
      innerHtmlWithoutDetails: clone.innerHTML || "",
    };
  });

  for (const jargon of FORBIDDEN_JARGON) {
    const regex = new RegExp(jargon, "i");
    assert(
      !regex.test(visibleText),
      `Forbidden technical jargon "${jargon}" found in visible text of ${path}`
    );
    assert(
      !regex.test(innerHtmlWithoutDetails),
      `Forbidden technical jargon "${jargon}" found in HTML body (outside <details>) of ${path}`
    );
  }
}

async function verifyLayoutConstraints(page: Page, path: string, viewportName: string) {
  await page.goto(`${baseUrl()}${path}`, { waitUntil: "load" });
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  assert(
    overflow.scroll <= overflow.client + 1,
    `${path} overflows horizontally on ${viewportName} (${overflow.scroll} > ${overflow.client}).`
  );
}

async function main() {
  console.log(`[verify-public-ui-cleanliness] starting tests against ${baseUrl()}...`);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    for (const path of PUBLIC_PATHS) {
      await verifyPageCleanliness(page, path);
      console.log(`  ✓ ${path} verified clean of forbidden jargon`);
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const path of PUBLIC_PATHS) {
        await verifyLayoutConstraints(page, path, viewport.name);
      }
      console.log(`  ✓ Layout constraints passed for ${viewport.name} (${viewport.width}x${viewport.height})`);
    }

    console.log("[verify-public-ui-cleanliness] PASSED: All public routes are clean of technical jargon and obey layout constraints.");
  } finally {
    await browser.close();
  }
}

await main();
