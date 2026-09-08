# Phase 0: Session Setup (2 min)

## Step 1: Parse Input & Resolve Target

Extract from the user message:
- **target_url**: the URL to test (required unless `--target` is given)
- **--target <id>**: a saved target config (optional)
- **--context <file>** or inline context text (optional)
- **--focus <area>**: a specific area or feature (optional)
- **--session <dir>**: an existing pre-flight directory created by `qualiow explore` (optional)
- **domain**: domain type (optional; auto-detect from the app if not given)
- **time_box**: 45 min (default and maximum)

Resolve the target config, the data directory (`<data>`) and the credentials file in the
order defined in `${CLAUDE_SKILL_DIR}/references/paths.md`: `--target` → `data/targets/<id>.yml`
in the project, else the plugin's copy; no `--target` → `qa/target.yml` in the project, else
`_default.yml`; credentials from `qa/.env`, else `.env`. Then read
`<data>/domains/<domain>.yml` for the domain's completeness checklist, data-integrity checks
and journeys.

Apply the **production rule** from `${CLAUDE_SKILL_DIR}/references/security-rules.md` to the
resolved hostname now. If it fires, log `[SAFETY] Production detected -- running in read-only mode`
and carry read-only mode through every later phase.

## Step 2: Load Context (if provided)

**If `--context <file>` provided:** read the file. It may be a `/qa-gather` context file
(structured markdown with ticket data, specs, MR diffs, design notes) or any document
describing what to test.

**If inline context provided:** extract from the user's message any descriptions of: what
the feature does, acceptance criteria, what changed, what the design should look like,
known risks, user personas.

**If no context provided:** that's fine; run in blind exploration mode.

**When context IS available, extract and use:**

| Context Element | How It Changes the Session |
|----------------|---------------------------|
| **Acceptance criteria** | Add as explicit checkpoints; verify each AC during testing |
| **What changed** (MR diff, commits) | Focus testing on changed areas; highest regression risk |
| **Design specs** (Figma, mockups) | Compare the live app against the intended design |
| **User stories / requirements** | Test against INTENT, not just what's visible |
| **Known risks** | Prioritize testing on flagged risk areas |
| **API contracts** (OpenAPI, endpoints) | Verify the UI matches API behaviour |
| **Previous test results** | Don't re-test what passed; focus on gaps |

**Context makes exploration sharper but NEVER blocks it.** A QA walking up to a random app
with zero documentation should still get a full, valuable session.

When context is loaded, note in the charter:
```
CONTEXT SOURCE: [filename or "inline" or "none -- blind exploration"]
ACCEPTANCE CRITERIA: [list extracted ACs or "none provided -- discovering from app"]
CHANGE SCOPE: [what changed or "unknown -- full exploration"]
```

## Step 3: Load Knowledge

Read `<data>/knowledge/manifest.yml`. Load:
1. Core heuristics (SFDIPOT, FEW HICCUPPS, Test Tours)
2. Domain-specific entries from `loading_strategy.by_domain`
3. `<data>/knowledge/learned-patterns.md`: the false-positive skip list and must-check patterns
4. Business-logic and race-condition techniques (if the app has transactions or state changes)

Keep brief summaries only; don't fill context with full entries.

## Step 4: Create the Session Directory

Unless `--session <dir>` was given, create
`output/sessions/<YYYY-MM-DD-HHmm>-explore-<slug>/` (scheme in `paths.md`; `<slug>` is the
target id without a leading `_`, or the hostname with dots replaced by dashes) containing
`screenshots/`, `bugs/`, `videos/`, and an empty `session-log.md`. With `--session`, reuse
that directory and append to its `session-log.md`.

Choose the playwright-cli session id `-s=explore-<HHmm>-<slug>`. **Every `playwright-cli`
call in this session carries `-s=<sid>`; the examples in the phase files omit the prefix.**

## Step 5: Initialize Progress Tracking

Write `output/sessions/<session-dir>/progress.json`:
```json
{
  "session_id": "<session-dir>",
  "kind": "explore",
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
[<timestamp>] [PHASE] Setup complete — session <session-dir>, sid <sid>, read_only: <true|false>
```

## Step 6: Optional — Bootstrap Playwright Test Agents (opt-in)

**Skip this step entirely if `@playwright/test` is not installed in the consumer project OR
no `playwright.config.*` is present.** This is an additive capability for teams that want to
turn reproducible findings into regression tests with the Playwright Test Agents framework
(planner / generator / healer, Playwright 1.56+).

If both prerequisites are present AND the user has opted in (via the target config or the
context), you MAY offer to scaffold the agent workspace:

```bash
npx playwright init-agents --loop=claude
```

With `--loop=claude` this writes the three agent definitions into `.claude/agents/`, a
`.mcp.json` registering the `playwright-test` server, and a `specs/` scaffold with a seed
spec if the project has none; other loops: `codex`, `copilot`, `opencode`, `vscode`,
`vscode-legacy`. It does not touch `playwright.config.*`. See
`${CLAUDE_SKILL_DIR}/references/playwright-agents-integration.md` for the hand-off after the
session.

**Never block the session on this step.** If the user declines, the prerequisites are
missing, or the command fails, log a note in `session-log.md` and continue.

**IMPORTANT: After EVERY phase completion, update `progress.json` and append to
`session-log.md`.** This is how the user monitors progress:

```
[<timestamp>] [PHASE] <phase_name> complete — <pages> pages, <bugs> bugs, <key finding summary>
```
