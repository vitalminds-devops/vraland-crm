export type ServiceStatus = "healthy" | "attention" | "critical";

export type HealthLabel = "Excellent" | "Good" | "Warning" | "Critical";

export type SystemScore = {
  score: number;
  label: HealthLabel;
  server: ServiceStatus;
  app: ServiceStatus;
  database: ServiceStatus;
  /** The one sentence that explains a non-perfect score. */
  note: string;
};

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function statusFor(score: number): ServiceStatus {
  if (score >= 85) return "healthy";
  if (score >= 65) return "attention";
  return "critical";
}

export function scoreSystem(input: {
  server: {
    cpuPercent: number;
    memPercent: number;
    diskPercent: number | null;
  };
  app: {
    averageResponseMs: number | null;
    requestsLastMinute: number;
    errors5xxSinceStart: number;
    requestsSinceStart: number;
  };
  database: {
    online: boolean;
    activeConnections: number | null;
    maxConnections: number | null;
    slowQueries: number;
  };
}): SystemScore {
  const { server, app, database } = input;

  const serverPenalty =
    Math.max(0, server.cpuPercent - 80) * 1.2 +
    Math.max(0, server.memPercent - 80) * 1.2 +
    (server.diskPercent === null ? 0 : Math.max(0, server.diskPercent - 85) * 1.5);
  const serverScore = clamp(100 - serverPenalty);

  const connectionPressure =
    database.maxConnections && database.activeConnections
      ? (database.activeConnections / database.maxConnections) * 100
      : 0;
  const databaseScore = database.online
    ? clamp(100 - Math.max(0, connectionPressure - 70) * 0.8 - database.slowQueries * 5)
    : 0;

  const errorRate =
    app.requestsSinceStart > 0 ? app.errors5xxSinceStart / app.requestsSinceStart : 0;
  const appScore = clamp(
    100 - Math.max(0, (app.averageResponseMs ?? 0) - 300) / 20 - errorRate * 150,
  );

  const score = Math.round(serverScore * 0.35 + databaseScore * 0.4 + appScore * 0.25);

  const label: HealthLabel =
    score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Warning" : "Critical";

  const note = !database.online
    ? "PostgreSQL is unreachable — every screen that reads data is affected."
    : server.memPercent >= 90
      ? `Memory is at ${server.memPercent}% — the container is close to its limit.`
      : server.cpuPercent >= 90
        ? `CPU is at ${server.cpuPercent}% — requests are queueing behind it.`
        : server.diskPercent !== null && server.diskPercent >= 90
          ? `Disk is ${server.diskPercent}% full — uploads and logs are at risk.`
          : database.slowQueries > 0
            ? `${database.slowQueries} quer${database.slowQueries === 1 ? "y is" : "ies are"} running for over a second.`
            : (app.averageResponseMs ?? 0) > 300
              ? `Average API response is ${app.averageResponseMs} ms.`
              : "CPU, memory, disk and the database are all within normal ranges.";

  return {
    score,
    label,
    server: statusFor(serverScore),
    app: statusFor(appScore),
    database: database.online ? statusFor(databaseScore) : "critical",
    note,
  };
}
