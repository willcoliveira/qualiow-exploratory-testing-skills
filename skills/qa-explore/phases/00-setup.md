# Phase 0: Session Setup

## Step 1: Parse Input & Resolve Target

Extract from user message:
- **target_url**: The URL to test (required)
- **domain**: Domain type (optional -- auto-detect if not specified)
- **focus**: Specific area or feature (optional)
- **time_box**: Session duration (default: 45 min, max: 45 min)
- **context**: Path to requirements file OR inline context text (optional)

Resolve target config from `data/targets/` if available. Read domain config from `data/domains/`.

## Step 2: Load Context (if provided)

**If `--context <file>` provided:** Read the file. It may be a `tool-qa-workflow` output (structured markdown with Jira data, Confluence specs, GitLab MR diffs, Figma design notes) or any document describing what to test.

**If inline context provided:** Extract from the user's message any descriptions of: what the feature does, acceptance criteria, what changed, what the design should look like, known risks, user personas.

**If no context provided:** That's fine -- run in blind exploration mode. The agent discovers everything on its own.

**When context IS available, extract and use:**

| Context Element | How It Changes the Session |
|----------------|---------------------------|
| **Acceptance criteria** | Add as explicit checkpoints -- verify each AC during testing |
| **What changed** (MR diff, commits) | Focus testing on changed areas -- highest regression risk |
| **Design specs** (Figma, mockups) | Compare live app against intended design -- spot deviations |
| **User stories / requirements** | Test against INTENT, not just what's visible |
| **Known risks** (from risk analysis) | Prioritize testing on flagged risk areas |
| **API contracts** (OpenAPI, endpoints) | Verify UI matches API behavior |
| **Previous test results** | Don't re-test what passed -- focus on gaps |

**Context makes exploration sharper but NEVER blocks it.** A QA walking up to a random app with zero documentation should still get a full, valuable session. Context is a boost, not a gate.

When context is loaded, note in the charter:
```
CONTEXT SOURCE: [filename or "inline" or "none -- blind exploration"]
ACCEPTANCE CRITERIA: [list extracted ACs or "none provided -- discovering from app"]
CHANGE SCOPE: [what changed or "unknown -- full exploration"]
```

## Step 3: Load Knowledge

Read `data/knowledge/manifest.yml`. Load:
1. Core heuristics (SFDIPOT, FEW HICCUPPS, Test Tours)
2. Domain-specific entries
3. `data/knowledge/learned-patterns.md` -- false-positive skip list + must-check patterns
4. Business logic & race condition techniques (if app has transactions/state changes)

Keep brief summaries only -- don't fill context with full entries.

## Step 4: Create Session Directory

Create `output/sessions/<YYYY-MM-DD-HHmm-target>/` with: `charter.md`, `session-log.md`, `screenshots/`, `bugs/`

## Step 5: Initialize Progress Tracking

Write `output/sessions/<session-dir>/progress.json`:
```json
{
  "session_id": "<session-dir>",
  "target": "<target_url>",
  "domain": "<domain>",
  "started_at": "<ISO timestamp>",
  "status": "in_progress",
  "current_phase": "setup",
  "phases": {
    "setup": { "status": "complete", "timestamp": "<now>" },
    "auth": { "status": "pending" },
    "charter": { "status": "pending" },
    "discovery": { "status": "pending" },
    "journeys": { "status": "pending" },
    "features": { "status": "pending" },
    "edge_cases": { "status": "pending" },
    "reporting": { "status": "pending" }
  },
  "bugs_found": 0,
  "pages_explored": 0,
  "screenshots_taken": 0,
  "console_errors": 0
}
```

Append to `session-log.md`:
```
[<timestamp>] [PHASE] Setup complete — session initialized
```

## Step 6: Optional — Bootstrap Playwright Test Agents (opt-in)

**Skip this step entirely if `@playwright/test` is not installed as a peer dep OR `playwright.config.*` is not present.** This is an additive capability for consumers who want to pair an exploratory session with the Playwright Test Agents framework (planner / generator / healer, Playwright 1.56+).

If both prerequisites are present AND the user has opted in (via target config or inline context), you MAY offer to scaffold the agent workspace:

```bash
npx playwright init-agents --loop=claude
```

This generates agent definition files that later phases can hand off to — most usefully in phase 5 (features), where a reproducible bug can be converted into a regression test by the generator agent. See `references/playwright-agents-integration.md` for the full workflow.

**Never block the session on this step.** If the user declines, if the prerequisites are missing, or if the command fails, log a note in `session-log.md` and continue to Phase 1 normally.

**IMPORTANT: After EVERY phase completion, update progress.json and append to session-log.md.** This is how the user monitors session progress. Use this pattern at the end of each phase:

```
# Update progress.json — set current phase complete, next phase as current
# Append to session-log.md:
[<timestamp>] [PHASE] <phase_name> complete — <pages> pages, <bugs> bugs, <key finding summary>
```
