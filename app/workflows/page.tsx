/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hostedWorkflowTemplates } from "@/lib/agent/workflow-templates";

export const metadata = {
  title: "Workflow Templates | Arc Agent Commerce",
  description:
    "Hosted agent workflow templates that purchase allowlisted x402 APIs and produce verified Arc reports.",
};

export default function WorkflowsPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <Badge className="mb-4">Workflow Templates</Badge>
            <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">
              Start with a useful, guarded workflow
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Submit real input, preview the selected allowlisted services and
              cost, then let the hosted agent buy the APIs through x402 and
              assemble a shareable Final Report with receipts and Arc proofs.
            </p>
          </div>
          <Card className="rounded-lg">
            <CardContent className="grid gap-3 p-5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4 text-primary" />
                Arc Testnet guardrails
              </p>
              <p className="text-muted-foreground">
                Project-owned payer · allowlisted services only · maximum 3 paid
                calls · maximum 0.005 USDC per workflow.
              </p>
              <Button asChild>
                <Link href="/agent-runner">
                  Run Workflow
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-2">
        {hostedWorkflowTemplates.map((template) => (
          <Card key={template.value} className="command-card rounded-lg">
            <CardHeader>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Badge variant="secondary">Hosted workflow</Badge>
                <Badge variant="outline" className="font-mono">
                  estimated {template.estimatedSpendUsdc.toFixed(4)} USDC
                </Badge>
              </div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Bot className="size-5 text-primary" />
                {template.label}
              </CardTitle>
              <p className="leading-6 text-muted-foreground">
                {template.description}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div>
                <p className="text-sm font-semibold">Paid services</p>
                <div className="mt-3 grid gap-2">
                  {template.services.map((service) => (
                    <div
                      key={service.slug}
                      className="grid gap-2 rounded-md border bg-background/60 p-3 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {service.purpose}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {service.priceUsdc.toFixed(4)} USDC
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4" /> Expected Final Report
                </p>
                <div className="mt-3 grid gap-2">
                  {template.expectedResult.map((result) => (
                    <p
                      key={result}
                      className="flex gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      {result}
                    </p>
                  ))}
                </div>
              </div>
              <Button asChild>
                <Link href="/agent-runner">
                  Use this template
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
