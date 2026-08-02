import { getByoaClient } from "../byoa/service.ts";
import { TrustMonitoringError } from "./service.ts";
import type {
  AlertState,
  TrustAlertEventRow,
  TrustAlertEventType,
} from "./types.ts";

type AlertTenant = {
  ownerWallet: string;
  byoaAgentId?: string;
  machineCredentialId?: string;
};

function tenantQuery<T>(query: T, tenant: AlertTenant) {
  type Filter = {
    ilike(column: string, value: string): Filter;
    eq(column: string, value: string): Filter;
  };
  let scoped = (query as T & Filter).ilike("owner_wallet", tenant.ownerWallet);
  if (tenant.machineCredentialId && tenant.byoaAgentId) {
    scoped = scoped
      .eq("byoa_agent_id", tenant.byoaAgentId)
      .eq("machine_credential_id", tenant.machineCredentialId);
  }
  return scoped as T;
}

async function profilePublicIds(profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, string>();
  const result = await getByoaClient()
    .from("trust_profiles")
    .select("id,public_id")
    .in("id", [...new Set(profileIds)]);
  if (result.error) {
    throw new TrustMonitoringError(
      "Alerts are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  return new Map(
    (result.data ?? []).map((row) => [row.id as string, row.public_id as string]),
  );
}

function alertView(
  row: TrustAlertEventRow,
  state: AlertState,
  profileId: string,
  snapshotPublicId: string | null,
) {
  return {
    id: row.public_id,
    type: row.event_type,
    state,
    message: row.message,
    profileId,
    profileUrl: `/trust/${profileId}`,
    snapshotId: snapshotPublicId,
    snapshotUrl: snapshotPublicId
      ? `/trust/${profileId}#snapshot-${snapshotPublicId}`
      : `/trust/${profileId}`,
    change: row.payload,
    createdAt: row.created_at,
  };
}

async function unreadAlertCount(tenant: AlertTenant) {
  const client = getByoaClient();
  if (!tenant.machineCredentialId || !tenant.byoaAgentId) {
    const result = await client
      .from("trust_alert_states")
      .select("alert_event_id", { count: "exact", head: true })
      .ilike("owner_wallet", tenant.ownerWallet)
      .eq("state", "unread");
    return result.count ?? 0;
  }
  let eventQuery = client
    .from("trust_alert_events")
    .select("id");
  eventQuery = tenantQuery(eventQuery, tenant);
  const events = await eventQuery;
  const ids = (events.data ?? []).map((row) => row.id as string);
  if (!ids.length) return 0;
  const result = await client
    .from("trust_alert_states")
    .select("alert_event_id", { count: "exact", head: true })
    .ilike("owner_wallet", tenant.ownerWallet)
    .eq("state", "unread")
    .in("alert_event_id", ids);
  return result.count ?? 0;
}

export async function listTrustAlerts(input: AlertTenant & {
  profileId?: string | null;
  eventType?: TrustAlertEventType | null;
  state?: AlertState | null;
  limit?: number;
}) {
  const client = getByoaClient();
  let query = client
    .from("trust_alert_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(input.limit ?? 50, 100)));
  query = tenantQuery(query, input);
  if (input.eventType) query = query.eq("event_type", input.eventType);
  if (input.profileId) {
    const profile = await client
      .from("trust_profiles")
      .select("id")
      .eq("public_id", input.profileId)
      .maybeSingle();
    if (!profile.data) return { alerts: [], unreadCount: 0 };
    query = query.eq("profile_id", profile.data.id);
  }
  const result = await query;
  if (result.error) {
    throw new TrustMonitoringError(
      "Alerts are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  const rows = (result.data ?? []) as TrustAlertEventRow[];
  const unreadCountPromise = unreadAlertCount(input);
  if (rows.length === 0) {
    return { alerts: [], unreadCount: await unreadCountPromise };
  }
  const [statesResult, snapshotsResult, projectSnapshotsResult, profiles] = await Promise.all([
    client
      .from("trust_alert_states")
      .select("alert_event_id,state")
      .ilike("owner_wallet", input.ownerWallet)
      .in("alert_event_id", rows.map((row) => row.id)),
    client
      .from("trust_monitoring_snapshots")
      .select("id,public_id")
      .in(
        "id",
        rows.map((row) => row.snapshot_id).filter((id): id is string => Boolean(id)),
      ),
    client
      .from("project_360_monitor_snapshots")
      .select("id,public_id")
      .in(
        "id",
        rows
          .map((row) => row.project_360_snapshot_id)
          .filter((id): id is string => Boolean(id)),
      ),
    profilePublicIds(rows.map((row) => row.profile_id)),
  ]);
  if (statesResult.error || snapshotsResult.error || projectSnapshotsResult.error) {
    throw new TrustMonitoringError(
      "Alerts are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  const states = new Map(
    (statesResult.data ?? []).map((row) => [
      row.alert_event_id as string,
      row.state as AlertState,
    ]),
  );
  const snapshots = new Map(
    [...(snapshotsResult.data ?? []), ...(projectSnapshotsResult.data ?? [])].map((row) => [
      row.id as string,
      row.public_id as string,
    ]),
  );
  const alerts = rows
    .map((row) =>
      alertView(
        row,
        states.get(row.id) ?? "unread",
        profiles.get(row.profile_id) ?? "",
        row.snapshot_id
          ? snapshots.get(row.snapshot_id) ?? null
          : row.project_360_snapshot_id
            ? snapshots.get(row.project_360_snapshot_id) ?? null
            : null,
      ),
    )
    .filter((alert) => alert.profileId && (!input.state || alert.state === input.state));
  return {
    alerts,
    unreadCount: await unreadCountPromise,
  };
}

export async function updateTrustAlertState(input: AlertTenant & {
  alertId: string;
  state: AlertState;
}) {
  if (!/^evt_[0-9a-f]{24}$/.test(input.alertId)) {
    throw new TrustMonitoringError("Alert not found.", "webhook_event_not_found", 404);
  }
  const client = getByoaClient();
  let query = client
    .from("trust_alert_events")
    .select("id")
    .eq("public_id", input.alertId);
  query = tenantQuery(query, input);
  const event = await query.maybeSingle();
  if (!event.data) {
    throw new TrustMonitoringError("Alert not found.", "webhook_event_not_found", 404);
  }
  const now = new Date().toISOString();
  const result = await client
    .from("trust_alert_states")
    .update({
      state: input.state,
      read_at: input.state === "read" ? now : null,
      archived_at: input.state === "archived" ? now : null,
    })
    .eq("alert_event_id", event.data.id)
    .ilike("owner_wallet", input.ownerWallet)
    .select("state")
    .maybeSingle();
  if (!result.data) {
    throw new TrustMonitoringError("Alert not found.", "webhook_event_not_found", 404);
  }
  return { id: input.alertId, state: result.data.state as AlertState };
}

export async function markAllTrustAlertsRead(ownerWallet: string) {
  const client = getByoaClient();
  const alerts = await client
    .from("trust_alert_events")
    .select("id")
    .ilike("owner_wallet", ownerWallet);
  if (alerts.error) {
    throw new TrustMonitoringError(
      "Alerts are temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  const ids = (alerts.data ?? []).map((row) => row.id as string);
  if (ids.length) {
    await client
      .from("trust_alert_states")
      .update({ state: "read", read_at: new Date().toISOString() })
      .ilike("owner_wallet", ownerWallet)
      .eq("state", "unread")
      .in("alert_event_id", ids);
  }
  return { updated: ids.length };
}
