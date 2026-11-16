import "server-only";

import { statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SystemPerformance = {
  cpu: {
    model: string;
    cores: number;
    /** Percentage busy, averaged since boot — see below. */
    usedPercent: number | null;
    /** 1/5/15-minute load. All zero on Windows, where the OS has no loadavg. */
    loadAverage: [number, number, number];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    usedPercent: number;
    /** Resident set size of this Node process, not of the host. */
    processRssBytes: number;
  };
  disk: {
    /** Mount point or drive root the figures describe. */
    path: string;
    totalBytes: number;
    usedBytes: number;
    usedPercent: number;
  } | null;
  hostUptimeSeconds: number;
  processUptimeSeconds: number;
  platform: string;
  arch: string;
  nodeVersion: string;
  sampledAt: Date;
};

function percent(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

async function readDiskUsage(): Promise<SystemPerformance["disk"]> {
  try {
    const target = process.platform === "win32" ? path.parse(process.cwd()).root : "/";
    const stats = await statfs(target);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      path: target,
      totalBytes,
      usedBytes,
      usedPercent: percent(usedBytes, totalBytes),
    };
  } catch {
    return null;
  }
}

export async function getSystemPerformance(): Promise<SystemPerformance> {
  const cpus = os.cpus();
  const cores = cpus.length;

  const ticks = cpus.reduce(
    (acc, cpu) => {
      const { user, nice, sys, idle, irq } = cpu.times;
      acc.total += user + nice + sys + idle + irq;
      acc.idle += idle;
      return acc;
    },
    { total: 0, idle: 0 },
  );

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const loadAverage = os.loadavg() as [number, number, number];

  return {
    cpu: {
      model: cpus[0]?.model.trim() ?? "Unknown processor",
      cores,
      usedPercent:
        ticks.total > 0 ? Math.round(((ticks.total - ticks.idle) / ticks.total) * 100) : null,
      loadAverage,
    },
    memory: {
      totalBytes: totalMemory,
      usedBytes: usedMemory,
      usedPercent: percent(usedMemory, totalMemory),
      processRssBytes: process.memoryUsage().rss,
    },
    disk: await readDiskUsage(),
    hostUptimeSeconds: os.uptime(),
    processUptimeSeconds: Math.round(process.uptime()),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    nodeVersion: process.version,
    sampledAt: new Date(),
  };
}
