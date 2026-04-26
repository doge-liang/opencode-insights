import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { extractSessionData, filterSessions, generateInsightsJson } from "../src/extract";
import type { ExtractedSession } from "../src/extract";

const originalCwd = process.cwd();
let tempDir: string;
let db: Database;

function createTestDatabase() {
  const dbPath = path.join(tempDir, "test.db");
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT, slug TEXT NOT NULL, directory TEXT NOT NULL, title TEXT NOT NULL, version TEXT NOT NULL, share_url TEXT, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER, summary_diffs TEXT, revert TEXT, permission TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, time_compacting INTEGER, time_archived INTEGER, workspace_id TEXT);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT NOT NULL, vcs TEXT, name TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, time_initialized INTEGER, sandboxes TEXT NOT NULL DEFAULT '[]', icon_url TEXT, icon_color TEXT, commands TEXT, icon_url_override TEXT);
  `);
}

function insertSession(id: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const d: Record<string, unknown> = { $project_id: "p1", $slug: `s-${id}`, $directory: "/t", $title: "T", $version: "1.0", $time_created: now - 3600000, $time_updated: now, $parent_id: null, $share_url: null, $summary_additions: 0, $summary_deletions: 0, $summary_files: 0, $summary_diffs: null, $revert: null, $permission: null, $time_compacting: null, $time_archived: null, $workspace_id: null };
  for (const [k, v] of Object.entries(overrides)) d[`$${k}`] = v;
  db.run(`INSERT INTO session (id,project_id,slug,directory,title,version,time_created,time_updated,parent_id,share_url,summary_additions,summary_deletions,summary_files,summary_diffs,revert,permission,time_compacting,time_archived,workspace_id) VALUES ($id,$project_id,$slug,$directory,$title,$version,$time_created,$time_updated,$parent_id,$share_url,$summary_additions,$summary_deletions,$summary_files,$summary_diffs,$revert,$permission,$time_compacting,$time_archived,$workspace_id)`, { $id: id, ...d });
}

function insertUserMsg(sid: string) {
  db.run(`INSERT INTO message (id,session_id,time_created,time_updated,data) VALUES ('m-${sid}-u${Math.random().toString(36).slice(2,6)}','${sid}',1,1,'{"role":"user"}')`);
}

function insertAssistantMsg(sid: string, overrides: Record<string, unknown> = {}) {
  const d = { role: "assistant", tokens: { total: 100, input: 80, output: 20, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0.001, ...overrides };
  db.run(`INSERT INTO message (id,session_id,time_created,time_updated,data) VALUES ('m-${sid}-a${Math.random().toString(36).slice(2,6)}','${sid}',1,1,'${JSON.stringify(d).replace(/'/g, "''")}')`);
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-extract-test-"));
  process.chdir(tempDir);
  createTestDatabase();
});

afterEach(() => {
  process.chdir(originalCwd);
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("extractSessionData", () => {
  test("returns null for missing session", () => {
    expect(extractSessionData(db, "nope")).toBeNull();
  });

  test("extracts metadata and parts", () => {
    insertSession("ses-1", { title: "Debug", directory: "/app" });
    insertUserMsg("ses-1");
    insertUserMsg("ses-1");
    db.run("INSERT INTO part (id,message_id,session_id,time_created,time_updated,data) VALUES ('prt-1','m-x','ses-1',1,1,'{\"type\":\"text\",\"text\":\"help\"}')");

    const r = extractSessionData(db, "ses-1");
    expect(r).not.toBeNull();
    expect(r!.metadata.title).toBe("Debug");
    expect(r!.chatParts.length).toBeGreaterThan(0);
  });
});

describe("filterSessions", () => {
  test("filters <2 user messages", () => {
    const s: ExtractedSession[] = [{
      metadata: { id: "s1", projectId: "p1", slug: "s", directory: "/d", title: "t", additions: 0, deletions: 0, filesModified: 0, timeCreated: 1000, timeUpdated: 1000 + 120000, isArchived: false },
      stats: { sessionId: "s1", userMessageCount: 1, assistantMessageCount: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, languageCounts: {}, usedTaskAgent: false, usedMcp: false, usedWebSearch: false, usedWebFetch: false, userMessageHours: [], toolErrors: 0 },
      toolCounts: {}, chatParts: [], featureFlags: [],
    }];
    expect(filterSessions(s)).toHaveLength(0);
  });

  test("filters <1 minute duration", () => {
    const s: ExtractedSession[] = [{
      metadata: { id: "s1", projectId: "p1", slug: "s", directory: "/d", title: "t", additions: 0, deletions: 0, filesModified: 0, timeCreated: 1000, timeUpdated: 1001, isArchived: false },
      stats: { sessionId: "s1", userMessageCount: 5, assistantMessageCount: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, languageCounts: {}, usedTaskAgent: false, usedMcp: false, usedWebSearch: false, usedWebFetch: false, userMessageHours: [], toolErrors: 0 },
      toolCounts: {}, chatParts: [], featureFlags: [],
    }];
    expect(filterSessions(s)).toHaveLength(0);
  });

  test("keeps valid sessions", () => {
    const s: ExtractedSession[] = [{
      metadata: { id: "s1", projectId: "p1", slug: "s", directory: "/d", title: "t", additions: 0, deletions: 0, filesModified: 0, timeCreated: 1000, timeUpdated: 1000 + 120000, isArchived: false },
      stats: { sessionId: "s1", userMessageCount: 5, assistantMessageCount: 0, totalInputTokens: 100, totalOutputTokens: 50, totalCost: 0.01, languageCounts: {}, usedTaskAgent: false, usedMcp: false, usedWebSearch: false, usedWebFetch: false, userMessageHours: [], toolErrors: 0 },
      toolCounts: {}, chatParts: [], featureFlags: [],
    }];
    expect(filterSessions(s)).toHaveLength(1);
  });
});

describe("generateInsightsJson", () => {
  test("generates complete output", () => {
    insertSession("ses-a", { time_created: 1000, time_updated: 1000 + 300000, summary_additions: 200, summary_deletions: 30, summary_files: 8, title: "Login" });
    insertUserMsg("ses-a"); insertUserMsg("ses-a"); insertUserMsg("ses-a");
    insertAssistantMsg("ses-a", { tokens: { total: 500, input: 400, output: 100, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0.005 });
    insertSession("ses-b", { time_created: 2000, time_updated: 2000 + 120000, summary_additions: 50, summary_deletions: 5, summary_files: 2 });
    insertUserMsg("ses-b"); insertUserMsg("ses-b");
    insertAssistantMsg("ses-b");

    const r = generateInsightsJson(db);
    expect(r.totalSessions).toBe(2);
    expect(r.analyzedCount).toBe(2);
    expect(r.totalUserMessages).toBe(5);
    expect(r.totalAdditions).toBe(250);
    expect(r.sessions).toHaveLength(2);
  });

  test("filters short/few-message sessions silently", () => {
    insertSession("ses-fast", { time_created: 1000, time_updated: 1001 });
    insertUserMsg("ses-fast"); insertUserMsg("ses-fast");
    insertSession("ses-few", { time_created: 1000, time_updated: 200000 });
    insertUserMsg("ses-few");

    const r = generateInsightsJson(db);
    expect(r.analyzedCount).toBe(0);
  });
});
