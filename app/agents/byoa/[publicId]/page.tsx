import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Bot, ReceiptText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicAgentPassport } from "@/lib/byoa/service";

type Props = { params: Promise<{ publicId: string }> };
export const dynamic = "force-dynamic";

export default async function ByoaPassportPage({ params }: Props) {
  const { publicId } = await params;
  const data = await getPublicAgentPassport(publicId).catch(() => null);
  if (!data) notFound();
  const passport = data.passport as Record<string, unknown>;
  return <main className="min-h-screen bg-background"><section className="border-b bg-secondary/20"><div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6"><div className="mb-4 flex flex-wrap gap-2"><Badge>Registered External Agent</Badge><Badge variant="outline">Arc Testnet</Badge><Badge variant="secondary">Non-custodial</Badge></div><h1 className="text-4xl font-bold">{data.agent.displayName}</h1><p className="mt-3 break-all font-mono text-sm text-muted-foreground">{data.agent.publicId}</p><p className="mt-2 break-all font-mono text-xs text-muted-foreground">Agent wallet · {data.agent.agentWallet}</p></div></section><section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={Bot} label="Workflows" value={passport.total_workflows} /><Stat icon={BadgeCheck} label="Reports" value={passport.completed_reports} /><Stat icon={ReceiptText} label="Successful calls" value={passport.successful_calls} /><Stat icon={ShieldCheck} label="Verified proofs" value={passport.verified_proofs} /></div><Card><CardHeader><CardTitle>Separate registered-agent accounting</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-muted-foreground">Workflow payments</p><p className="font-mono">{String(passport.workflow_spent_usdc ?? "0")} USDC</p></div><div><p className="text-muted-foreground">Downstream API spend</p><p className="font-mono">{String(passport.downstream_spent_usdc ?? "0")} USDC</p></div><div><p className="text-muted-foreground">Success rate</p><p className="font-mono">{String(passport.success_rate ?? "0")}%</p></div></CardContent></Card><Card><CardHeader><CardTitle>Public-safe history</CardTitle></CardHeader><CardContent className="grid gap-3">{data.recentRuns.length ? data.recentRuns.map((run) => <div key={String(run.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><Badge variant="outline">{String(run.status)}</Badge><p className="mt-2 text-sm">{String(run.workflow_type)}</p></div>{run.agent_run_id ? <Button asChild size="sm" variant="outline"><Link href={`/runs/${String(run.agent_run_id)}`}>Agent Run</Link></Button> : null}</div>) : <p className="text-sm text-muted-foreground">No registered-agent workflows yet.</p>}</CardContent></Card></section></main>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: unknown }) {
  return <Card><CardContent className="p-5"><Icon className="size-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="mt-1 font-mono text-2xl font-semibold">{String(value ?? 0)}</p></CardContent></Card>;
}
