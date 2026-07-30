import Link from "next/link";
import { ArrowRight, Bot, FileCheck2, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: "About",
  description:
    BRAND.description,
};

const paths = [
  {
    title: "Public App",
    icon: FileCheck2,
    body: "Choose a curated workflow, submit non-sensitive input, confirm one immutable quote, and receive a shareable report.",
    href: "/agent-runner",
    action: "Run a workflow",
  },
  {
    title: BRAND.agentApi,
    icon: Bot,
    body: "External agents discover schemas, create idempotent quotes and runs, then retrieve structured reports and Arc proofs.",
    href: "/console/agent-api",
    action: `Open ${BRAND.agentApi}`,
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Badge className="mb-5">Verifiable paid workflows</Badge>
          <h1 className="max-w-4xl text-4xl font-bold tracking-normal sm:text-6xl">
            {BRAND.name}
          </h1>
          <p className="mt-4 text-xl font-semibold">{BRAND.tagline}</p>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            {BRAND.name} turns real input into a priced workflow, purchases
            only allowlisted x402 services, and returns a structured result with
            receipts and an Arc Testnet proof trail.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2">
        {paths.map(({ title, icon: Icon, body, href, action }) => (
          <Card key={title} className="rounded-lg">
            <CardHeader>
              <Icon className="size-6 text-primary" />
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <p className="leading-7 text-muted-foreground">{body}</p>
              <Button asChild className="w-fit">
                <Link href={href}>
                  {action}
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="border-y bg-secondary/10">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3">
          {[
            [KeyRound, "Immutable quote", "Input hash, selected services, total price, and expiry are fixed before execution."],
            [ShieldCheck, "Fail-closed safety", "Durable idempotency, tenant isolation, budget limits, and single-attempt paid calls prevent unsafe replay."],
            [FileCheck2, "Verifiable result", "Reports link evidence, receipts, payment records, and Arc Testnet proof transactions."],
          ].map(([Icon, title, body]) => {
            const FeatureIcon = Icon as typeof KeyRound;
            return (
              <div key={String(title)} className="rounded-lg border bg-background p-5">
                <FeatureIcon className="size-5 text-primary" />
                <h2 className="mt-4 font-semibold">{String(title)}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(body)}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
