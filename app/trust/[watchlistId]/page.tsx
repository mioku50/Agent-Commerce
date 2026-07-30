import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  History,
  Minus,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getPublicTrustHistory,
  TrustMonitoringError,
} from "@/lib/monitoring/service";
import type { TrustDeltaChange, TrustDeltaReport } from "@/lib/monitoring/types";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ChangeIcon({ kind }: { kind: TrustDeltaChange["kind"] }) {
  if (kind === "new_risk") return <AlertTriangle className="size-4 text-red-400" />;
  if (kind === "improved") return <ArrowUpRight className="size-4 text-emerald-400" />;
  if (kind === "activity") return <Activity className="size-4 text-blue-400" />;
  return <ArrowRight className="size-4 text-amber-400" />;
}

function DeltaSummary({ delta }: { delta: TrustDeltaReport | null }) {
  if (!delta || !delta.previousSnapshotId) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex gap-3 p-5 text-sm text-muted-foreground">
          <History className="size-5 shrink-0" />
          This is the baseline snapshot. Changes will appear after the next recheck.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>What changed</CardTitle>
          <Badge variant="outline">
            {delta.summary.totalChanges} confirmed change
            {delta.summary.totalChanges === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {delta.changes.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
            <Minus className="size-4" />
            No material trust signal changed.
          </div>
        ) : (
          delta.changes.map((item) => (
            <div
              key={item.code}
              className="grid gap-2 rounded-md border bg-secondary/10 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start"
            >
              <ChangeIcon kind={item.kind} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  <Badge variant="outline">{item.kind.replaceAll("_", " ")}</Badge>
                  {item.severity !== "info" ? (
                    <Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>
                      {item.severity}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {String(item.before ?? "—")} → {String(item.after ?? "—")}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function TrustHistoryPage({ params }: RouteContext) {
  const { watchlistId } = await params;
  let data: Awaited<ReturnType<typeof getPublicTrustHistory>>;
  try {
    data = await getPublicTrustHistory(watchlistId);
  } catch (error) {
    if (error instanceof TrustMonitoringError && error.status === 404) notFound();
    throw error;
  }
  const report = data.currentReport;
  const history = [...data.history].reverse();
  const chartPoints = history
    .filter((item) => item.score !== null)
    .map((item, index, values) => ({
      x: values.length <= 1 ? 50 : (index / (values.length - 1)) * 100,
      y: 100 - Number(item.score),
      score: item.score,
    }));
  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const criticalRiskHistory = data.history.flatMap((snapshot) =>
    snapshot.delta.changes
      .filter(
        (item) =>
          item.kind === "new_risk" &&
          (item.severity === "critical" || item.severity === "high"),
      )
      .map((item) => ({ ...item, observedAt: snapshot.observedAt })),
  );

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge>Public Trust History</Badge>
              <Badge variant="outline">{data.watchlist.cadence}</Badge>
              {report?.verification.verifiedOnArc ? (
                <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <BadgeCheck className="mr-1 size-3.5" />
                  Current snapshot verified on Arc
                </Badge>
              ) : null}
            </div>
            <h1 className="max-w-4xl text-4xl font-bold sm:text-5xl">
              {data.watchlist.label}
            </h1>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Current trust signals, confirmed changes, and the Arc proof trail for
              every monitoring snapshot.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/monitoring">Manage watchlist</Link>
            </Button>
            {report && data.history[0] ? (
              <Button asChild>
                <Link href={data.history[0].reportUrl}>
                  Current report <ExternalLink />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-4">
        <Card className="rounded-lg lg:col-span-2">
          <CardContent className="flex items-end justify-between gap-5 p-6">
            <div>
              <p className="text-sm text-muted-foreground">Current Trust Score</p>
              <p className="mt-3 font-mono text-6xl font-semibold">
                {report?.trustScore.overall ?? "—"}
              </p>
              <p className="mt-2 text-sm capitalize text-muted-foreground">
                {report?.trustScore.status.replaceAll("_", " ") ?? "Awaiting baseline"}
              </p>
            </div>
            {data.currentDelta?.score.change !== null &&
            data.currentDelta?.score.change !== undefined ? (
              <Badge
                className={
                  data.currentDelta.score.change > 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : data.currentDelta.score.change < 0
                      ? "bg-red-500/10 text-red-400"
                      : ""
                }
              >
                {data.currentDelta.score.change > 0 ? (
                  <ArrowUpRight className="mr-1 size-4" />
                ) : data.currentDelta.score.change < 0 ? (
                  <ArrowDownRight className="mr-1 size-4" />
                ) : (
                  <Minus className="mr-1 size-4" />
                )}
                {data.currentDelta.score.before ?? "—"} →{" "}
                {data.currentDelta.score.after ?? "—"}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <CalendarClock className="size-5 text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Last checked</p>
            <p className="mt-2 font-medium">{formatDate(data.watchlist.lastCheckedAt)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Snapshots</p>
            <p className="mt-2 font-mono text-2xl font-semibold">{data.history.length}</p>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Trust Score history</CardTitle>
          </CardHeader>
          <CardContent>
            {chartPoints.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Run the first check to establish a score baseline.
              </p>
            ) : (
              <div className="grid gap-4">
                <svg
                  viewBox="-4 -6 108 112"
                  role="img"
                  aria-label="Trust Score history chart"
                  className="h-56 w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  {[0, 25, 50, 75, 100].map((value) => (
                    <line
                      key={value}
                      x1="0"
                      x2="100"
                      y1={100 - value}
                      y2={100 - value}
                      className="stroke-border"
                      strokeWidth="0.5"
                    />
                  ))}
                  {points ? (
                    <polyline
                      points={points}
                      fill="none"
                      className="stroke-primary"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {chartPoints.map((point, index) => (
                    <circle
                      key={`${point.x}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="2.2"
                      className="fill-primary"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatDate(history[0]?.observedAt ?? null)}</span>
                  <span>{formatDate(history.at(-1)?.observedAt ?? null)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Critical risk history</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {criticalRiskHistory.length === 0 ? (
              <div className="flex gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
                No new high or critical risk has been recorded between snapshots.
              </div>
            ) : (
              criticalRiskHistory.slice(0, 8).map((risk) => (
                <div key={`${risk.code}-${risk.observedAt}`} className="rounded-md border p-3">
                  <p className="font-medium">{risk.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(risk.observedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-8 sm:px-6">
        <DeltaSummary delta={data.currentDelta} />
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Arc-verified snapshots</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots yet.</p>
            ) : (
              data.history.map((snapshot) => (
                <div
                  key={snapshot.snapshotId}
                  className="grid gap-4 rounded-md border p-4 md:grid-cols-[auto_1fr_auto] md:items-center"
                >
                  <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 font-mono font-semibold text-primary">
                    {snapshot.score ?? "—"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Snapshot #{snapshot.sequence}</p>
                      <Badge
                        variant={
                          snapshot.verificationStatus === "verified"
                            ? "default"
                            : "outline"
                        }
                      >
                        {snapshot.verificationStatus.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(snapshot.observedAt)}
                    </p>
                    <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                      {snapshot.reportHash}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={snapshot.reportUrl}>Report</Link>
                    </Button>
                    {snapshot.proofUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={snapshot.proofUrl} target="_blank" rel="noreferrer">
                          Arc proof <ExternalLink />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
