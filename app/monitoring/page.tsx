import { Activity, BellRing, History, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { TrustMonitoringClient } from "./trust-monitoring-client";
import { WebhookSettings } from "./webhook-settings";

export const metadata = {
  title: "Continuous Trust Monitoring",
  description:
    "Save agents and projects, schedule rechecks, and review Arc-verified trust changes over time.",
};

type MonitoringPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MonitoringPage({ searchParams }: MonitoringPageProps) {
  const query = await searchParams;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-white/5 bg-gradient-to-b from-[#0a0d15] via-[#080a0f] to-[#07090e] py-12 sm:py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <Badge className="mb-4 rounded-full border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-300">
            Continuous Trust Monitoring
          </Badge>
          <h1 className="max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl gradient-text">
            Know when trust signals change.
          </h1>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground text-sm sm:text-base">
            Save a GitHub project, AI agent, wallet, Arc contract, or public service endpoint. {BRAND.name} rechecks the same subject and shows only meaningful changes between canonical reports.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [BellRing, "Daily or weekly", "Explicit owner-controlled schedules"],
              [Activity, "Delta reports", "New risks, improvements, and activity"],
              [History, "Trust history", "Current and previous score snapshots"],
              [ShieldCheck, "Arc proofs", "Exact report hash for every snapshot"],
            ].map(([Icon, title, description]) => (
              <Card key={String(title)} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-1 backdrop-blur-xl transition-all duration-300 hover:border-primary/40 hover:-translate-y-1">
                <CardContent className="flex items-start gap-3.5 p-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{String(title)}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {String(description)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <TrustMonitoringClient
        initialInput={{
          agentId: first(query.agentId),
          agentWallet: first(query.agentWallet),
          repositoryUrl: first(query.repositoryUrl),
          contractAddress: first(query.contractAddress),
          serviceEndpoint: first(query.serviceEndpoint),
        }}
      />
      <WebhookSettings />
    </main>
  );
}
