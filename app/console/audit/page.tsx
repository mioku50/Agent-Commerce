import Link from "next/link";
import { ArrowRight, ListChecks, ShieldCheck, BadgeCheck, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Audit & Verification | Developer Console | Arc Agent Commerce",
  description: "Unified audit trail for Activity, Arc Proofs, Agent Passports, and Commerce Receipts.",
};

const auditCards = [
  {
    title: "Activity",
    href: "/runs",
    icon: ListChecks,
    badge: "Execution Timeline",
    description: "Inspect how buyer agents plan, select paid services, execute x402 calls, and post settlement proofs.",
  },
  {
    title: "Arc Proofs",
    href: "/proofs",
    icon: ShieldCheck,
    badge: "Onchain Registry",
    description: "App-owned AgentCommerceProofRegistry records on Arc Testnet created after successful x402 settlement.",
  },
  {
    title: "Agent Passports",
    href: "/agents",
    icon: BadgeCheck,
    badge: "Identity & Reputation",
    description: "Public buyer-agent reputation passports derived from run history, completed reports, and verified proofs.",
  },
  {
    title: "Commerce Receipts",
    href: "/receipts",
    icon: ReceiptText,
    badge: "Payment Audit",
    description: "Immutable receipts linked to Final Reports, buyer Passports, payment events, and Arc proofs.",
  },
];

export default function ConsoleAuditPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="default">Audit & Verification</Badge>
            <Badge variant="outline">Arc Testnet</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-normal sm:text-5xl">Audit & Verification</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Complete transparency layer for Arc Agent Commerce. Access real-time activity timelines, onchain Arc proofs, buyer agent passports, and verified commerce receipts.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2">
        {auditCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.href} className="command-card rounded-lg flex flex-col justify-between">
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <Badge variant="secondary">{card.badge}</Badge>
                </div>
                <CardTitle className="text-xl">{card.title}</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6">
                  {card.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" className="w-full">
                  <Link href={card.href}>
                    View {card.title}
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
