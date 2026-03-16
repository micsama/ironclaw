import type { JsonObject } from "./types.ts";

export interface RequestTrace {
  id: string;
  startedAt: string;
  route: string;
  model: string;
  requestMessages: number;
  requestTools: number;
  upstreamTarget: string;
  status: "pending" | "ok" | "error";
  upstreamStatus?: number;
  elapsedMs?: number;
  authMode: "present" | "missing";
  error?: string;
  bodyPreview?: string;
}

export interface ProxyStats {
  startedAt: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  modelsRequests: number;
}

const MAX_RECENT_REQUESTS = 30;

const recentRequests: RequestTrace[] = [];

const stats: ProxyStats = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  modelsRequests: 0,
};

const ansi = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

function color(level: "info" | "warn" | "error"): string {
  if (level === "info") {
    return ansi.cyan;
  }
  if (level === "warn") {
    return ansi.yellow;
  }
  return ansi.red;
}

function print(level: "info" | "warn" | "error", message: string, details?: JsonObject): void {
  const time = new Date().toISOString();
  const prefix = `${ansi.dim}${time}${ansi.reset} ${color(level)}[proxy/${level}]${ansi.reset}`;
  if (details) {
    console.log(`${prefix} ${message} ${ansi.gray}${JSON.stringify(details)}${ansi.reset}`);
    return;
  }
  console.log(`${prefix} ${message}`);
}

export function logInfo(message: string, details?: JsonObject): void {
  print("info", message, details);
}

export function logWarn(message: string, details?: JsonObject): void {
  print("warn", message, details);
}

export function logError(message: string, details?: JsonObject): void {
  print("error", message, details);
}

export function createRequestTrace(seed: {
  route: string;
  model: string;
  requestMessages: number;
  requestTools: number;
  upstreamTarget: string;
  authMode: "present" | "missing";
}): RequestTrace {
  stats.totalRequests += 1;

  const trace: RequestTrace = {
    id: crypto.randomUUID().slice(0, 8),
    startedAt: new Date().toISOString(),
    route: seed.route,
    model: seed.model,
    requestMessages: seed.requestMessages,
    requestTools: seed.requestTools,
    upstreamTarget: seed.upstreamTarget,
    status: "pending",
    authMode: seed.authMode,
  };

  recentRequests.unshift(trace);
  if (recentRequests.length > MAX_RECENT_REQUESTS) {
    recentRequests.length = MAX_RECENT_REQUESTS;
  }

  return trace;
}

export function completeRequestTrace(
  trace: RequestTrace,
  result: {
    status: "ok" | "error";
    upstreamStatus?: number;
    elapsedMs: number;
    error?: string;
    bodyPreview?: string;
  },
): void {
  trace.status = result.status;
  trace.upstreamStatus = result.upstreamStatus;
  trace.elapsedMs = result.elapsedMs;
  trace.error = result.error;
  trace.bodyPreview = result.bodyPreview;

  if (result.status === "ok") {
    stats.completedRequests += 1;
  } else {
    stats.failedRequests += 1;
  }
}

export function incrementModelsRequests(): void {
  stats.modelsRequests += 1;
}

export function snapshotStats(): ProxyStats {
  return { ...stats };
}

export function snapshotRecentRequests(): RequestTrace[] {
  return recentRequests.map((entry) => ({ ...entry }));
}
