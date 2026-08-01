"use client";

import { useState } from "react";
import { Check, Download, ExternalLink, Share2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Project360Report } from "@/lib/project-360/types";
import { BRAND } from "@/lib/brand";

function statusClass(status: Project360Report["coverage"]["status"]) {
  if (status === "complete") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "partial") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  if (status === "limited") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function sectionStatusLabel(status: Project360Report["sections"][number]["status"]) {
  if (status === "available") return "Available";
  if (status === "not_provided") return "Not provided";
  if (status === "not_analyzed") return "Not analyzed";
  if (status === "failed") return "Failed independently";
  return "Limited evidence";
}

type AggregateProof = {
  status: "pending" | "verified" | "failed";
  transactionHash: string | null;
  transactionUrl: string | null;
  responseHash: string | null;
};

export function Project360ReportView({
  report,
  proof,
}: {
  report: Project360Report;
  proof: AggregateProof | null;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function download() {
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `veyra-project-360-${report.reportId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <Card className="rounded-2xl border-white/10 bg-[#090c13]">
      <CardContent className="grid gap-7 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusClass(report.coverage.status)}>{report.coverage.label}</Badge>
              <Badge variant="outline">Coverage {report.coverage.completed} / 5</Badge>
              <Badge variant="outline">{report.score.confidencePercent}% confidence</Badge>
              <Badge
                className={report.verification.status === "verified"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"}
              >
                <ShieldCheck className="mr-1 size-3" />
                {report.verification.status === "verified" ? "Aggregate Arc proof verified" : "Aggregate Arc proof pending"}
              </Badge>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{BRAND.name} Project 360 Report</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{report.executiveSummary}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void share()}>
              {copied ? <Check className="size-4 text-emerald-400" /> : <Share2 className="size-4" />}
              {copied ? "Copied" : "Share"}
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-4" /> JSON
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Project Trust Score</p>
            <p className="mt-2 text-3xl font-bold">{report.score.value ?? "N/A"}{report.score.value !== null ? "/100" : ""}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Verdict</p>
            <p className="mt-2 text-lg font-bold capitalize">{report.verdict.replaceAll("_", " ")}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Aggregate hash</p>
            <p className="mt-2 break-all font-mono text-xs">{report.verification.reportHash}</p>
          </div>
        </div>

        <div className="grid gap-4">
          {report.sections.map((section) => (
            <section key={section.id} className="rounded-xl border border-white/10 bg-white/[0.015] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Section {section.number}</p>
                  <h3 className="mt-1 text-base font-bold">{section.title}</h3>
                </div>
                <Badge variant="outline">{sectionStatusLabel(section.status)}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{section.summary}</p>
              {section.data !== null && section.data !== undefined ? (
                <details className="mt-3 rounded-lg border border-white/5 bg-black/20 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">View structured evidence</summary>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">{JSON.stringify(section.data, null, 2)}</pre>
                </details>
              ) : null}
            </section>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Canonical report boundary</p>
          <p className="mt-1">The aggregate hash binds confirmed sources, all five module statuses, child report hashes, score formula, coverage, evidence matrix, limitations, and the ordered 15-section payload.</p>
          {proof?.status === "verified" && proof.transactionHash && proof.transactionUrl ? (
            <div className="mt-3 grid gap-2">
              <p className="break-all font-mono text-[11px] text-foreground">{proof.transactionHash}</p>
              <a href={proof.transactionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
                View aggregate proof on Arc <ExternalLink className="size-3" />
              </a>
            </div>
          ) : (
            <p className="mt-2 text-amber-300">Aggregate proof is not yet verified on Arc.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
