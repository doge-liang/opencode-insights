import type { Database } from "bun:sqlite";

import {
  querySessionSummaries,
  querySessionMetadata,
  queryToolCounts,
  queryMessageParts,
  querySessionStats,
} from "./db";
import type { SessionMetadata, PartData, ToolCounts, SessionStats } from "./db";

export type { SessionMetadata, PartData, ToolCounts, SessionStats } from "./db";

export interface ExtractedSession {
  metadata: SessionMetadata;
  stats: SessionStats;
  toolCounts: ToolCounts;
  chatParts: PartData[];
  featureFlags: string[];
}

export interface InsightsOutput {
  generatedAt: string;
  dateRange: { start: string; end: string };
  totalSessions: number;
  analyzedCount: number;
  totalUserMessages: number;
  totalDurationHours: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesModified: number;
  activeDays: number;
  topTools: Array<{ name: string; count: number }>;
  languageCounts: Record<string, number>;
  hourDistribution: number[];
  featureUsage: {
    taskAgentSessions: number;
    mcpSessions: number;
    webSearchSessions: number;
    webFetchSessions: number;
  };
  sessions: ExtractedSession[];
}

export function extractSessionData(db: Database, sessionId: string, storageDir?: string): ExtractedSession | null {
  const metadata = querySessionMetadata(db, sessionId);
  if (!metadata) return null;

  const stats = querySessionStats(db, sessionId, storageDir);
  const toolCounts = queryToolCounts(db, sessionId);
  const chatParts = queryMessageParts(db, sessionId);

  const featureFlags: string[] = [];
  if (stats.usedTaskAgent) featureFlags.push("task-agent");
  if (stats.usedMcp) featureFlags.push("mcp");
  if (stats.usedWebSearch) featureFlags.push("web-search");
  if (stats.usedWebFetch) featureFlags.push("web-fetch");

  return { metadata, stats, toolCounts, chatParts, featureFlags };
}

export function filterSessions(sessions: ExtractedSession[]): ExtractedSession[] {
  return sessions.filter((s) => {
    const durationMinutes = (s.metadata.timeUpdated - s.metadata.timeCreated) / 60000;
    return durationMinutes >= 1 && s.stats.userMessageCount >= 2;
  });
}

export function generateInsightsJson(db: Database, storageDir?: string): InsightsOutput {
  const summaries = querySessionSummaries(db);
  const allSessions: ExtractedSession[] = [];

  for (const summary of summaries) {
    const data = extractSessionData(db, summary.id, storageDir);
    if (data) allSessions.push(data);
  }

  const filtered = filterSessions(allSessions);

  let totalUserMessages = 0;
  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalFilesModified = 0;
  const globalToolCounts: Record<string, number> = {};
  const globalLanguageCounts: Record<string, number> = {};
  const hourBuckets = new Array(24).fill(0);
  const activeDaySet = new Set<number>();
  let taskAgentSessions = 0;
  let mcpSessions = 0;
  let webSearchSessions = 0;
  let webFetchSessions = 0;
  let earliest = Infinity;
  let latest = -Infinity;

  for (const sess of filtered) {
    totalUserMessages += sess.stats.userMessageCount;
    totalDurationMs += sess.stats.activeDurationMs;
    totalInputTokens += sess.stats.totalInputTokens;
    totalOutputTokens += sess.stats.totalOutputTokens;
    totalCost += sess.stats.totalCost;
    totalAdditions += sess.metadata.additions;
    totalDeletions += sess.metadata.deletions;
    totalFilesModified += sess.metadata.filesModified;

    if (sess.metadata.timeCreated < earliest) earliest = sess.metadata.timeCreated;
    if (sess.metadata.timeUpdated > latest) latest = sess.metadata.timeUpdated;

    const day = Math.floor(sess.metadata.timeCreated / 86400000);
    activeDaySet.add(day);

    for (const h of sess.stats.userMessageHours) {
      if (h >= 0 && h < 24) hourBuckets[h]++;
    }

    if (sess.stats.usedTaskAgent) taskAgentSessions++;
    if (sess.stats.usedMcp) mcpSessions++;
    if (sess.stats.usedWebSearch) webSearchSessions++;
    if (sess.stats.usedWebFetch) webFetchSessions++;

    for (const [name, count] of Object.entries(sess.toolCounts)) {
      if (name !== "retries") {
        globalToolCounts[name] = (globalToolCounts[name] || 0) + count;
      }
    }

    for (const [lang, count] of Object.entries(sess.stats.languageCounts)) {
      globalLanguageCounts[lang] = (globalLanguageCounts[lang] || 0) + count;
    }
  }

  const topTools = Object.entries(globalToolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      start: earliest === Infinity ? "" : new Date(earliest).toISOString(),
      end: latest === -Infinity ? "" : new Date(latest).toISOString(),
    },
    totalSessions: summaries.length,
    analyzedCount: filtered.length,
    totalUserMessages,
    totalDurationHours: Math.round((totalDurationMs / 3600000) * 10) / 10,
    totalInputTokens,
    totalOutputTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalAdditions,
    totalDeletions,
    totalFilesModified,
    activeDays: activeDaySet.size,
    topTools,
    languageCounts: globalLanguageCounts,
    hourDistribution: hourBuckets,
    featureUsage: {
      taskAgentSessions,
      mcpSessions,
      webSearchSessions,
      webFetchSessions,
    },
    sessions: filtered,
  };
}
