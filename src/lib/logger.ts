import "server-only";

type LogLevel = "error" | "warn" | "info" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  error?: {
    message: string;
    stack?: string;
    name?: string;
    code?: string;
  };
}

/**
 * Get the current log level based on environment
 */
function getLogLevel(): LogLevel {
  const env = process.env.NODE_ENV || "development";

  if (env === "production") {
    return "error";
  }

  if (env === "test") {
    return "warn";
  }

  return "debug";
}

/**
 * Determine if a log entry should be output
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  const levels: LogLevel[] = ["error", "warn", "info", "debug"];
  const currentIndex = levels.indexOf(currentLevel);
  const entryIndex = levels.indexOf(level);

  return entryIndex <= currentIndex;
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts: string[] = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`, entry.message];

  if (entry.context) {
    parts.push(JSON.stringify(entry.context));
  }

  if (entry.error) {
    parts.push(`Error: ${entry.error.message}`);
    if (entry.error.stack && process.env.NODE_ENV !== "production") {
      parts.push(`Stack: ${entry.error.stack}`);
    }
  }

  return parts.join(" ");
}

/**
 * Output log entry to appropriate console method
 */
function outputLog(entry: LogEntry): void {
  if (!shouldLog(entry.level)) {
    return;
  }

  const formatted = formatLogEntry(entry);

  switch (entry.level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
  }
}

/**
 * Extract error details for logging
 */
function extractErrorDetails(error: unknown): LogEntry["error"] {
  // Drizzle's message and stack embed the query params (emails, phones); log the driver error instead.
  if (
    error instanceof Error &&
    (error.name === "DrizzleQueryError" || error.message.startsWith("Failed query"))
  ) {
    const cause = error.cause;
    const details = cause instanceof Error ? extractErrorDetails(cause) : undefined;
    return { ...(details ?? { message: "Database query failed" }), name: error.name };
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: typeof code === "string" ? code : undefined,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: String(error) };
}

/**
 * Log an error
 */
export function logError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    context,
    error: error ? extractErrorDetails(error) : undefined,
  };

  outputLog(entry);
}
