import { describe, expect, test } from "bun:test";

import { renderReportHtml, buildReportData } from "../src/report";
import type { InsightsOutput } from "../src/extract";

function mock(): InsightsOutput {
  return {
    generatedAt: "2026-04-27T10:00:00.000Z",
    dateRange: { start: "2026-03-01T00:00:00.000Z", end: "2026-04-27T00:00:00.000Z" },
    totalSessions: 50, analyzedCount: 42,
    totalUserMessages: 1200, totalDurationHours: 35.5,
    totalInputTokens: 500000, totalOutputTokens: 120000, totalCost: 2.45,
    totalAdditions: 15000, totalDeletions: 3000, totalFilesModified: 200, activeDays: 28,
    topTools: [
      { name: "read", count: 500 }, { name: "bash", count: 300 },
      { name: "edit", count: 150 }, { name: "grep", count: 100 },
      { name: "glob", count: 80 },
    ],
    languageCounts: { TypeScript: 50, Python: 20, Markdown: 15, JSON: 10 },
    hourDistribution: Array(24).fill(0).map((_, i) => i > 6 && i < 22 ? 10 : 2),
    featureUsage: { taskAgentSessions: 15, mcpSessions: 8, webSearchSessions: 20, webFetchSessions: 12 },
    sessions: [],
  };
}

describe("buildReportData", () => {
  test("transforms into report structure", () => {
    const d = buildReportData(mock());
    expect(d.header.analyzedCount).toBe(42);
    expect(d.toolDistribution).toHaveLength(5);
    expect(d.toolDistribution[0]!.name).toBe("read");
    expect(d.toolDistribution[0]!.percentage).toBeGreaterThan(0);
  });
});

describe("renderReportHtml", () => {
  test("generates valid HTML", () => {
    const h = renderReportHtml(mock());
    expect(h).toContain("<!DOCTYPE html>");
    expect(h).toContain("</html>");
    expect(h).toContain("<title>OpenCode Insights</title>");
  });

  test("is self-contained (no CDN dependencies)", () => {
    const h = renderReportHtml(mock());
    expect(h).not.toContain("cdn.jsdelivr");
    expect(h).not.toContain("unpkg.com");
    expect(h).not.toContain("googleapis.com");
  });

  test("includes navigation", () => {
    const h = renderReportHtml(mock());
    expect(h).toContain("Summary");
    expect(h).toContain("Tool Usage");
    expect(h).toContain("At a Glance");
    expect(h).toContain("Suggestions");
  });

  test("renders stats from output", () => {
    const h = renderReportHtml(mock());
    expect(h).toContain("42");
    expect(h).toContain("35.5h");
    expect(h).toContain("500,000");
  });

  test("renders narrative content when provided", () => {
    const h = renderReportHtml(mock(), { atAGlance: "<p>Custom insight here</p>" });
    expect(h).toContain("Custom insight here");
  });
});
