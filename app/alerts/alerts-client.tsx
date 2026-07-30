"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  BellRing,
  CheckCheck,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Alert = {
  id: string;
  type: string;
  state: "unread" | "read" | "archived";
  message: string;
  profileId: string;
  profileUrl: string;
  snapshotUrl: string;
  createdAt: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    alerts?: Alert[];
    unreadCount?: number;
  };
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export function AlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [profileId, setProfileId] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const query = new URLSearchParams();
      if (type) query.set("type", type);
      if (profileId) query.set("profileId", profileId);
      const body = await request(`/api/monitoring/alerts?${query}`);
      setAlerts(body.alerts ?? []);
      setUnread(body.unreadCount ?? 0);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }, [profileId, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(alert: Alert, state: "read" | "archived") {
    setBusy(alert.id);
    try {
      await request(`/api/monitoring/alerts/${alert.id}`, {
        method: "PATCH",
        body: JSON.stringify({ state }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    setBusy("all");
    try {
      await request("/api/monitoring/alerts", {
        method: "PATCH",
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Event type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
            >
              <option value="">All events</option>
              <option value="trust_score_changed">Trust score</option>
              <option value="trust_status_changed">Trust status</option>
              <option value="risk_added">Risk added</option>
              <option value="risk_resolved">Risk resolved</option>
              <option value="verification_failed">Arc verification</option>
              <option value="recheck_failed">Recheck failed</option>
              <option value="subject_unavailable">Subject unavailable</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Trust Profile ID
            <input
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              placeholder="vtr_..."
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
            />
          </label>
        </div>
        <Button
          variant="outline"
          onClick={markAllRead}
          disabled={!unread || busy === "all"}
        >
          <CheckCheck />
          Mark all read ({unread})
        </Button>
      </div>

      {error ? (
        <Card className="border-amber-500/30">
          <CardContent className="p-5 text-sm text-amber-300">
            {error}{" "}
            <Link href="/monitoring" className="underline">
              Open Monitoring to verify the owner session.
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {busy === "load" ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <LoaderCircle className="animate-spin" /> Loading alerts…
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-3 p-10 text-center">
            <BellRing className="size-8 text-muted-foreground" />
            <p className="font-medium">No matching trust alerts.</p>
            <p className="text-sm text-muted-foreground">
              Alerts appear after a meaningful canonical snapshot change.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={alert.state === "unread" ? "border-primary/40 bg-primary/5" : ""}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.state === "unread" ? "default" : "outline"}>
                      {alert.state}
                    </Badge>
                    <Badge variant="outline">{alert.type.replaceAll("_", " ")}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-3 font-medium">{alert.message}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {alert.profileId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={alert.snapshotUrl}>
                      View change <ExternalLink />
                    </Link>
                  </Button>
                  {alert.state === "unread" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update(alert, "read")}
                      disabled={busy === alert.id}
                    >
                      <CheckCheck /> Read
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update(alert, "archived")}
                    disabled={busy === alert.id}
                  >
                    <Archive /> Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
