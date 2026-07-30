import Link from "next/link";
import { Activity, ArrowRight, Bot, Code2, Wrench, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: { absolute: BRAND.developerConsole },
  description: "Developer and operator tools for agent credentials, workflow operations, and Arc verification.",
  openGraph: {
    title: BRAND.developerConsole,
    description: "Developer and operator tools for agent credentials, workflow operations, and Arc verification.",
  },
};

const consoleSections = [
  {
    title: "Agents",
    href: "/console/agents",
    icon: Bot,
    description:
      "Owner verification, external agent registration, wallet binding, spending policy, API credentials, test console, and Agent Passport.",
    badge: "BYOA Agent Management",
  },
  {
    title: BRAND.agentApi,
    href: "/console/agent-api",
    icon: Code2,
    description:
      "Machine-to-machine access for agents that discover workflows, create quotes, execute paid runs, and retrieve verified reports.",
    badge: "Machine-to-Machine API v1",
  },
  {
    title: "Production Operations",
    href: "/console/operations",
    icon: Activity,
    description:
      "Execution failures, provider latency, payment health, Arc proof delays, active alerts, and retry policy.",
    badge: "Observability",
  },
  {
    title: "Developer Tools",
    href: "/console/developer-tools",
    icon: Wrench,
    description:
      "Local CLI setup, system configuration, planner dry-runs, wallet funding, and developer utilities.",
    badge: "Local CLI & Utilities",
  },
  {
    title: "Audit & Verification",
    href: "/console/audit",
    icon: ShieldCheck,
    description:
      "Unified links & status for Activity timelines, Arc Proofs, Agent Passports, and Commerce Receipts.",
    badge: "Public & Onchain Records",
  },
];

export default function ConsoleDashboardPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="default">{BRAND.developerConsole}</Badge>
            <Badge variant="outline">Arc Testnet</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">{BRAND.developerConsole}</h1>
          <p className="mt-3 text-lg font-semibold">Developer and operator tools</p>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Build with the {BRAND.agentApi}, manage agent credentials, inspect production workflow health, and verify complete Arc proof trails.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2">
        {consoleSections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.href} className="command-card rounded-lg flex flex-col justify-between">
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <Badge variant="secondary">{section.badge}</Badge>
                </div>
                <CardTitle className="text-xl">{section.title}</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6">
                  {section.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild className="w-full">
                  <Link href={section.href}>
                    Open {section.title}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
