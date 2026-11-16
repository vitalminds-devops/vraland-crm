import "server-only";

import { and, count, gt, gte, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { authSession } from "@/db/schema";

type DbStatsSnapshot = { at: number; xact: number };

const GLOBAL_KEY = "__vraland_db_stats__";

function getState(): { previous: DbStatsSnapshot | null } {
  const store = globalThis as unknown as Record<
    string,
    { previous: DbStatsSnapshot | null } | undefined
  >;
  store[GLOBAL_KEY] ??= { previous: null };
  return store[GLOBAL_KEY];
}

async function queryRows<T extends Record<string, unknown>>(statement: SQL): Promise<T[]> {
  const result = await db.execute(statement);
  return (result as unknown as { rows: T[] }).rows;
}

export type DatabaseMetrics = {
  online: boolean;
  /** Round-trip time of `select 1`, in milliseconds. */
  latencyMs: number | null;
  activeConnections: number | null;
  maxConnections: number | null;
  sizeBytes: number | null;
  cacheHitPercent: number | null;
  transactionsPerSecond: number | null;
  slowQueries: { pid: number; seconds: number; query: string }[];
  error: string | null;
};

export async function getDatabaseMetrics(): Promise<DatabaseMetrics> {
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    const state = getState();
    const now = Date.now();

    const [connectionRows, maxRows, sizeRows, statsRows, slowRows] = await Promise.all([
      queryRows<{ active: number | string }>(
        sql`select count(*)::int as active from pg_stat_activity where datname = current_database()`,
      ),
      queryRows<{ value: number | string }>(
        sql`select setting::int as value from pg_settings where name = 'max_connections'`,
      ),
      queryRows<{ bytes: number | string }>(
        sql`select pg_database_size(current_database())::bigint as bytes`,
      ),
      queryRows<{
        hit: number | string;
        read: number | string;
        xact: number | string;
        uptime: number | string;
      }>(
        sql`select
                coalesce(sum(blks_hit), 0)::bigint as hit,
                coalesce(sum(blks_read), 0)::bigint as read,
                coalesce(sum(xact_commit + xact_rollback), 0)::bigint as xact,
                extract(epoch from now() - pg_postmaster_start_time())::float as uptime
              from pg_stat_database
              where datname = current_database()`,
      ),
      queryRows<{ pid: number; seconds: number | string; query: string }>(
        sql`select
                pid,
                extract(epoch from now() - query_start)::float as seconds,
                left(query, 180) as query
              from pg_stat_activity
              where datname = current_database()
                and pid <> pg_backend_pid()
                and state = 'active'
                and now() - query_start > interval '1 second'
              order by query_start asc
              limit 5`,
      ),
    ]);

    const stats = statsRows[0];
    const hit = Number(stats?.hit ?? 0);
    const read = Number(stats?.read ?? 0);
    const xact = Number(stats?.xact ?? 0);

    let transactionsPerSecond: number | null = null;
    if (state.previous && now - state.previous.at >= 500) {
      transactionsPerSecond =
        Math.round(((xact - state.previous.xact) / ((now - state.previous.at) / 1000)) * 10) / 10;
    } else {
      const uptimeSeconds = Number(stats?.uptime ?? 0);
      if (uptimeSeconds > 0) {
        transactionsPerSecond = Math.round((xact / uptimeSeconds) * 10) / 10;
      }
    }
    state.previous = { at: now, xact };

    return {
      online: true,
      latencyMs,
      activeConnections: Number(connectionRows[0]?.active ?? 0),
      maxConnections: maxRows[0]?.value ? Number(maxRows[0].value) : null,
      sizeBytes: Number(sizeRows[0]?.bytes ?? 0),
      cacheHitPercent: hit + read > 0 ? Math.round((hit / (hit + read)) * 1000) / 10 : null,
      transactionsPerSecond,
      slowQueries: slowRows.map((row) => ({
        pid: Number(row.pid),
        seconds: Math.round(Number(row.seconds) * 10) / 10,
        query: row.query.trim(),
      })),
      error: null,
    };
  } catch (error) {
    return {
      online: false,
      latencyMs: null,
      activeConnections: null,
      maxConnections: null,
      sizeBytes: null,
      cacheHitPercent: null,
      transactionsPerSecond: null,
      slowQueries: [],
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  }
}

export type UserActivityMetrics = {
  activeSessions: number;
  usersOnline: number;
  loginsToday: number;
  failedLoginsToday: null;
};

export async function getUserActivityMetrics(): Promise<UserActivityMetrics> {
  const now = new Date();
  const onlineCutoff = new Date(now.getTime() - 15 * 60_000);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [sessions, online, logins] = await Promise.all([
    db.select({ value: count() }).from(authSession).where(gt(authSession.expiresAt, now)),
    db
      .select({
        value: sql<number>`count(distinct ${authSession.userId})::int`,
      })
      .from(authSession)
      .where(and(gt(authSession.expiresAt, now), gt(authSession.updatedAt, onlineCutoff))),
    db.select({ value: count() }).from(authSession).where(gte(authSession.createdAt, dayStart)),
  ]);

  return {
    activeSessions: Number(sessions[0]?.value ?? 0),
    usersOnline: Number(online[0]?.value ?? 0),
    loginsToday: Number(logins[0]?.value ?? 0),
    failedLoginsToday: null,
  };
}
