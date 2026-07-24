/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getServerSupabaseConfig } from "../lib/supabase/server-env.ts";

const runtimeUrl = new URL(getServerSupabaseConfig().url);

const migrationConnection =
  process.env.AGENT_DB_POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL_NON_POOLING;

if (!migrationConnection) {
  throw new Error("Migration PostgreSQL connection is missing.");
}

const migrationUrl = new URL(migrationConnection);

function projectRefFromSupabaseUrl(urlObj: URL): string | null {
  // Check direct hostname (e.g. yowbgvbxrwvozmemooog.supabase.co)
  const direct = urlObj.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (direct) return direct[1];

  const database = urlObj.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (database) return database[1];

  // Check username in pooler URL (e.g. postgres.yowbgvbxrwvozmemooog)
  if (urlObj.username) {
    const userMatch = urlObj.username.match(/^(?:postgres|service_role|anon)\.([a-z0-9]+)$/i);
    if (userMatch) return userMatch[1];
  }

  return null;
}

const runtimeRef = projectRefFromSupabaseUrl(runtimeUrl);
const migrationRef = projectRefFromSupabaseUrl(migrationUrl);

console.log({
  runtimeHost: runtimeUrl.hostname,
  migrationHost: migrationUrl.hostname,
  runtimeRef,
  migrationRef,
});

if (runtimeRef && migrationRef && runtimeRef !== migrationRef) {
  throw new Error(
    `Database target mismatch: runtime=${runtimeRef}, migration=${migrationRef}`,
  );
}
