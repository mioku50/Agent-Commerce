"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Clock, ExternalLink, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { shortenHash } from "@/lib/utils";

type ActivityRun = {
  id: string;
  created_at: string;
  task: string;
  status: string;
  spent_usdc: string;
  paid_count?: number;
  step_count?: number;
};

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityDropdown() {
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRuns() {
      try {
        const response = await fetch("/api/agent/runs?limit=5", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          runs?: ActivityRun[];
          error?: string;
        };
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Could not load recent activity.");
        }
        setRuns(data.runs ?? []);
        setError(null);
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
    }

    void loadRuns();

    return () => controller.abort();
  }, []);

  const unread = runs.filter((run) => run.status === "completed").length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-semibold">Recent Activity</p>
            <p className="text-xs text-muted-foreground">Latest buyer-agent runs</p>
          </div>
          <Clock className="size-4 text-muted-foreground" />
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {loading ? (
            <div className="grid gap-3 p-4">
              <div className="skeleton-shimmer h-14 rounded-md" />
              <div className="skeleton-shimmer h-14 rounded-md" />
              <div className="skeleton-shimmer h-14 rounded-md" />
            </div>
          ) : error ? (
            <div className="flex gap-3 p-4 text-sm text-muted-foreground">
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              {error}
            </div>
          ) : runs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No agent runs yet. Plan a task from Agent Control to create the
              first timeline.
            </p>
          ) : (
            runs.map((run) => (
              <DropdownMenuItem key={run.id} asChild>
                <Link
                  href={`/runs/${run.id}`}
                  className="grid cursor-pointer gap-2 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <StatusBadge status={run.status} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {shortenHash(run.id, 4)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{run.task}</p>
                  <p className="text-xs text-muted-foreground">
                    {run.spent_usdc} USDC · {run.paid_count ?? 0} paid ·{" "}
                    {run.step_count ?? 0} steps · {relativeTime(run.created_at)}
                  </p>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="p-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/runs">
              View all runs
              <ExternalLink />
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
