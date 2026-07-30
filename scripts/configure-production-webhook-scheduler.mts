import assert from "node:assert/strict";
import { Client as PostgresClient } from "pg";
import { getServerSupabaseConfig } from "../lib/supabase/server-env.ts";

const JOB_NAME = "veyra-webhook-delivery";
const SECRET_NAME = "veyra_webhook_delivery_cron_secret";
const URL_NAME = "veyra_webhook_delivery_url";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function projectRef(url: URL) {
  const direct = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (direct) return direct[1];
  const database = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (database) return database[1];
  const user = url.username.match(/^(?:postgres|service_role|anon)\.([a-z0-9]+)$/i);
  return user?.[1] ?? null;
}

async function upsertVaultSecret(
  postgres: PostgresClient,
  name: string,
  secret: string,
  description: string,
) {
  const existing = await postgres.query<{ id: string }>(
    "select id::text from vault.secrets where name = $1 limit 1",
    [name],
  );
  if (existing.rows[0]) {
    await postgres.query(
      "select vault.update_secret($1::uuid, $2, $3, $4)",
      [existing.rows[0].id, secret, name, description],
    );
    return;
  }
  await postgres.query("select vault.create_secret($1, $2, $3)", [
    secret,
    name,
    description,
  ]);
}

const baseUrl = (argument("--confirm-production") ?? "").replace(/\/+$/, "");
assert(
  /^https:\/\/[^/]+$/.test(baseUrl),
  "Use --confirm-production https://YOUR_PRODUCTION_HOST",
);
const workerUrl = `${baseUrl}/api/internal/webhooks/deliver`;
const cronSecret = process.env.CRON_SECRET?.trim();
assert(cronSecret, "CRON_SECRET is required.");
const postgresUrl =
  process.env.AGENT_DB_POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL_NON_POOLING;
assert(postgresUrl, "A non-pooling production PostgreSQL connection is required.");

const runtimeUrl = new URL(getServerSupabaseConfig().url);
const connectionUrl = new URL(postgresUrl);
assert(
  projectRef(runtimeUrl) &&
    projectRef(connectionUrl) &&
    projectRef(runtimeUrl) === projectRef(connectionUrl),
  "Runtime and migration database targets do not match.",
);
connectionUrl.searchParams.delete("sslmode");
connectionUrl.searchParams.delete("sslrootcert");

const postgres = new PostgresClient({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false },
});
await postgres.connect();

try {
  const extensions = await postgres.query<{ extname: string }>(
    "select extname from pg_extension where extname in ('pg_cron', 'pg_net') order by extname",
  );
  assert.equal(
    extensions.rowCount,
    2,
    "Apply the webhook scheduler migration before configuring Production.",
  );

  await upsertVaultSecret(
    postgres,
    SECRET_NAME,
    cronSecret,
    "Bearer token for the Veyra production webhook delivery worker.",
  );
  await upsertVaultSecret(
    postgres,
    URL_NAME,
    workerUrl,
    "HTTPS URL for the Veyra production webhook delivery worker.",
  );

  const command = `
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = '${URL_NAME}'),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}')
      ),
      timeout_milliseconds := 15000
    );
  `;
  await postgres.query("select cron.schedule($1, $2, $3)", [
    JOB_NAME,
    "* * * * *",
    command,
  ]);

  const configured = await postgres.query<{
    schedule: string;
    active: boolean;
  }>(
    "select schedule, active from cron.job where jobname = $1",
    [JOB_NAME],
  );
  assert.equal(configured.rowCount, 1);
  assert.equal(configured.rows[0].schedule, "* * * * *");
  assert.equal(configured.rows[0].active, true);
  console.log(
    "[webhook-scheduler] Production worker configured: cadence=every-minute secrets=vault status=active.",
  );
} finally {
  await postgres.end();
}
