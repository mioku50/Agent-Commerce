import { createHash } from "node:crypto";
import type { AgentTrustReport } from "../agent-trust/types.ts";
import { getByoaClient } from "../byoa/service.ts";
import { publicAppUrl } from "../public-url.ts";
import type {
  PublicTrustRisk,
  TrustAlertEventRow,
  TrustAlertEventType,
  TrustDelta,
  TrustDeltaChange,
  TrustMonitoringRecheckRow,
  TrustMonitoringSnapshotRow,
  TrustProfileRow,
  TrustWatchlistRow,
} from "./types.ts";

const SCORE_ALERT_THRESHOLD = 3;

function digest(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function stableRiskCode(change: TrustDeltaChange) {
  return change.code
    .replace(/^new_risk_/, "")
    .replace(/^resolved_risk_/, "")
    .slice(0, 120);
}

function publicRisk(change: TrustDeltaChange): PublicTrustRisk {
  return {
    riskCode: stableRiskCode(change),
    title: change.title.replace(/\s+resolved$/i, ""),
    severity: change.severity,
  };
}

export function buildTrustDelta(
  previousSnapshot: TrustMonitoringSnapshotRow | null,
  currentSnapshot: TrustMonitoringSnapshotRow,
): TrustDelta {
  const previousScore = previousSnapshot?.trust_score ?? null;
  const currentScore = currentSnapshot.trust_score;
  const scoreChange =
    previousScore === null || currentScore === null
      ? null
      : {
          previous: previousScore,
          current: currentScore,
          delta: currentScore - previousScore,
        };
  const statusChange =
    previousSnapshot &&
    previousSnapshot.trust_status !== currentSnapshot.trust_status
      ? {
          previous: previousSnapshot.trust_status,
          current: currentSnapshot.trust_status,
        }
      : null;
  const addedRisks = currentSnapshot.delta_snapshot.changes
    .filter((change) => change.kind === "new_risk")
    .map(publicRisk);
  const resolvedRisks = currentSnapshot.delta_snapshot.changes
    .filter(
      (change) =>
        change.kind === "improved" &&
        change.code.startsWith("resolved_risk_"),
    )
    .map(publicRisk);
  return {
    scoreChange,
    statusChange,
    addedRisks,
    resolvedRisks,
    meaningful: Boolean(
      (scoreChange && Math.abs(scoreChange.delta) >= SCORE_ALERT_THRESHOLD) ||
        statusChange ||
        addedRisks.length ||
        resolvedRisks.length,
    ),
  };
}

type AlertDraft = {
  type: TrustAlertEventType;
  fingerprint: string;
  message: string;
  change: Record<string, unknown>;
};

export function buildTrustAlertDrafts(
  previous: TrustMonitoringSnapshotRow | null,
  current: TrustMonitoringSnapshotRow,
): AlertDraft[] {
  const delta = buildTrustDelta(previous, current);
  const drafts: AlertDraft[] = [];
  if (delta.scoreChange && Math.abs(delta.scoreChange.delta) >= SCORE_ALERT_THRESHOLD) {
    const score = delta.scoreChange;
    drafts.push({
      type: "trust_score_changed",
      fingerprint: digest(["score", score.previous, score.current]),
      message: `Trust score ${score.delta < 0 ? "decreased" : "increased"} from ${score.previous} to ${score.current}.`,
      change: score,
    });
  }
  if (delta.statusChange) {
    drafts.push({
      type: "trust_status_changed",
      fingerprint: digest(["status", delta.statusChange.previous, delta.statusChange.current]),
      message: `Trust status changed from ${delta.statusChange.previous.replaceAll("_", " ")} to ${delta.statusChange.current.replaceAll("_", " ")}.`,
      change: delta.statusChange,
    });
  }
  for (const risk of delta.addedRisks) {
    drafts.push({
      type: "risk_added",
      fingerprint: digest(["risk_added", risk.riskCode]),
      message: `A new trust risk was detected: ${risk.title}.`,
      change: { risk },
    });
  }
  for (const risk of delta.resolvedRisks) {
    drafts.push({
      type: "risk_resolved",
      fingerprint: digest(["risk_resolved", risk.riskCode]),
      message: `A trust risk was resolved: ${risk.title}.`,
      change: { risk },
    });
  }
  if (current.verification_status === "verification_failed") {
    drafts.push({
      type: "verification_failed",
      fingerprint: digest(["verification_failed", current.report_hash]),
      message: "Arc verification could not be completed.",
      change: { verificationStatus: "verification_failed" },
    });
  }
  const report = current.report_snapshot;
  const subjectUnavailable =
    report.codeIntelligence.status === "unavailable" ||
    report.identity.status === "unavailable" ||
    report.endpointAvailability.status === "unreachable" ||
    report.services.status === "unavailable" ||
    report.contractTransparency.status === "unavailable";
  if (previous && subjectUnavailable) {
    drafts.push({
      type: "subject_unavailable",
      fingerprint: digest([
        "subject_unavailable",
        report.codeIntelligence.status,
        report.identity.status,
        report.endpointAvailability.status,
        report.services.status,
        report.contractTransparency.status,
      ]),
      message: "The monitored subject is currently unavailable.",
      change: { availability: "unavailable" },
    });
  }
  return drafts.map((draft) => ({
    ...draft,
    fingerprint: digest([
      draft.fingerprint,
      current.report_hash.toLowerCase(),
    ]),
  }));
}

export function buildTrustWebhookPayload(input: {
  eventId: string;
  type: TrustAlertEventType;
  createdAt: string;
  profile: TrustProfileRow;
  report: AgentTrustReport;
  snapshot: TrustMonitoringSnapshotRow;
  change: Record<string, unknown>;
}) {
  const appUrl = publicAppUrl();
  const profileUrl = `${appUrl}/trust/${input.profile.public_id}`;
  return {
    id: input.eventId,
    type: input.type,
    createdAt: input.createdAt,
    apiVersion: "2026-07-30",
    data: {
      profile: {
        id: input.profile.public_id,
        name: input.report.subject.name || input.profile.display_name,
        subjectType: input.profile.subject_type,
        publicUrl: profileUrl,
      },
      snapshot: {
        id: input.snapshot.public_id,
        score: input.snapshot.trust_score,
        status: input.snapshot.trust_status,
        verifiedOnArc:
          input.snapshot.verification_status === "verified" &&
          Boolean(input.snapshot.proof_transaction_hash),
        reportUrl: `${profileUrl}#snapshot-${input.snapshot.public_id}`,
      },
      change: input.change,
    },
  };
}

async function scheduleAlertWebhookDeliveries(input: {
  alert: TrustAlertEventRow;
  profile: TrustProfileRow;
  snapshot: TrustMonitoringSnapshotRow;
  report: AgentTrustReport;
  change: Record<string, unknown>;
}) {
  const client = getByoaClient();
  const payload = buildTrustWebhookPayload({
    eventId: input.alert.public_id,
    type: input.alert.event_type,
    createdAt: input.alert.created_at,
    profile: input.profile,
    report: input.report,
    snapshot: input.snapshot,
    change: input.change,
  });
  const eventResult = await client
    .from("webhook_events")
    .upsert(
      {
        public_id: input.alert.public_id,
        owner_wallet: input.alert.owner_wallet,
        alert_event_id: input.alert.id,
        event_type: input.alert.event_type,
        payload,
        created_at: input.alert.created_at,
      },
      { onConflict: "alert_event_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  let event = eventResult.data;
  if (!event) {
    const existing = await client
      .from("webhook_events")
      .select("*")
      .eq("alert_event_id", input.alert.id)
      .single();
    event = existing.data;
  }
  if (!event) return;
  const subscriptions = await client
    .from("webhook_subscriptions")
    .select("id,owner_wallet")
    .ilike("owner_wallet", input.alert.owner_wallet)
    .eq("status", "active")
    .contains("profile_ids", [input.profile.id])
    .contains("event_types", [input.alert.event_type]);
  if (subscriptions.error || !subscriptions.data?.length) return;
  await client.from("webhook_deliveries").upsert(
    subscriptions.data.map((subscription) => ({
      owner_wallet: subscription.owner_wallet,
      subscription_id: subscription.id,
      event_id: event.id,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })),
    { onConflict: "subscription_id,event_id", ignoreDuplicates: true },
  );
}

async function scheduleFailureWebhookDeliveries(
  alert: TrustAlertEventRow,
  profile: TrustProfileRow,
) {
  const client = getByoaClient();
  const profileUrl = `${publicAppUrl()}/trust/${profile.public_id}`;
  const payload = {
    id: alert.public_id,
    type: alert.event_type,
    createdAt: alert.created_at,
    apiVersion: "2026-07-30",
    data: {
      profile: {
        id: profile.public_id,
        name: profile.display_name,
        subjectType: profile.subject_type,
        publicUrl: profileUrl,
      },
      snapshot: null,
      change: alert.payload,
    },
  };
  const eventResult = await client
    .from("webhook_events")
    .upsert(
      {
        public_id: alert.public_id,
        owner_wallet: alert.owner_wallet,
        alert_event_id: alert.id,
        event_type: alert.event_type,
        payload,
        created_at: alert.created_at,
      },
      { onConflict: "alert_event_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  let eventId = eventResult.data?.id as string | undefined;
  if (!eventId) {
    const existing = await client
      .from("webhook_events")
      .select("id")
      .eq("alert_event_id", alert.id)
      .maybeSingle();
    eventId = existing.data?.id as string | undefined;
  }
  if (!eventId) return;
  const subscriptions = await client
    .from("webhook_subscriptions")
    .select("id,owner_wallet")
    .ilike("owner_wallet", alert.owner_wallet)
    .eq("status", "active")
    .contains("profile_ids", [profile.id])
    .contains("event_types", [alert.event_type]);
  if (!subscriptions.data?.length) return;
  await client.from("webhook_deliveries").upsert(
    subscriptions.data.map((subscription) => ({
      owner_wallet: subscription.owner_wallet,
      subscription_id: subscription.id,
      event_id: eventId,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })),
    { onConflict: "subscription_id,event_id", ignoreDuplicates: true },
  );
}

export async function createTrustAlertsForSnapshot(input: {
  watchlist: TrustWatchlistRow;
  profile: TrustProfileRow;
  previous: TrustMonitoringSnapshotRow | null;
  current: TrustMonitoringSnapshotRow;
}) {
  const drafts = buildTrustAlertDrafts(input.previous, input.current);
  if (drafts.length === 0) return [];
  const client = getByoaClient();
  const inserted = await client
    .from("trust_alert_events")
    .upsert(
      drafts.map((draft) => ({
        owner_wallet: input.watchlist.owner_wallet,
        profile_id: input.profile.id,
        snapshot_id: input.current.id,
        event_type: draft.type,
        event_fingerprint: draft.fingerprint,
        message: draft.message,
        payload: draft.change,
        byoa_agent_id: input.watchlist.byoa_agent_id,
        machine_credential_id: input.watchlist.machine_credential_id,
      })),
      {
        onConflict: "profile_id,event_type,event_fingerprint",
        ignoreDuplicates: true,
      },
    );
  if (inserted.error) throw inserted.error;
  const eventResult = await client
    .from("trust_alert_events")
    .select("*")
    .eq("profile_id", input.profile.id)
    .in(
      "event_fingerprint",
      drafts.map((draft) => draft.fingerprint),
    );
  if (eventResult.error) throw eventResult.error;
  const events = new Map(
    ((eventResult.data ?? []) as TrustAlertEventRow[]).map((event) => [
      event.event_fingerprint,
      event,
    ]),
  );
  const created: TrustAlertEventRow[] = [];
  for (const draft of drafts) {
    const alert = events.get(draft.fingerprint);
    if (!alert) continue;
    await client.from("trust_alert_states").upsert(
      {
        alert_event_id: alert.id,
        owner_wallet: input.watchlist.owner_wallet,
        state: "unread",
      },
      { onConflict: "alert_event_id,owner_wallet", ignoreDuplicates: true },
    );
    await scheduleAlertWebhookDeliveries({
      alert,
      profile: input.profile,
      snapshot: input.current,
      report: input.current.report_snapshot,
      change: draft.change,
    });
    created.push(alert);
  }
  return created;
}

export async function createRecheckFailureAlert(input: {
  watchlist: TrustWatchlistRow;
  profile: TrustProfileRow;
  recheck: TrustMonitoringRecheckRow;
  unavailable?: boolean;
}) {
  const type: TrustAlertEventType = input.unavailable
    ? "subject_unavailable"
    : "recheck_failed";
  const fingerprint = digest([type, input.recheck.public_id]);
  const message = input.unavailable
    ? "The monitored subject is currently unavailable."
    : "The scheduled trust recheck could not be completed.";
  const client = getByoaClient();
  const result = await client
    .from("trust_alert_events")
    .insert({
      owner_wallet: input.watchlist.owner_wallet,
      profile_id: input.profile.id,
      snapshot_id: null,
      event_type: type,
      event_fingerprint: fingerprint,
      message,
      payload: { recheckStatus: "failed" },
      byoa_agent_id: input.watchlist.byoa_agent_id,
      machine_credential_id: input.watchlist.machine_credential_id,
    })
    .select("*")
    .maybeSingle();
  let alert = result.data;
  if (!alert && result.error?.code === "23505") {
    const existing = await client
      .from("trust_alert_events")
      .select("*")
      .eq("profile_id", input.profile.id)
      .eq("event_type", type)
      .eq("event_fingerprint", fingerprint)
      .is("snapshot_id", null)
      .maybeSingle();
    alert = existing.data;
  }
  if (alert) {
    await client.from("trust_alert_states").upsert(
      {
        alert_event_id: alert.id,
        owner_wallet: input.watchlist.owner_wallet,
        state: "unread",
      },
      { onConflict: "alert_event_id,owner_wallet", ignoreDuplicates: true },
    );
    await scheduleFailureWebhookDeliveries(
      alert as TrustAlertEventRow,
      input.profile,
    );
  }
}
