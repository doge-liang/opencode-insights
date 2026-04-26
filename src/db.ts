import type { Database } from "bun:sqlite";

export interface SessionSummary {
  id: string;
  projectId: string;
  slug: string;
  directory: string;
  title: string;
  timeCreated: number;
  timeUpdated: number;
  durationMinutes: number;
  messageCount: number;
}

export interface SessionMetadata {
  id: string;
  projectId: string;
  directory: string;
  title: string;
  additions: number;
  deletions: number;
  filesModified: number;
  timeCreated: number;
  timeUpdated: number;
  projectName?: string;
  isArchived: boolean;
}

export interface PartData {
  id: string;
  messageId: string;
  sessionId: string;
  type: string;
  text?: string;
  tool?: string;
  state?: {
    status?: string;
    output?: string;
    input?: Record<string, unknown>;
    error?: string;
  };
}

export interface ToolCounts {
  [toolName: string]: number;
  retries?: number;
}

export interface SessionStats {
  sessionId: string;
  userMessageCount: number;
  assistantMessageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  languageCounts: Record<string, number>;
  usedTaskAgent: boolean;
  usedMcp: boolean;
  usedWebSearch: boolean;
  usedWebFetch: boolean;
  userMessageHours: number[];
  toolErrors: number;
}

export function querySessionSummaries(db: Database): SessionSummary[] {
  return db
    .query(
      `SELECT s.id, s.project_id as projectId, s.slug, s.directory, s.title,
              s.time_created as timeCreated, s.time_updated as timeUpdated,
              CAST((s.time_updated - s.time_created) / 60000.0 AS INTEGER) as durationMinutes,
              (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) as messageCount
       FROM session s
       WHERE s.time_archived IS NULL
       ORDER BY s.time_created DESC`,
    )
    .all() as SessionSummary[];
}

export function querySessionMetadata(db: Database, sessionId: string): SessionMetadata | null {
  const row = db
    .query(
      `SELECT s.id, s.project_id as projectId, s.directory, s.title,
              COALESCE(s.summary_additions, 0) as additions,
              COALESCE(s.summary_deletions, 0) as deletions,
              COALESCE(s.summary_files, 0) as filesModified,
              s.time_created as timeCreated,
              s.time_updated as timeUpdated,
              s.time_archived as timeArchived,
              p.name as projectName
       FROM session s
       LEFT JOIN project p ON s.project_id = p.id
       WHERE s.id = $id`,
    )
    .get({ $id: sessionId }) as Record<string, unknown> | null;

  if (!row) return null;

  const { timeArchived, ...rest } = row;
  return {
    ...rest,
    isArchived: timeArchived !== null,
  } as unknown as SessionMetadata;
}

export function queryToolCounts(db: Database, sessionId: string): ToolCounts {
  const counts: ToolCounts = {};
  let errors = 0;

  const parts = db
    .query(
      `SELECT data
       FROM part
       WHERE session_id = $id
         AND json_extract(data, '$.type') = 'tool'`,
    )
    .all({ $id: sessionId }) as Array<{ data: string }>;

  for (const part of parts) {
    const d = JSON.parse(part.data);
    const toolName = d.tool;
    if (toolName) {
      counts[toolName] = (counts[toolName] || 0) + 1;
    }
    if (d.state?.status === "error") {
      errors++;
    }
  }

  if (errors > 0) {
    counts.retries = errors;
  }

  return counts;
}

export function queryMessageParts(db: Database, sessionId: string): PartData[] {
  const rows = db
    .query(
      `SELECT id, message_id as messageId, session_id as sessionId, data
       FROM part
       WHERE session_id = $id
       ORDER BY time_created ASC`,
    )
    .all({ $id: sessionId }) as Array<{
      id: string;
      messageId: string;
      sessionId: string;
      data: string;
    }>;

  return rows.map((row) => {
    const d = JSON.parse(row.data);
    return {
      id: row.id,
      messageId: row.messageId,
      sessionId: row.sessionId,
      type: d.type,
      text: d.text,
      tool: d.tool,
      state: d.state,
    };
  });
}

export function querySessionStats(db: Database, sessionId: string): SessionStats {
  const messages = db
    .query(
      `SELECT data, time_created as timeCreated
       FROM message
       WHERE session_id = $id
       ORDER BY time_created ASC`,
    )
    .all({ $id: sessionId }) as Array<{ data: string; timeCreated: number }>;

  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let usedTaskAgent = false;
  let usedMcp = false;
  let usedWebSearch = false;
  let usedWebFetch = false;
  const userMessageHours: number[] = [];

  for (const msg of messages) {
    const d = JSON.parse(msg.data);
    if (d.role === "user") {
      userMessageCount++;
      const hour = new Date(msg.timeCreated).getHours();
      userMessageHours.push(hour);
    }
    if (d.role === "assistant") {
      assistantMessageCount++;
      if (d.tokens) {
        totalInputTokens += d.tokens.input || 0;
        totalOutputTokens += d.tokens.output || 0;
      }
      if (d.cost) totalCost += d.cost;
    }
  }

  const parts = db
    .query(`SELECT data FROM part WHERE session_id = $id`)
    .all({ $id: sessionId }) as Array<{ data: string }>;

  let toolErrors = 0;
  const languageCounts: Record<string, number> = {};

  for (const part of parts) {
    const d = JSON.parse(part.data);
    if (d.type === "tool") {
      if (d.tool === "task") usedTaskAgent = true;
      if (d.tool && (d.tool as string).startsWith("mcp__")) usedMcp = true;
      if (d.tool === "exa_web_search_exa") usedWebSearch = true;
      if (d.tool === "webfetch" || d.tool === "exa_web_fetch_exa") usedWebFetch = true;
      if (d.state?.status === "error") toolErrors++;
    }
    if (d.type === "patch" && d.state?.output) {
      const ext = detectLanguageFromPatch(d.state.output);
      if (ext) languageCounts[ext] = (languageCounts[ext] || 0) + 1;
    }
  }

  return {
    sessionId,
    userMessageCount,
    assistantMessageCount,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    languageCounts,
    usedTaskAgent,
    usedMcp,
    usedWebSearch,
    usedWebFetch,
    userMessageHours,
    toolErrors,
  };
}

function detectLanguageFromPatch(patch: string): string | null {
  const match = patch.match(/Index:\s+(\S+)/);
  if (!match) return null;
  const filename = match[1];
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", rs: "Rust", go: "Go", java: "Java", rb: "Ruby", php: "PHP",
    c: "C", cpp: "C++", h: "C", hpp: "C++",
    css: "CSS", scss: "SCSS", html: "HTML", md: "Markdown",
    json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
    sql: "SQL", sh: "Shell", bash: "Shell", zsh: "Shell", dockerfile: "Docker",
  };
  return langMap[ext || ""] || null;
}
