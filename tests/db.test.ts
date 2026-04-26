import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { querySessionMetadata, querySessionSummaries, queryToolCounts, queryMessageParts, querySessionStats } from "../src/db";
import type { SessionMetadata, SessionSummary } from "../src/db";

const originalCwd = process.cwd();
let tempDir: string;
let dbPath: string;
let db: Database;

function createTestDatabase() {
  dbPath = path.join(tempDir, "test-opencode.db");
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT,
      slug TEXT NOT NULL, directory TEXT NOT NULL, title TEXT NOT NULL,
      version TEXT NOT NULL, share_url TEXT, summary_additions INTEGER,
      summary_deletions INTEGER, summary_files INTEGER, summary_diffs TEXT,
      revert TEXT, permission TEXT, time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL, time_compacting INTEGER, time_archived INTEGER,
      workspace_id TEXT
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE project (
      id TEXT PRIMARY KEY, worktree TEXT NOT NULL, vcs TEXT,
      name TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      time_initialized INTEGER, sandboxes TEXT NOT NULL DEFAULT '[]',
      icon_url TEXT, icon_color TEXT, commands TEXT, icon_url_override TEXT
    );
    CREATE TABLE todo (
      session_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
      priority TEXT NOT NULL, position INTEGER NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      PRIMARY KEY (session_id, position)
    );
  `);
  return db;
}

function insertSession(sid: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const defaults: Record<string, unknown> = {
    $project_id: "proj-1", $slug: `slug-${sid}`, $directory: "/test/project",
    $title: `Session ${sid}`, $version: "1.0.0",
    $time_created: now - 3600000, $time_updated: now,
    $parent_id: null, $share_url: null,
    $summary_additions: 100, $summary_deletions: 20, $summary_files: 5,
    $summary_diffs: null, $revert: null, $permission: null,
    $time_compacting: null, $time_archived: null, $workspace_id: null,
  };
  for (const [k, v] of Object.entries(overrides)) defaults[`$${k}`] = v;
  db.run(
    `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated,
       parent_id, share_url, summary_additions, summary_deletions, summary_files,
       summary_diffs, revert, permission, time_compacting, time_archived, workspace_id)
     VALUES ($id, $project_id, $slug, $directory, $title, $version, $time_created, $time_updated,
             $parent_id, $share_url, $summary_additions, $summary_deletions, $summary_files,
             $summary_diffs, $revert, $permission, $time_compacting, $time_archived, $workspace_id)`,
    { $id: sid, ...defaults },
  );
}

function insertMessage(id: string, sessionId: string) {
  const now = Date.now();
  db.run(
    `INSERT INTO message (id, session_id, time_created, time_updated, data)
     VALUES ($id, $sid, $tc, $tc, $data)`,
    { $id: id, $sid: sessionId, $tc: now, $data: `{"role":"user","time":{"created":${now}}}` },
  );
}

function insertAssistantMessage(msgId: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const data = {
    role: "assistant", parentID: `user-${msgId}`, mode: "default", agent: "default",
    path: { cwd: "/test/project", root: "/test/project" }, cost: 0.001,
    tokens: { total: 1000, input: 800, output: 200, reasoning: 0, cache: { write: 0, read: 0 } },
    modelID: "test-model", providerID: "test", finish: "stop",
    time: { created: now, completed: now + 1000 },
    ...overrides,
  };
  db.run(
    `INSERT INTO message (id, session_id, time_created, time_updated, data)
     VALUES ($id, $sessionId, $tc, $tu, $data)`,
    { $id: msgId, $sessionId: sessionId, $tc: now, $tu: now + 1000, $data: JSON.stringify(data) },
  );
}

function insertPart(id: string, messageId: string, sessionId: string, data: Record<string, unknown>) {
  const now = Date.now();
  db.run(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
     VALUES ($id, $mid, $sid, $tc, $tc, $data)`,
    { $id: id, $mid: messageId, $sid: sessionId, $tc: now, $data: JSON.stringify(data) },
  );
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-db-test-"));
  process.chdir(tempDir);
  createTestDatabase();
});

afterEach(() => {
  process.chdir(originalCwd);
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("querySessionSummaries", () => {
  test("returns empty array when no sessions exist", () => {
    expect(querySessionSummaries(db)).toEqual([]);
  });

  test("returns session with summary metadata", () => {
    const now = Date.now();
    insertSession("ses-1", { time_created: now - 3600000, time_updated: now });
    insertMessage("msg-1", "ses-1");
    insertAssistantMessage("msg-2", "ses-1");

    const result = querySessionSummaries(db);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ses-1");
    expect(result[0].messageCount).toBe(2);
    expect(result[0].durationMinutes).toBeGreaterThan(0);
  });

  test("excludes archived sessions", () => {
    insertSession("ses-active", { time_archived: null });
    insertSession("ses-archived", { time_archived: Date.now() });
    expect(querySessionSummaries(db)).toHaveLength(1);
  });

  test("returns sessions ordered by time_created desc", () => {
    insertSession("ses-old", { time_created: 1000, slug: "old" });
    insertSession("ses-new", { time_created: 2000, slug: "new" });
    const result = querySessionSummaries(db);
    expect(result[0]!.id).toBe("ses-new");
  });
});

describe("querySessionMetadata", () => {
  test("returns null for nonexistent session", () => {
    expect(querySessionMetadata(db, "nope")).toBeNull();
  });

  test("returns full metadata", () => {
    insertSession("ses-1", { title: "Test", summary_additions: 500, summary_deletions: 100, summary_files: 10 });
    const r = querySessionMetadata(db, "ses-1");
    expect(r!.title).toBe("Test");
    expect(r!.additions).toBe(500);
  });
});

describe("queryToolCounts", () => {
  test("counts tools and errors", () => {
    insertSession("ses-1");
    insertMessage("msg-1", "ses-1");
    insertPart("prt-1", "msg-1", "ses-1", { type: "tool", tool: "read", state: { status: "completed" } });
    insertPart("prt-2", "msg-1", "ses-1", { type: "tool", tool: "bash", state: { status: "error" } });
    insertPart("prt-3", "msg-1", "ses-1", { type: "tool", tool: "read", state: { status: "completed" } });

    const r = queryToolCounts(db, "ses-1");
    expect(r.read).toBe(2);
    expect(r.bash).toBe(1);
    expect(r.retries).toBe(1);
  });

  test("ignores non-tool parts", () => {
    insertSession("ses-1");
    insertMessage("msg-1", "ses-1");
    insertPart("prt-1", "msg-1", "ses-1", { type: "text", text: "hi" });
    expect(queryToolCounts(db, "ses-1")).toEqual({});
  });
});

describe("queryMessageParts", () => {
  test("returns parts in order", () => {
    insertSession("ses-1");
    insertMessage("msg-1", "ses-1");
    insertPart("prt-1", "msg-1", "ses-1", { type: "text", text: "user text" });
    insertPart("prt-2", "msg-1", "ses-1", { type: "tool", tool: "read", state: { status: "completed" } });

    const r = queryMessageParts(db, "ses-1");
    expect(r).toHaveLength(2);
    expect(r[0]!.type).toBe("text");
    expect(r[1]!.tool).toBe("read");
  });
});

describe("querySessionStats", () => {
  test("aggregates tokens and costs", () => {
    insertSession("ses-1");
    insertMessage("msg-u1", "ses-1");
    insertAssistantMessage("msg-a1", "ses-1", { tokens: { total: 500, input: 400, output: 100, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0.002 });
    insertAssistantMessage("msg-a2", "ses-1", { tokens: { total: 300, input: 200, output: 100, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0.001 });

    const r = querySessionStats(db, "ses-1");
    expect(r.userMessageCount).toBe(1);
    expect(r.assistantMessageCount).toBe(2);
    expect(r.totalInputTokens).toBe(600);
    expect(r.totalOutputTokens).toBe(200);
    expect(r.totalCost).toBeCloseTo(0.003);
  });

  test("tracks time-of-day", () => {
    insertSession("ses-1");
    const t = new Date("2026-01-15T14:30:00Z").getTime();
    db.run(
      `INSERT INTO message (id, session_id, time_created, time_updated, data)
       VALUES ('msg-1', 'ses-1', $t, $t, '{"role":"user"}')`,
      { $t: t },
    );
    const r = querySessionStats(db, "ses-1");
    expect(r.userMessageHours).toContain(14);
  });

  test("detects feature usage", () => {
    insertSession("ses-1");
    insertMessage("msg-1", "ses-1");
    insertPart("prt-1", "msg-1", "ses-1", { type: "tool", tool: "task", state: { status: "completed" } });
    insertPart("prt-2", "msg-1", "ses-1", { type: "tool", tool: "exa_web_search_exa", state: { status: "completed" } });

    const r = querySessionStats(db, "ses-1");
    expect(r.usedTaskAgent).toBe(true);
    expect(r.usedWebSearch).toBe(true);
  });
});
