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
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <Badge className="mb-4">Continuous Trust Monitoring</Badge>
          <h1 className="max-w-4xl text-4xl font-bold sm:text-5xl">
            Know when trust signals change.
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Save a GitHub project, AI agent, wallet, Arc contract, or public
            service endpoint. {BRAND.name} rechecks the same subject and shows
            only meaningful changes between canonical reports.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [BellRing, "Daily or weekly", "Explicit owner-controlled schedules"],
              [Activity, "Delta reports", "New risks, improvements, and activity"],
              [History, "Trust history", "Current and previous score snapshots"],
              [ShieldCheck, "Arc proofs", "Exact report hash for every snapshot"],
            ].map(([Icon, title, description]) => (
              <Card key={String(title)} className="rounded-lg">
                <CardContent className="flex gap-3 p-4">
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{String(title)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
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
