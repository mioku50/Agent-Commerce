/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Download,
  ExternalLink,
  FileJson,
  Key,
  Layers,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentApiInteractiveClient } from "./agent-api-interactive-client";
import { MachineCredentialsClient, ProductionSmokeInstructions } from "./machine-credentials-client";

export const metadata = {
  title: "Agent API | Agent Developer Console | Arc Agent Commerce",
  description:
    "Machine API v1 developer quickstart, credential scopes, OpenAPI 3.0 spec, and interactive code snippets.",
};

const credentialScopes = [
  {
    scope: "workflows:read",
    endpoint: "GET /api/agent/v1/workflows",
    description: "Discover available workflow templates, list prices in USDC, and input schemas.",
  },
  {
    scope: "quotes:create",
    endpoint: "POST /api/agent/v1/quotes",
    description: "Create an immutable execution quote bound to workflow input with Idempotency-Key protection.",
  },
  {
    scope: "runs:create",
    endpoint: "POST /api/agent/v1/runs",
    description: "Launch sponsored or paid x402 workflow execution for a valid quote.",
  },
  {
    scope: "results:read",
    endpoint: "GET /api/agent/v1/runs/[runId] · GET /api/agent/v1/reports/[reportId]",
    description: "Poll run status and retrieve structured reports with Arc Testnet verification proofs.",
  },
];

export default function AgentApiConsolePage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header section */}
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="default">Agent Developer Console</Badge>
            <Badge variant="outline">Machine API v1</Badge>
            <Badge variant="secondary">Arc Testnet · Chain 5042002</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">
            Agent Machine API v1
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Allow external AI agents and automated microservices to discover workflows, create binding quotes, launch sponsored or paid runs, poll status, and retrieve verified structured reports with Arc proof trails.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="default" className="gap-2">
              <a href="/openapi/agent-commerce-v1.json" download="agent-commerce-v1.json">
                <Download className="size-4" />
                Download OpenAPI Spec (.json)
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/console/agents">
                <Key className="size-4" />
                Manage API Credentials
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6">
        <Card className="rounded-lg border-primary/30" id="credentials">
          <CardHeader>
            <CardTitle>Machine API Credentials</CardTitle>
            <CardDescription>
              Select an agent, create a namespace-bound credential, and manage rotation or revocation. Secrets are shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MachineCredentialsClient />
          </CardContent>
        </Card>

        {/* Quickstart Overview Card */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="rounded-lg border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-2">
                <Zap className="size-5" />
              </div>
              <CardTitle className="text-lg">Machine-to-Machine</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-6">
              Built for autonomous agent runtimes. Requires no browser or human interaction. Full idempotency protection on every state mutation.
            </CardContent>
          </Card>

          <Card className="rounded-lg border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-2">
                <Layers className="size-5" />
              </div>
              <CardTitle className="text-lg">Sponsored & Paid x402</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-6">
              Quotes seamlessly route through sponsored daily developer quota or explicit x402 USDC payment transactions on Arc Testnet.
            </CardContent>
          </Card>

          <Card className="rounded-lg border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-2">
                <ShieldCheck className="size-5" />
              </div>
              <CardTitle className="text-lg">Arc Verifiable Proofs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-6">
              Final reports include immutable Arc block explorer links and proof hashes verifying allowlisted x402 service purchases.
            </CardContent>
          </Card>
        </div>

        {/* Credential Scopes Table Card */}
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="size-5 text-primary" />
                <CardTitle>Credential Scopes & Endpoints</CardTitle>
              </div>
              <Badge variant="outline">OAuth 2.0 / Bearer Style</Badge>
            </div>
            <CardDescription>
              Each API credential can be restricted to specific permissions. Requests with missing scopes return 403 <code className="text-xs">scope_denied</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-secondary/30 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Endpoint</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-muted-foreground">
                  {credentialScopes.map((row) => (
                    <tr key={row.scope} className="hover:bg-secondary/10">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {row.scope}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">{row.endpoint}</td>
                      <td className="px-4 py-3 text-xs leading-5">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Interactive Code Snippets Component */}
        <Card className="rounded-lg border-primary/25" id="quickstart">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="size-5 text-primary" />
                <CardTitle>Interactive Code Examples & SDK Quickstart</CardTitle>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">
                TypeScript · Python · cURL
              </Badge>
            </div>
            <CardDescription>
              Copy runnable code snippets or test endpoints directly in your terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentApiInteractiveClient />
          </CardContent>
        </Card>

        <ProductionSmokeInstructions />

        {/* OpenAPI Specification Card */}
        <Card className="rounded-lg bg-secondary/10">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileJson className="size-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">OpenAPI 3.0.3 Specification</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Import our complete Machine API specification into Postman, Insomnia, or Swagger UI.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href="/openapi/agent-commerce-v1.json" target="_blank" rel="noopener noreferrer">
                  View JSON
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
              <Button asChild size="sm" className="gap-2">
                <a href="/openapi/agent-commerce-v1.json" download="agent-commerce-v1.json">
                  <Download className="size-3.5" />
                  Download Spec
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
