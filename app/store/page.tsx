/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { ArrowUpRight, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serviceRegistry } from "@/lib/services/registry";

export const metadata = {
  title: "API Store | Arc Agent Commerce",
  description:
    "Browse demo API services that AI agents can buy with USDC on Arc.",
};

export default function StorePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            API Store Demo
          </p>
          <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
            Services agents can buy
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            This initial registry lists paid API services for Arc Agent
            Commerce. Existing x402 premium endpoints stay in place, while new
            store-native routes can be wired in later phases.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            <Home />
            Back Home
          </Link>
        </Button>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 sm:px-6 lg:grid-cols-2">
        {serviceRegistry.map((service) => (
          <Card key={service.id} className="flex flex-col">
            <CardHeader>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{service.category}</Badge>
                <Badge variant={service.status.includes("Live") ? "default" : "outline"}>
                  {service.status}
                </Badge>
              </div>
              <CardTitle>{service.name}</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                {service.description}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5">
              <dl className="grid gap-3 text-sm">
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="font-semibold text-muted-foreground">Method</dt>
                  <dd className="font-mono">{service.method}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="font-semibold text-muted-foreground">Endpoint</dt>
                  <dd className="break-all font-mono">{service.endpoint}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="font-semibold text-muted-foreground">Price</dt>
                  <dd className="font-mono">{service.priceLabel}</dd>
                </div>
              </dl>
              <div className="mt-auto border-t pt-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                  Example use case
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {service.exampleUseCase}
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={service.endpoint}>
                  Open Endpoint
                  <ArrowUpRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
