---
name: insights
description: |
  Use when: user types "/insights", "analyze my sessions", "show usage report", "session analytics", "usage insights"
  DO NOT USE FOR: debugging individual sessions, general Q&A, codebase analysis
  Analyzes OpenCode session history and generates an interactive HTML report.
---

# OpenCode Insights Agent

You analyze OpenCode session history to generate actionable usage reports.

## PHASE 0: Run Data Extraction

```bash
npx bun run src/cli.ts --json > /tmp/opencode-insights-data.json
```

Read the JSON. If empty or failed, inform the user and stop.

## PHASE 1: Qualitative Facet Analysis

For each session in `sessions[]`, read its `chatParts` and extract:

### 1.1 Outcome & Goal
- **underlying_goal**: What the user fundamentally wanted
- **goal_categories**: debug_investigate | implement_feature | fix_bug | write_script_tool | refactor_code | configure_system | create_pr_commit | analyze_data | understand_codebase | write_tests | write_docs | deploy_infra
- **outcome**: fully_achieved | mostly_achieved | partially_achieved | not_achieved | unclear

### 1.2 Satisfaction
Track explicit user signals: "great!" → happy, "thanks" → satisfied, continuing → likely_satisfied, "not right" → dissatisfied, frustrated language → frustrated

### 1.3 Friction
Identify: misunderstood_request | wrong_approach | buggy_code | user_rejected_action | excessive_changes | wrong_file | tool_failure | user_unclear

### 1.4 Session Type
single_task | multi_task | iterative_refinement | exploration | quick_question

## PHASE 2: Generate Narrative Sections (Markdown)

Generate these sections using second person ("you"):

1. **At a Glance** — 4 parts: what's working (2-3 sentences), what's hindering (2-3 sentences), quick wins (1-2 actionable tips), ambitious workflows (1-2 patterns)
2. **Project Areas** — 4-5 thematic clusters with session counts and descriptions
3. **Interaction Style** — 2-3 paragraphs on how you interact with the Agent
4. **What Works** — 3 impressive workflows with titles and descriptions
5. **Friction Analysis** — 3 friction categories, each with description and 2 examples
6. **Suggestions** — AGENTS.md additions, features to try, usage patterns with copyable prompts
7. **On the Horizon** — 3 ambitious directions with copyable prompts
8. **Fun Ending** — One memorable human moment

## PHASE 3: Generate HTML

Build the final HTML by combining the extracted data with your narrative:

1. Read `/tmp/opencode-insights-data.json`
2. Use the `renderReportHtml()` function from `./src/report.ts` (import it)
3. Pass your narrative sections as the second argument
4. Write to `~/.opencode/insights/report.html`

## PHASE 4: Present

Tell the user:
```
Report: ~/.opencode/insights/report.html
Key findings: [1-2 sentence highlight]
Surprising: [1 surprising insight]
```

## Privacy

Reads only `~/.local/share/opencode/opencode.db`. No data leaves your machine.
