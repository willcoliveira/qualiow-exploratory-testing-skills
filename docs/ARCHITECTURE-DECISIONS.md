# Architecture Decision Review

Every major design choice evaluated with trade-offs, real-world evidence from our POC sessions, and recommendations for whether to keep, change, or revisit.

*Internal document — repo only, not shipped in the npm package.*

## Status as of 2026-09-13 (2.1.0)

Records 001–010 were written during the 2026-03 POC; 012 was written for this release. This
table is the current reading of each one; where the two disagree, this table wins.

| ADR | Decision | Status (2026-09-13) | Note |
|-----|----------|---------------------|------|
| 001 | Playwright CLI as the browser driver | **Keep** | Still the right trade-off. The MCP/Chrome-MCP fallback chain was never built and is not planned |
| 002 | Skills-only, no custom MCP server | **Keep** | No MCP server, and none planned: the complement the record sketches turned out to be the `qualiow` CLI. From 2.1.0 a session's knowledge load is a `qualiow kb digest` call, not an MCP tool |
| 003 | YAML knowledge base | **Keep** | 29 entries across v0.1.0–v0.6.0 — still well under the ~50-entry point where an index would earn its place |
| 004 | Prompt-driven, no runtime code | **Revisit** | Largely overtaken. 2.1.0 gives the deterministic layer the work with a fixed contract: knowledge loading (`kb digest`), the index rows and the metrics line, strict `stats.json` validation, the redaction check and session cleanup (`session …`). Session orchestration and every judgement are still prompt-driven, which is the hybrid the record proposes |
| 005 | Standalone project, not a monorepo package | **Keep** | The `tool-qa-workflow` bridge named in the record does not exist and has been dropped from the skills |
| 006 | File-based output plus a structured log | **Done** | `output/metrics.jsonl` is written by `qualiow report` via `appendSessionMetricsDeduped`, one deduplicated line per session. The dashboard the record sketches was not built |
| 007 | Storage state plus adaptive login | **Keep** | The freshness check is implemented as guidance in the auth phase, not as code |
| 008 | Domain configs as markdown → YAML | **Done in 2.0.0** | The `.md` domain files are removed; `data/domains/*.yml` is the only format, `DomainConfigSchema` matches the shipped files, and `qualiow validate --all` covers them |
| 009 | Single monolithic agent per session | **Revisit** | Phases hand off through files, which is most of the benefit, but sessions still run in one context. Blocked on the same question as `KNOWN-ISSUES.md` ISSUE-001 |
| 010 | Snapshot-first page analysis | **Revisit** | Snapshot is still primary and correct. Selective vision for visual bugs remains unimplemented and unbudgeted |
| 012 | Marketplace distribution and the `bin/qualiow` launcher | **Done in 2.1.0** | `.claude-plugin/marketplace.json` (`source: "./"`) makes the repository its own marketplace; the shim runs a local build when there is one and otherwise `npx`-fetches the published package at the version `plugin.json` names. Record below |

---

## ADR-001: Browser Control — Playwright CLI vs MCP vs Chrome MCP vs Framework

### Decision Made
**Playwright CLI** (`@playwright/cli`) as primary, with MCP/Chrome MCP as optional fallback.

### Alternatives Considered

| Option | How it works | Token cost | Capability | Setup |
|--------|-------------|-----------|------------|-------|
| **Playwright CLI** (chosen) | Bash commands: `playwright-cli click e3` | LOW — short commands, snapshots on demand | 50+ commands, sessions, storage state, tracing, video | `npm install @playwright/cli` |
| **Playwright MCP** | MCP tools: `browser_navigate`, `browser_click` | MEDIUM — tool schemas loaded into context | ~20 tools, snapshot, screenshot, console, network | MCP server config in settings.json |
| **Chrome MCP** | Chrome extension: `navigate`, `read_page` | MEDIUM — tool schemas in context | Limited — no tracing, no video, no sessions, needs Chrome running | Browser extension install |
| **Playwright Framework** | Write .ts scripts, run via `npx playwright test` | HIGH — full scripts in context | FULL API — assertions, fixtures, parallel, retries, reporters | Framework project setup |
| **No browser tool** | AI reasons about screenshots only | LOWEST | Very limited — can't interact, only observe | Just screenshot upload |

### Evidence from POC

| Metric | Playwright CLI (actual) |
|--------|------------------------|
| Tool calls per session | 130-200 |
| Tokens per session | ~100K |
| Bugs found | 10-15 per session |
| Commands used | snapshot, click, fill, goto, console, network, screenshot, press, resize, route, state-save/load, close, delete-data |
| Commands NOT used | drag, dblclick, hover, select, upload, eval, tab-new, video-start, tracing-start (agent used tracing but it didn't produce visible output) |

### Trade-off Analysis

**Playwright CLI wins on:**
- Token efficiency (commands are 5-10 tokens vs MCP tool schemas at 50-100 tokens)
- Breadth of commands (50+ vs MCP's ~20)
- Session management (`-s=<name>` for isolation)
- Storage state (native `state-save/load` for auth)
- No MCP server overhead (just a binary)
- Snapshot-based element refs (no fragile CSS selectors)

**Playwright CLI loses on:**
- No programmatic assertions (can't `expect(page).toHaveTitle()`)
- Can't chain commands atomically (each is a separate Bash call)
- No native wait strategies (must poll with snapshot)
- No parallel execution within a session
- Snapshot output can be verbose for complex pages
- Element refs change when page re-renders (stale refs risk)

**Playwright MCP would win on:**
- Direct tool integration (no Bash intermediary)
- Richer snapshot with vision mode (`--caps vision`)
- Built-in save-trace and save-video that actually integrate with output
- Codegen support for generating test code

**Chrome MCP would win on:**
- Testing the ACTUAL browser users use (Chrome, not headless Chromium)
- Access to Chrome DevTools features
- Can test extensions, service workers
- Works with already-open browser (user can watch in real time)

### Recommendation

**KEEP Playwright CLI as primary.** It's the best balance of token efficiency + capability for our use case.

**ADD Playwright MCP as secondary** — specifically for:
- Vision mode (screenshot analysis for visual bugs)
- Trace/video capture (MCP handles this better)
- Codegen (generate reproducible test scripts from session)

**ADD Chrome MCP as user-facing option** — for:
- Users who want to watch the agent test in their browser
- Testing Chrome-specific features
- Environments where headless is restricted

**Architecture:**
```
/qa-explore skill
├── Detects available browser tools at session start
├── Prefers: Playwright CLI (if installed)
├── Falls back: Playwright MCP (if configured in settings)
├── Falls back: Chrome MCP (if extension connected)
└── Adapts commands to available tool
```

**Status: KEEP, but add fallback chain**

---

## ADR-002: Skills-Only vs Custom MCP Server

### Decision Made
**Skills-only** — all QA intelligence lives in skill prompts (SKILL.md files). No custom MCP server with QA-specific tools.

### Alternatives

| Option | Architecture | Development cost | Flexibility | Token cost |
|--------|-------------|------------------|-------------|-----------|
| **Skills-only** (chosen) | Markdown prompts, Claude reasons from instructions | Low — write markdown | High — change prompt, change behavior | Higher — instructions in every session |
| **Custom MCP server** | TypeScript server with tools like `qa_explore_page`, `qa_test_form`, `qa_check_accessibility` | High — build, test, maintain server | Medium — need code changes for new behavior | Lower — tool does work, returns structured result |
| **Hybrid** | Skills for orchestration + MCP for heavy processing | Medium | Highest | Balanced |

### Evidence from POC

The agent spent significant tokens on:
1. **Analyzing snapshots** — reading element trees and deciding what to test (~30% of token usage)
2. **Formatting bug reports** — converting observations to structured markdown (~15%)
3. **Data integrity math** — verifying calculations manually (~10%)

A custom MCP tool could handle these more efficiently:
- `qa_analyze_snapshot` → takes raw snapshot, returns: "3 forms, 12 links, 5 buttons, suggested tests: [...]"
- `qa_verify_math` → takes expression + expected, returns MATCH/MISMATCH
- `qa_format_bug` → takes structured input, returns formatted bug report

### Trade-off Analysis

**Skills-only wins on:**
- Zero infrastructure — works anywhere Claude Code runs
- Instant iteration — edit markdown, behavior changes immediately
- No build/deploy cycle
- Easier for users to customize (edit SKILL.md vs forking a server)
- No version compatibility issues between MCP server and Claude Code

**Skills-only loses on:**
- Token cost — the same instructions are loaded every session
- No pre-processing — every snapshot analysis is done by the LLM (expensive)
- No persistent state — session state is file-based, not in-memory
- No background processing — can't do work between tool calls
- Can't do complex computation (math verification, diff analysis) efficiently

**Custom MCP would win on:**
- Structured tool outputs (less hallucination risk)
- Pre-processing heavy data (snapshot analysis, math, diffing)
- Persistent session state in memory
- Background tasks (monitoring, polling)
- Smaller context — tool descriptions are compact vs full skill instructions

### Recommendation

**KEEP skills-only for now.** The iteration speed is worth the token cost at this stage.

**Plan MCP server for v2** when we hit these triggers:
- Token cost per session exceeds acceptable threshold
- Snapshot analysis becomes a bottleneck (complex pages with 200+ elements)
- We need persistent session state across sub-agents
- We need CI/CD integration (MCP server can run headless)

**When we build the MCP, make it a COMPLEMENT, not a replacement:**
```
Skills (orchestration, reasoning, decisions)
    ↓ calls
MCP Server (heavy processing, state management, structured outputs)
    ↓ calls
Playwright CLI (browser control)
```

**Status: KEEP for now, planned MCP for v2**

---

## ADR-003: Knowledge Base — YAML Files vs Database vs API

### Decision Made
**YAML files** in `data/knowledge/releases/` with a manifest index.

### Alternatives

| Option | Storage | Query | Versioning | Sharing |
|--------|---------|-------|-----------|---------|
| **YAML files** (chosen) | Local files in repo | Read file by name | Git + release dirs | Copy files / git |
| **SQLite database** | .db file | SQL queries, full-text search | Migrations | Copy file |
| **Vector database** (HNSW) | Embeddings file | Semantic similarity search | Append-only | Export/import |
| **Remote API** | Cloud hosted | REST/GraphQL | Server-managed | API access |

### Evidence from POC

Knowledge loading in sessions:
- Manifest read: 1 file read
- Entry loading: 4-6 file reads per session (always-load + domain-specific)
- Total tokens for knowledge: ~2K-3K per session (manageable)
- Agent successfully used heuristics from YAML to guide testing

### Trade-off Analysis

**YAML wins on:**
- Human-readable and editable (QA engineers can edit without tools)
- Git-versioned (full history, branching, PRs for knowledge changes)
- No infrastructure needed
- Easy to share (copy directory)
- Works offline
- Reviewable — someone can PR a new heuristic and team can review it

**YAML loses on:**
- No semantic search ("find knowledge related to authentication" requires reading all entries)
- No cross-referencing (can't query "which heuristics mention forms?")
- Scales poorly past ~100 entries (too many files to scan)
- No deduplication detection
- Loading strategy is manual (manifest must be maintained by hand)

**Vector DB would win on:**
- "Load the 5 most relevant entries for THIS app" — semantic matching
- Automatic relevance ranking
- Scales to thousands of entries
- Cross-reference and similarity detection

### Recommendation

**KEEP YAML for now.** 13 entries is well within the sweet spot. Human editability and git versioning are more valuable than semantic search at this scale.

**Consider hybrid at 50+ entries:**
- Keep YAML as source of truth (human-editable, git-versioned)
- Build an index (SQLite FTS or HNSW embeddings) at `qualiow init` time
- Query the index at session start to find relevant entries
- Read the original YAML for full content

**Status: KEEP, plan index at 50+ entries**

---

## ADR-004: Prompt-Driven vs Code-Driven Architecture

### Decision Made
**100% prompt-driven** — no TypeScript runtime code. Everything is markdown skill prompts executed by Claude Code.

### Alternatives

| Option | Where logic lives | Testability | Reliability | Flexibility |
|--------|------------------|-------------|-------------|------------|
| **Prompt-driven** (chosen) | SKILL.md markdown | Hard to unit test | Depends on LLM interpretation | Very high — change prompt, change behavior |
| **Code-driven** | TypeScript + NestJS (like tool-qa-workflow) | Unit testable | Deterministic | Medium — need code changes |
| **Hybrid** | TypeScript orchestrator + LLM for decisions | Partially testable | Mixed | High — code for structure, LLM for judgment |

### Evidence from POC

- Skills worked reliably across 4 sessions
- Agents followed instructions ~90% correctly
- Main failures: inconsistent phase naming, sometimes skipping steps, occasional over-testing of low-priority areas
- No way to unit test or regression test the skills themselves

### Trade-off Analysis

**Prompt-driven wins on:**
- Speed of iteration (edit markdown, done)
- No build/compile cycle
- Adaptability (LLM reasons about edge cases we didn't anticipate)
- Low barrier to contribution (QA engineers can improve skills without coding)
- Natural language is the most expressive "programming language" for testing logic

**Prompt-driven loses on:**
- Non-deterministic — same input can produce different outputs
- Can't unit test — no `expect(skill).toFindBug("XSS")`
- Hard to debug — when a session goes wrong, why?
- Token cost — instructions re-loaded every session
- Reliability — LLM might skip steps or misinterpret instructions
- No type safety — if YAML format changes, skills won't catch it at compile time

**Hybrid would give us:**
- TypeScript for: session orchestration, file I/O, validation, formatting
- LLM for: testing decisions, heuristic application, bug assessment, reasoning
- Best of both: deterministic structure + intelligent decisions

### Recommendation

**MOVE to hybrid for v2.** Keep the LLM for what it's best at (reasoning, judgment, exploration decisions) but add code for what needs to be reliable:

```
TypeScript (deterministic):
├── Session setup (create dirs, load configs, validate)
├── Knowledge loading (read manifest, resolve entries)
├── Output formatting (bug reports, session reports)
├── Credential redaction (regex scanning)
├── Session state tracking (pages visited, bugs found)
├── Data integrity math (price × qty = total)
└── Report generation (HTML, JSON, Jira CSV)

LLM via Skills (reasoning):
├── Business context analysis
├── Risk ranking decisions
├── Test idea generation
├── Bug identification and assessment
├── Heuristic application
├── Exploratory navigation decisions
└── Cross-feature reasoning
```

**Status: REVISIT — move to hybrid for v2**

---

## ADR-005: Standalone Project vs Monorepo Workspace

### Decision Made
**Standalone npm project**, independent of the existing `ts-qa-automation-framework` monorepo.

### Trade-off Analysis

**Standalone wins on:**
- Clean start, no legacy constraints
- Simple setup (`npm install`, done)
- Easy to share/distribute independently
- No Yarn Berry, Nx, workspace complexity
- Can evolve at its own pace

**Standalone loses on:**
- Can't reuse qa-framework Cucumber steps, browser service, API clients
- Duplicates some knowledge (heuristics exist in both projects)
- No shared type definitions
- Separate CI/CD pipeline needed

### Recommendation

**KEEP standalone.** The project has a different audience (Claude Code users) and different architecture (prompt-driven) than the monorepo (code-driven). Merging them would add complexity for both.

**Bridge via:** `/qa-gather` can read `tool-qa-workflow` output files. That's the integration point.

**Status: KEEP**

---

## ADR-006: File-Based Output vs Database

### Decision Made
**Markdown files** in `output/sessions/` with an INDEX.md.

### Evidence from POC

- 4 sessions produced 90+ output files (reports, bugs, screenshots)
- INDEX.md works for small numbers but doesn't scale
- No way to query "all critical bugs across all sessions"
- No aggregate metrics possible

### Recommendation

**KEEP files as primary output** (human-readable, git-friendly, shareable).

**ADD a structured log** alongside:
```
output/
├── sessions/           # Markdown files (current — KEEP)
├── metrics.jsonl       # Append-only structured log (NEW)
└── dashboard.html      # Auto-generated from metrics.jsonl (NEW)
```

`metrics.jsonl` gets one line per session:
```json
{"session":"2026-03-28-r2-parabank","target":"parabank","date":"2026-03-28","bugs":10,"critical":2,"high":7,"medium":1,"duration_min":35,"tool_calls":130,"tokens":99000}
```

This enables aggregate queries, trend charts, and a quality dashboard without replacing the human-readable markdown.

**Status: KEEP files + ADD structured log**

---

## ADR-007: Auth Handling — Storage State vs Login Flows

### Decision Made
**Playwright CLI `state-save/state-load`** as primary, with adaptive login (snapshot → fill → click) as fallback.

### Evidence from POC

- ParaBank: Registered new account each session (no state reuse)
- Sauce Demo: Credentials on page, typed directly each time
- Neither session reused saved state

### Trade-off Analysis

**Storage state wins on:**
- Fastest — one command, already authenticated
- Handles complex auth (OAuth, SSO) after manual first login
- Persistent across sessions

**Storage state loses on:**
- State expires (tokens timeout)
- State is target-specific (can't share between environments)
- Security concern (stored cookies/tokens on disk)
- Must re-create when auth flow changes

**Adaptive login wins on:**
- Always works (snapshot discovers the form dynamically)
- No stale state risk
- More realistic (tests the actual login flow)

### Recommendation

**KEEP both, prefer adaptive login for testing, storage state for speed.**

New strategy:
```
1. Check if state file exists and is <4h old → state-load (fast)
2. If state file missing or stale → adaptive login (snapshot → fill → click)
3. After successful login → state-save (cache for next time)
4. If login fails → screenshot + ask user
```

**Status: KEEP, add freshness check**

---

## ADR-008: Domain Configs — Markdown vs YAML

### Decision Made
**Markdown files** in `data/domains/` for domain-specific testing guidance.

### Trade-off Analysis

Markdown is readable but not machine-parseable. The domain configs now contain structured data (risk rankings, completeness checklists, integrity checks) that would benefit from YAML structure.

### Recommendation

**MIGRATE to YAML with embedded markdown content:**

```yaml
# data/domains/ecommerce.yml
id: ecommerce
name: "E-commerce"

risk_ranking:
  p0: [checkout, payment, cart, pricing]
  p1: [catalog, search, auth]
  p2: [reviews, wishlist, filters]
  p3: [about, contact, social]

completeness_checklist:
  - "Cart with quantity controls"
  - "Delivery address field"
  - "Payment method selector"
  - "Unique order confirmation ID"
  - "Order history page"
  - "Empty cart message"

data_integrity_checks:
  - "price × quantity = line total"
  - "sum(line totals) + tax = order total"
  - "inventory decremented after purchase"

journeys:
  - name: "Browse to Purchase"
    steps: ["Browse catalog", "Add to cart", "Checkout", "Confirm", "Verify in history"]
  - name: "Search to Purchase"
    steps: ["Search product", "Filter results", "View detail", "Add to cart", "Checkout"]

guidance: |
  ## E-commerce Testing Focus
  ... (free-form markdown for the LLM to read)
```

This gives us machine-parseable structure (for validators, CLI tools) AND human-readable guidance (for the LLM).

**Status: REVISIT — migrate to YAML for v2**

---

## ADR-009: Single Monolithic Agent vs Sub-Agent Architecture

### Decision Made
**Single monolithic agent** per session — one agent does all phases.

### Evidence from POC

- Sessions used 100K+ tokens each
- Context got compressed during long sessions
- Phase handoff via files worked but was fragile
- Agent sometimes "forgot" earlier findings

### Trade-off Analysis

**Monolithic wins on:**
- Simple — one agent, one context, no coordination
- Agent has full session context (knows what it already tested)
- No overhead of spawning/coordinating sub-agents

**Monolithic loses on:**
- Context overflow on complex apps
- Can't parallelize (discovery + security testing could run simultaneously)
- If agent gets confused mid-session, entire session is affected
- Token cost — carries full instructions even for simple phases

**Sub-agents would win on:**
- Each agent gets lean, focused context
- Can parallelize independent phases
- Failures are isolated (one agent fails, others continue)
- Specialized agents can have specialized knowledge loaded

### Recommendation

**MOVE to sub-agents for v2** with this architecture:

```
Orchestrator Agent (lightweight — ~10K tokens)
├── Reads charter, manages session state file
├── Spawns: discovery-agent (returns site map)
├── Spawns: journey-agent (per journey — returns pass/fail + data integrity)
├── Spawns: edge-case-agent (returns bugs)
├── Spawns: reporting-agent (reads all phase files, writes report)
└── Merges results, updates indexes

Each sub-agent:
- Gets ONLY its phase instructions + relevant knowledge
- Reads from session state file (what's already been tested)
- Writes phase output to disk
- Returns summary to orchestrator
```

**Status: REVISIT — move to sub-agents for v2**

---

## ADR-010: Snapshot-First vs Vision-First Page Analysis

### Decision Made
**Snapshot-first** — use `playwright-cli snapshot` (accessibility tree text) as primary page analysis, screenshots only for bug evidence.

### Trade-off Analysis

**Snapshot wins on:**
- Token-efficient (text, not images)
- Structured (element refs for precise interaction)
- Machine-readable (can parse forms, links, buttons)
- Accessibility-aware (IS the accessibility tree)

**Snapshot loses on:**
- Can't see visual bugs (misalignment, wrong colors, overlapping elements)
- Can't see layout issues (responsive breaks, z-index problems)
- Missing visual context (what the page actually LOOKS like)
- Blind to images, icons, visual indicators

**Vision (screenshot analysis) would win on:**
- Visual bug detection (layout, design, color, spacing)
- Closer to how a human tester sees the page
- Can compare against design mockups
- Catches CSS-only bugs invisible in the DOM

### Recommendation

**KEEP snapshot as primary for interaction** (token-efficient, precise refs).
**ADD vision for visual audit** — take a screenshot at key points and analyze:

```
Phase 2 (Discovery): snapshot for structure + screenshot for visual impression
Phase 4 (Features): snapshot for interaction + screenshot ONLY when visual bug suspected
Phase 5 (Edge cases): screenshot for responsive testing (mobile viewport)
```

This requires Playwright MCP with `--caps vision` or the agent reading screenshots via the Read tool.

**Status: KEEP snapshot primary + ADD selective vision**

---

*ADR-011 is reserved for the model-routing record that lands with 2.2.0 (cheap-model
sub-agents for the I/O-heavy reads, plus the hooks that enforce the read thresholds).*

## ADR-012: Marketplace Distribution and the `bin/qualiow` Launcher

*Written 2026-09-13 for 2.1.0, not during the POC.*

### Context

2.0.0 shipped `.claude-plugin/plugin.json`, so the skills could be loaded with
`claude --plugin-dir <repo>`. That leaves the install as "clone this, then point Claude Code
at it", and it leaves the CLI unreachable: a plugin installed straight from git has no
`dist/` (it is build output, never committed) and no `node_modules` (tsup does not bundle
dependencies), so `dist/cli/index.js` — the `bin` entry `package.json` declares — cannot run
in place. From 2.1.0 the skills call `qualiow` for the knowledge digest and for finalizing a
session, so "the CLI is not there" stops being cosmetic.

### Decision Made

**The repository is its own marketplace, and `bin/qualiow` is a launcher shim.**

- `.claude-plugin/marketplace.json` declares one plugin whose `source` is `"./"` — correct for
  a repo that is both the marketplace and the plugin it lists. Install:

  ```bash
  claude plugin marketplace add willcoliveira/qualiow-exploratory-testing-skills
  claude plugin install qualiow@qualiow
  ```

  `--plugin-dir` remains the development path.
- `bin/qualiow` resolves its own directory (following symlinks) and, if `dist/cli/index.js`
  and `node_modules` are both present, execs the local build. Otherwise it exports
  `CLAUDE_PLUGIN_ROOT` (so the CLI still finds the plugin's `data/`), reads the version from
  `.claude-plugin/plugin.json`, and execs
  `npx -y -p qualiow-exploratory-testing@<version> qualiow …`, falling back to `@latest` if
  the pinned fetch fails. `package.json` `bin.qualiow` still points at `dist/cli/index.js`, so
  an npm install is unaffected.

### Alternatives

| Option | Why not |
|--------|---------|
| Commit `dist/` | Build output in git, a diff on every release, and it still needs `node_modules` for the runtime dependencies |
| Bundle every dependency with tsup | A much larger artefact to keep correct, for one entry point that npm already publishes |
| Tell plugin users to `npm install -g` as well | Two installs to keep in step, and the skills would have to branch on which one is present |
| A separate marketplace repository | A second repo to version and release in lockstep, for one plugin |

### Consequences

- **Release order matters.** The shim pins the npm version to whatever
  `.claude-plugin/plugin.json` says, so `npm publish` must land **before** the tag is pushed
  and the GitHub release is cut. A tag that arrives first gives plugin installs a pinned fetch
  that 404s, and they fall back to `@latest` — the previous release.
- **The install copies the whole repository**, `src/`, `tests/` and the POC target configs
  included, because `source: "./"` has no file filter. Nothing private travels with it:
  `data/targets/local-*.yml`, `.auth/`, `.env` and `qa/.env` are gitignored, so what ships is
  exactly what is on `main`. Moving the POC targets under `data/targets/poc/` to slim the copy
  is a follow-up, not a blocker.
- **`npx qualiow` was always wrong and is now fixed.** The published package is
  `qualiow-exploratory-testing`; `qualiow` is only the bin name. A bare `npx qualiow` in a
  project that does not have the package installed resolves to a different package or to
  nothing. Skills write `qualiow …` with the resolution order from
  `qa-explore/references/paths.md`, or the explicit
  `npx -y -p qualiow-exploratory-testing@<version> qualiow …`.
- **CI validates both manifests non-strict.** `claude plugin validate . --strict` warns about
  the root `CLAUDE.md` (verified on Claude Code 2.1.269), which is a repository file and not a
  plugin defect, so the workflow runs `claude plugin validate .` and
  `claude plugin validate .claude-plugin/marketplace.json` without `--strict`.
- **A plugin-distributed agent cannot declare `permissionMode`** (`KNOWN-ISSUES.md` ISSUE-001),
  so no agent this repository ships declares one — including the ones 2.2.0 adds. Permission
  behaviour is the user's settings, not ours.
- `scripts/sync-version.mjs` now writes `plugins[0].version` in `marketplace.json` alongside
  `plugin.json`, and `scripts/check-pack.mjs` asserts `bin/qualiow` is in the tarball.

**Status: DONE in 2.1.0**

---

## Decision Summary

*As recorded in 2026-03. See the dated status table at the top of this document for where each
one stands today.*

| ADR | Decision | Status | Action |
|-----|----------|--------|--------|
| 001 | Playwright CLI primary | **KEEP** | Add MCP + Chrome MCP fallback chain |
| 002 | Skills-only, no MCP server | **KEEP for now** | Plan MCP server for v2 |
| 003 | YAML knowledge base | **KEEP** | Plan search index at 50+ entries |
| 004 | Prompt-driven, no code | **REVISIT** | Move to hybrid (code + LLM) for v2 |
| 005 | Standalone project | **KEEP** | Bridge via /qa-gather reading tool-qa-workflow output |
| 006 | File-based output | **KEEP** | Add metrics.jsonl for aggregate data |
| 007 | Storage state + adaptive login | **KEEP** | Add freshness check (4h expiry) |
| 008 | Domain configs as markdown | **REVISIT** | Migrate to YAML with embedded markdown |
| 009 | Single monolithic agent | **REVISIT** | Move to sub-agent architecture for v2 |
| 010 | Snapshot-first analysis | **KEEP** | Add selective vision for visual bugs |

### v1 Architecture (current — works, ship it)
```
Claude Code → Skills (markdown) → Playwright CLI → Browser
                ↓
           YAML Knowledge + Domain Configs
                ↓
           File-based Output (markdown)
```

### v2 Architecture (planned — production-grade)
```
CLI/CI → TypeScript Orchestrator → Sub-Agents (skills)
              ↓                         ↓
         MCP Server ←──────→ Playwright CLI / MCP / Chrome
              ↓
         YAML + Index (knowledge)
              ↓
         Files + JSONL + HTML (output)
              ↓
         Jira / GitHub / Slack (integrations)
```
