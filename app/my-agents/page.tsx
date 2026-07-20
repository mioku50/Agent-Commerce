import { Badge } from "@/components/ui/badge";
import { getByoaDiagnostic } from "@/lib/byoa/config";
import { MyAgentsClient } from "./my-agents-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Agents | Arc Agent Commerce",
  description: "Register a non-custodial external agent, verify its Arc wallet, and manage API spending policy.",
};

export default function MyAgentsPage() {
  const diagnostic = getByoaDiagnostic();
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge>Phase 28</Badge>
            <Badge variant="outline">Arc Testnet · chain 5042002</Badge>
            <Badge variant="secondary">Canary only</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">My Agents</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Bind an owner wallet to an external agent wallet, set atomic spending limits,
            and issue revocable API credentials. Arc Agent Commerce never asks for or
            stores either wallet&apos;s private key.
          </p>
        </div>
      </section>
      <MyAgentsClient diagnostic={diagnostic} />
    </main>
  );
}
