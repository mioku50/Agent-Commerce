import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertsClient } from "./alerts-client";

export const metadata: Metadata = {
  title: "Trust Alerts",
  description: "Meaningful changes from your Veyra Continuous Trust Monitoring watchlist.",
};

export default function AlertsPage() {
  return (
    <main>
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Badge className="mb-4">Continuous Trust Monitoring</Badge>
          <div className="flex items-center gap-3">
            <BellRing className="size-8 text-primary" />
            <h1 className="text-4xl font-bold">Trust Alerts</h1>
          </div>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Meaningful score, status, risk, availability, and Arc verification
            changes. Technical job, payment, and provider details stay private.
          </p>
        </div>
      </section>
      <AlertsClient />
    </main>
  );
}
