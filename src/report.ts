import type { InsightsOutput } from "./extract";

export interface ReportData {
  header: {
    generatedAt: string;
    dateRange: string;
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
  };
  toolDistribution: Array<{ name: string; count: number; percentage: number }>;
  languageDistribution: Array<{ name: string; count: number; percentage: number }>;
  hourDistribution: number[];
  featureUsage: InsightsOutput["featureUsage"];
}

export function buildReportData(output: InsightsOutput): ReportData {
  const totalToolCalls = output.topTools.reduce((sum, t) => sum + t.count, 0);
  const totalLangCount = Object.values(output.languageCounts).reduce((s, c) => s + c, 0);

  return {
    header: {
      generatedAt: output.generatedAt,
      dateRange:
        `${output.dateRange.start ? output.dateRange.start.slice(0, 10) : "N/A"} to ` +
        `${output.dateRange.end ? output.dateRange.end.slice(0, 10) : "N/A"}`,
      totalSessions: output.totalSessions,
      analyzedCount: output.analyzedCount,
      totalUserMessages: output.totalUserMessages,
      totalDurationHours: output.totalDurationHours,
      totalInputTokens: output.totalInputTokens,
      totalOutputTokens: output.totalOutputTokens,
      totalCost: output.totalCost,
      totalAdditions: output.totalAdditions,
      totalDeletions: output.totalDeletions,
      totalFilesModified: output.totalFilesModified,
      activeDays: output.activeDays,
    },
    toolDistribution: output.topTools.map((t) => ({
      name: t.name,
      count: t.count,
      percentage: totalToolCalls > 0 ? Math.round((t.count / totalToolCalls) * 100) : 0,
    })),
    languageDistribution: Object.entries(output.languageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([lang, count]) => ({
        name: lang,
        count,
        percentage: totalLangCount > 0 ? Math.round((count / totalLangCount) * 100) : 0,
      })),
    hourDistribution: output.hourDistribution,
    featureUsage: output.featureUsage,
  };
}

export function renderStatsSummary(output: InsightsOutput): string {
  const fmt = (n: number) => n.toLocaleString("en-US");
  const data = output;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.analyzedCount}</div>
        <div class="stat-label">Sessions Analyzed</div>
        <div class="stat-sub">of ${data.totalSessions} total</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmt(data.totalUserMessages)}</div>
        <div class="stat-label">Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.totalDurationHours}h</div>
        <div class="stat-label">Duration</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmt(data.totalAdditions)}</div>
        <div class="stat-label">Lines Added</div>
        <div class="stat-sub">${fmt(data.totalDeletions)} deleted</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmt(data.totalFilesModified)}</div>
        <div class="stat-label">Files Modified</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.activeDays}</div>
        <div class="stat-label">Active Days</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmt(data.totalInputTokens)}</div>
        <div class="stat-label">Input Tokens</div>
        <div class="stat-sub">${fmt(data.totalOutputTokens)} output</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${data.totalCost.toFixed(2)}</div>
        <div class="stat-label">Total Cost</div>
      </div>
    </div>`;
}

export function renderReportHtml(output: InsightsOutput, narrativeSections?: Record<string, string>): string {
  const data = buildReportData(output);

  const narrative = {
    atAGlance: "",
    projectAreas: "",
    interactionStyle: "",
    whatWorks: "",
    frictionAnalysis: "",
    suggestions: "",
    onTheHorizon: "",
    funEnding: "",
    ...narrativeSections,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode Insights</title>
<style>
  :root {
    --bg: #0d1117;
    --card-bg: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --orange: #d29922;
    --red: #f85149;
    --purple: #a371f7;
    --cyan: #39c5cf;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; }
  h2 {
    font-size: 1.4rem; margin: 2rem 0 1rem;
    padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);
    color: var(--accent);
  }
  h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  .date-range { color: var(--text-dim); font-size: 0.9rem; margin-bottom: 1.5rem; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }
  .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
  .stat-label {
    font-size: 0.8rem; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;
  }
  .stat-sub { font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem; }

  .chart-container {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;
  }
  .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }

  .bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; gap: 0.75rem; }
  .bar-label { width: 100px; text-align: right; font-size: 0.85rem; color: var(--text-dim); flex-shrink: 0; }
  .bar-track { flex: 1; background: var(--border); border-radius: 4px; height: 20px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; min-width: 2px; }
  .bar-value { width: 60px; font-size: 0.8rem; color: var(--text-dim); flex-shrink: 0; }
  .bar-pct { width: 45px; text-align: right; font-size: 0.75rem; color: var(--accent); flex-shrink: 0; }

  .hour-grid { display: flex; gap: 2px; }
  .hour-cell { flex: 1; height: 60px; border-radius: 4px; position: relative; cursor: pointer; }
  .hour-cell:hover::after {
    content: attr(data-label);
    position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
    font-size: 0.7rem; color: var(--text-dim); white-space: nowrap;
  }

  .feature-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
  .feature-badge {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.75rem 1.25rem; text-align: center;
  }
  .feature-badge .count { font-size: 1.3rem; font-weight: 700; color: var(--green); }
  .feature-badge .name { font-size: 0.75rem; color: var(--text-dim); margin-top: 0.2rem; }

  .narrative-section {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;
  }
  .narrative-section p { margin-bottom: 0.75rem; }
  .narrative-section ul { margin-left: 1.5rem; }
  .narrative-section li { margin-bottom: 0.5rem; }

  nav.toc {
    position: sticky; top: 1rem; background: var(--card-bg);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 1rem; margin-bottom: 2rem;
  }
  nav.toc ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
  nav.toc li { white-space: nowrap; }
  nav.toc a { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
  nav.toc a:hover { text-decoration: underline; }

  .color-0 { background: var(--accent); }
  .color-1 { background: var(--green); }
  .color-2 { background: var(--orange); }
  .color-3 { background: var(--purple); }
  .color-4 { background: var(--cyan); }
  .color-5 { background: var(--red); }
  .color-6 { background: #f7a371; }
  .color-7 { background: #71a3f7; }

  .note {
    font-size: 0.85rem; color: var(--text-dim); font-style: italic;
    padding: 1rem; background: var(--card-bg);
    border: 1px solid var(--border); border-radius: 8px;
  }
</style>
</head>
<body>

<h1>OpenCode Insights Report</h1>
<p class="date-range">${data.header.dateRange} &middot; Generated ${new Date(data.header.generatedAt).toLocaleDateString()}</p>

${renderNavigation()}

<h2 id="summary">Summary</h2>
${renderStatsSummary(output)}

<h2 id="tools">Tool Usage</h2>
<div class="chart-container">
  <div class="chart-title">Top Tools by Usage</div>
  ${renderBarChart(data.toolDistribution)}
</div>

<h2 id="languages">Languages</h2>
<div class="chart-container">
  <div class="chart-title">Language Distribution</div>
  ${data.languageDistribution.length > 0 ? renderBarChart(data.languageDistribution) : '<p class="note">No language data available from patches.</p>'}
</div>

<h2 id="activity">Activity Hours</h2>
<div class="chart-container">
  <div class="chart-title">Messages by Hour of Day (UTC)</div>
  <div class="hour-grid">${renderHourHeatmap(data.hourDistribution)}</div>
</div>

<h2 id="features">Feature Adoption</h2>
<div class="chart-container">
  <div class="chart-title">Feature Usage Across Sessions</div>
  <div class="feature-grid">
    <div class="feature-badge"><div class="count">${data.featureUsage.taskAgentSessions}</div><div class="name">Used Task Agent</div></div>
    <div class="feature-badge"><div class="count">${data.featureUsage.mcpSessions}</div><div class="name">Used MCP</div></div>
    <div class="feature-badge"><div class="count">${data.featureUsage.webSearchSessions}</div><div class="name">Used Web Search</div></div>
    <div class="feature-badge"><div class="count">${data.featureUsage.webFetchSessions}</div><div class="name">Used Web Fetch</div></div>
  </div>
</div>

${narrative.atAGlance ? `<h2 id="at-a-glance">At a Glance</h2><div class="narrative-section">${narrative.atAGlance}</div>` : `<h2 id="at-a-glance">At a Glance</h2><div class="note">Run /insights with OpenCode to generate qualitative analysis.</div>`}
${narrative.projectAreas ? `<h2 id="project-areas">Project Areas</h2><div class="narrative-section">${narrative.projectAreas}</div>` : ""}
${narrative.interactionStyle ? `<h2 id="interaction-style">Interaction Style</h2><div class="narrative-section">${narrative.interactionStyle}</div>` : ""}
${narrative.whatWorks ? `<h2 id="what-works">What Works</h2><div class="narrative-section">${narrative.whatWorks}</div>` : ""}
${narrative.frictionAnalysis ? `<h2 id="friction">Friction Analysis</h2><div class="narrative-section">${narrative.frictionAnalysis}</div>` : ""}
${narrative.suggestions ? `<h2 id="suggestions">Suggestions</h2><div class="narrative-section">${narrative.suggestions}</div>` : ""}
${narrative.onTheHorizon ? `<h2 id="horizon">On the Horizon</h2><div class="narrative-section">${narrative.onTheHorizon}</div>` : ""}
${narrative.funEnding ? `<h2 id="fun-ending">Fun Ending</h2><div class="narrative-section">${narrative.funEnding}</div>` : ""}

</body>
</html>`;
}

function renderNavigation(): string {
  const links = [
    ["#summary", "Summary"], ["#tools", "Tool Usage"], ["#languages", "Languages"],
    ["#activity", "Activity"], ["#features", "Features"], ["#at-a-glance", "At a Glance"],
    ["#project-areas", "Project Areas"], ["#interaction-style", "Interaction Style"],
    ["#what-works", "What Works"], ["#friction", "Friction"],
    ["#suggestions", "Suggestions"], ["#horizon", "On the Horizon"],
    ["#fun-ending", "Fun Ending"],
  ];
  const items = links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  return `<nav class="toc"><ul>${items}</ul></nav>`;
}

function renderBarChart(items: Array<{ name: string; count: number; percentage: number }>): string {
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  return items
    .map(
      (item, i) => `
    <div class="bar-row">
      <span class="bar-label">${item.name}</span>
      <div class="bar-track">
        <div class="bar-fill color-${i % 8}" style="width:${Math.round((item.count / maxCount) * 100)}%"></div>
      </div>
      <span class="bar-value">${item.count.toLocaleString("en-US")}</span>
      <span class="bar-pct">${item.percentage}%</span>
    </div>`,
    )
    .join("");
}

function renderHourHeatmap(hours: number[]): string {
  const maxVal = Math.max(...hours, 1);
  return hours
    .map((count, hour) => {
      const intensity = count / maxVal;
      const r = Math.round(22 + intensity * (88 - 22));
      const g = Math.round(27 + intensity * (166 - 27));
      const b = Math.round(34 + intensity * (255 - 34));
      return `<div class="hour-cell" style="background:rgb(${r},${g},${b})" data-label="${hour}:00 ${count}" title="${hour}:00 — ${count} messages"></div>`;
    })
    .join("");
}
