/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInMemoryApiQualityAlerts,
  getInMemoryApiQualityObservations,
  runScheduledApiQualityProbes,
} from "@/lib/providers/api-quality";
import type { ProbeEngineOptions } from "@/lib/providers/api-quality-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitoring/probes
 * Returns recent API quality monitoring alerts and observation metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get("serviceId") || undefined;
    const alerts = getInMemoryApiQualityAlerts(serviceId);
    const observations = getInMemoryApiQualityObservations();

    return NextResponse.json(
      {
        ok: true,
        serviceId: serviceId || null,
        alertsCount: alerts.length,
        observationsCount: observations.length,
        alerts,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "probe_fetch_failed",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

/**
 * POST /api/monitoring/probes
 * Triggers scheduled or manual API quality monitoring probes across services.
 */
export async function POST(request: NextRequest) {
  try {
    let options: ProbeEngineOptions = {};
    if (request.headers.get("content-type")?.includes("application/json")) {
      try {
        options = (await request.json()) as ProbeEngineOptions;
      } catch {
        options = {};
      }
    }

    const summary = await runScheduledApiQualityProbes(options);

    return NextResponse.json(
      {
        ok: true,
        summary,
        alertsCount: summary.alerts.length,
        alertsTriggered: summary.alerts,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "probe_execution_failed",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
