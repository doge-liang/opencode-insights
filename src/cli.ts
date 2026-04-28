#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { generateInsightsJson } from "./extract";
import { renderReportHtml } from "./report";

const DB_DIR = path.join(os.homedir(), ".local", "share", "opencode");
const DB_PATH = path.join(DB_DIR, "opencode.db");
const STORAGE_DIR = path.join(DB_DIR, "storage", "session_diff");
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".opencode", "insights");
const DEFAULT_OUTPUT_FILE = path.join(DEFAULT_OUTPUT_DIR, "report.html");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function printUsage() {
  console.log("opencode-insights — Session analysis and reporting for OpenCode");
  console.log("");
  console.log("Usage:");
  console.log("  opencode-insights --json                Extract session data as JSON");
  console.log("  opencode-insights --report              Generate HTML report");
  console.log("  opencode-insights --json --db <path>    Use custom DB path");
  console.log("  opencode-insights --report --output <path>  Custom output path");
  console.log("");
  console.log("Options:");
  console.log("  --json, -j       Output structured JSON to stdout");
  console.log("  --report, -r     Generate interactive HTML report");
  console.log("  --db <path>      Path to opencode.db (default: ~/.local/share/opencode/opencode.db)");
  console.log("  --output <path>  Report output path (default: ~/.opencode/insights/report.html)");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const jsonMode = args.includes("--json") || args.includes("-j");
  const reportMode = args.includes("--report") || args.includes("-r");

  if (!jsonMode && !reportMode) {
    printUsage();
    process.exit(0);
  }

  const dbFlagIdx = args.findIndex((a) => a === "--db");
  const dbPath = dbFlagIdx !== -1 ? args[dbFlagIdx + 1] : DB_PATH;

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    console.error("OpenCode session database does not exist yet. Use OpenCode more to generate data.");
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    console.error(`Failed to open database: ${e}`);
    process.exit(1);
  }

  const output = generateInsightsJson(db, STORAGE_DIR);
  db.close();

  if (jsonMode) {
    console.log(JSON.stringify(output, null, 2));
  }

  if (reportMode) {
    const outputFlagIdx = args.findIndex((a) => a === "--output");
    const outputPath = outputFlagIdx !== -1 ? args[outputFlagIdx + 1] : DEFAULT_OUTPUT_FILE;

    ensureDir(path.dirname(outputPath));

    const narrativeIdx = args.findIndex((a) => a === "--at-a-glance");
    let narrative: Record<string, string> | undefined;
    if (narrativeIdx !== -1) {
      narrative = { atAGlance: args[narrativeIdx + 1] || "" };
    }

    const html = renderReportHtml(output, narrative);
    fs.writeFileSync(outputPath, html);

    console.log(`Report generated: ${outputPath}`);
    console.log(`Sessions analyzed: ${output.analyzedCount} (of ${output.totalSessions} total)`);
    console.log(`Date range: ${output.dateRange.start || "N/A"} to ${output.dateRange.end || "N/A"}`);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
