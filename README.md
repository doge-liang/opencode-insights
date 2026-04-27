# opencode-insights

Analyze your OpenCode session history. Generates interactive HTML reports revealing coding habits, friction points, and workflow optimizations — inspired by Claude Code's `/insights` command.

## Features

- **Session analytics** — sessions, messages, tokens, cost, code changes
- **Tool usage** — bar charts for top tools (Read, Bash, Edit, Grep, etc.)
- **Language distribution** — detected from file changes
- **Activity heatmap** — 24-hour message distribution
- **Feature adoption** — Task Agent, MCP, Web Search, Web Fetch usage
- **Self-contained HTML** — no external dependencies, dark theme, works offline
- **Privacy-first** — reads only local `opencode.db`, never phones home

## Quick Start

```bash
# One-shot: extract JSON data
bunx @doge-liang/opencode-insights --json

# Generate HTML report (opens in browser)
bunx @doge-liang/opencode-insights --report
```

Report saved to `~/.opencode/insights/report.html`.

## Install

```bash
# Global install via bun
bun install -g opencode-insights

# Or run directly with bunx (no install needed)
bunx opencode-insights --report
```

## OpenCode Integration

### As a skill (recommended)

Copy the skill file into your project:

```bash
mkdir -p .opencode/skills/insights
cp node_modules/opencode-insights/skill/SKILL.md .opencode/skills/insights/
```

Then type `/insights` in any OpenCode session.

### As a plugin

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-insights"]
}
```

### Programmatic API

```typescript
import { generateInsightsJson, renderReportHtml } from "opencode-insights";
import { Database } from "bun:sqlite";

const db = new Database("~/.local/share/opencode/opencode.db", { readonly: true });
const data = generateInsightsJson(db);
const html = renderReportHtml(data);
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--json, -j` | Output structured JSON to stdout |
| `--report, -r` | Generate interactive HTML report |
| `--db <path>` | Custom SQLite database path |
| `--output <path>` | Custom report output path |
| `--help, -h` | Show usage |

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- OpenCode sessions in `~/.local/share/opencode/opencode.db`

## Privacy

All analysis runs locally. Reads only:
- `~/.local/share/opencode/opencode.db` (session database)

No data is transmitted to external servers.

## License

MIT
