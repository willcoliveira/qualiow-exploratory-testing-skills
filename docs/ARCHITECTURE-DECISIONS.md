# Architecture Decision Review

Every major design choice evaluated with trade-offs, real-world evidence from our POC sessions, and recommendations for whether to keep, change, or revisit.

*Internal document — repo only, not shipped in the npm package.*

## Status as of 2026-09-13 (2.2.0)

Records 001–010 were written during the 2026-03 POC; 012 was written for 2.1.0 and 011 for
2.2.0. This table is the current reading of each one; where the two disagree, this table wins.

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
| 009 | Single monolithic agent per session | **Partially done in 2.2.0** | Reporting, gather, page-mapper and diff-indexer are sub-agents; the session orchestrator remains blocked on `KNOWN-ISSUES.md` ISSUE-001 |
| 010 | Snapshot-first page analysis | **Revisit** | Snapshot is still primary and correct. Selective vision for visual bugs remains unimplemented and unbudgeted |
| 011 | Model routing: CLI first, cheap sub-agents second, the session model for reasoning | **Done in 2.2.0** | Four sub-agents (`qa-gather-agent`, `qa-reporting-agent`, `qa-diff-indexer-agent`, `qa-page-mapper-agent`) take the bounded reads and the report assembly; two `PreToolUse` hooks enforce the thresholds on qualiow-owned paths only. Record below |
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

## ADR-011: Model Routing — deterministic CLI first, cheap sub-agents second, the session model for reasoning

*Written 2026-09-13 for 2.2.0, not during the POC.*

### Context

The prompt for this work was a published routing plugin built on a hosted worker model: it
pushes bulk reads and boilerplate generation off the main model through hooks that block
expensive reads, scripts that call a cheaper worker, and instructions that tell the assistant
when to use them. The question was whether the same shape fits an exploratory-testing pack
whose entire value is the reasoning it does — and the answer is that it fits the *input and
output*, not the thinking.

An inventory of the canonical skills found the bulk work sitting in six places:

| Sink | What the session read or wrote |
|------|-------------------------------|
| The session-start knowledge load | `data/knowledge/manifest.yml`, the always-load entries, `learned-patterns.md` and a domain profile, all read whole |
| Snapshots | full accessibility trees, re-taken before every interaction, with no size policy. ADR-002's POC evidence already put snapshot analysis at the top of its token list |
| Reporting | `session-report.md`, `stats.json`, the INDEX row and the `all-bugs.md` rows hand-written against a fixed contract restated in six skill files |
| `/qa-explore-report`, `/qa-knowledge-list`, `/qa-explore-cleanup` | whole sessions and the whole manifest re-read only to reformat or list them |
| The backend static lane and the probe catalogues | an unbounded `git show` of the branch, and two reference catalogues read from top to bottom for one resource type |
| `/qa-gather` | unbounded files, URLs and diffs pulled into the session that then has to test against them |

None of those is judgement. All of them were competing for the same context as the judgement.

### Decision Made

**Route the input and output; keep the reasoning.** Three tiers, cheapest first, with a
hook layer that makes the thresholds real instead of advisory.

- **Tier 0 — deterministic code.** Anything with a fixed contract is a `qualiow` CLI command.
  Shipped in 2.1.0: `kb digest`, `session finalize|list|archive|delete|prune`,
  `list knowledge` with filters.
- **Tier 1 — cheap sub-agents.** Reads that need light judgement and can answer in a bounded,
  cited structure. Four of them ship, pinned in their own frontmatter:
  `qa-gather-agent` (`sonnet`), `qa-reporting-agent` (`sonnet`, `effort: low`),
  `qa-diff-indexer-agent` (`haiku`, `effort: low`), `qa-page-mapper-agent` (`haiku`,
  `effort: low`).
- **Tier 2 — the session model.** Exploration, interaction, and every judgement in the
  never-delegate list below.

The routing procedure is three questions, in order, and the first "yes" wins:

1. **Is the answer determined by the inputs?** Then it is code — a CLI command, not a model.
   A command costs nothing and cannot hallucinate an index row.
2. **Does it need light judgement over a large input, and can the answer be returned as a
   bounded structure?** Then it is a cheap sub-agent: an extraction, an index, a map, an
   assembly against a contract.
3. **Is the answer an opinion?** Then it is this session, and it stays here.

### The never-delegate list

Whatever the tiering, these stay with the session model, and
`qa-explore/references/delegation-rules.md` is the operative copy:

- Severity and priority, including the "when in doubt, go lower" call
- Business impact — revenue, trust, regulatory, data, scale
- The decision that something *is* a bug, and every word of `bugs/BUG-NNN.md`
- The charter and the P0–P3 risk ranking behind it
- **What is missing** — the negative-space question no extraction pass can ask
- The verdicts `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `NOT-REACHABLE`, `UNVERIFIABLE`
- The executive summary, the recommendations and the reflection

A delegate that returns one of these has exceeded its brief; that part of its answer is
discarded and the call is made here.

### Why the interaction phases are excluded

Phases 4 to 6 — journeys, features, edge cases — are not routed at all, even though they are
the phases that read the most snapshot text. Three reasons, and any one of them would be
enough:

- **Element refs are context.** `e17` means something only inside the snapshot that produced
  it and only until the page re-renders. Handing refs across an agent boundary buys a stale-ref
  failure mode in exchange for nothing.
- **The next action depends on the last observation.** Exploration is a loop, not a batch. A
  delegate would have to come back after every click, and the round trip costs more than the
  read it saved.
- **The bug is found in the gap between what happened and what should have happened.** That
  comparison is the product. Sending it to a cheaper model to save input tokens is selling the
  only thing being bought.

Discovery is the exception, and only for the raw tree: mapping a static snapshot into forms,
navigation and controls is extraction, and the session keeps driving the page itself.

### Why the hooks are scoped, and why 300 lines

The hooks are enforcement, not policy — the policy is in the skills, and the hooks catch the
cases where a model reaches for a whole file anyway (including inside a sub-agent, which is
why the reporting agent reads in windows).

- **Scoped to qualiow-owned paths.** `read-guard.mjs` fires only for
  `data/knowledge/manifest.yml`, `data/knowledge/releases/**`,
  `output/sessions/*/phase-*.md` and `output/sessions/*/snapshots/*`; `write-guard.mjs` only
  for files under `output/`, and never inside `snapshots/`. A global read block would police
  the user's ordinary coding in the same project, which is not this package's business — and
  a tool that gets in the way of unrelated work gets switched off entirely. That is the
  deliberate difference from the plugin that prompted this.
- **300 lines** is the ceiling because it is the size at which a cheaper route always exists
  for our own files: `qualiow kb digest`, `qualiow list knowledge --entry <id>`, a `Grep` for
  the heading plus a `Read` with `offset`/`limit`, or `qa-page-mapper-agent`. Below it there
  is no cheaper route worth the indirection. The same reasoning sets the diff gate: a branch
  diff reaching 25 files or 1,500 changed lines goes through `qa-diff-indexer-agent` instead
  of being read into context.
- A `Read` that already carries `offset` or `limit` passes: the reader has already said it
  wants a window, and the guard has nothing to add.
- `write-guard.mjs` mechanises security rule 3, which was prompt-only until now. It shares the
  redaction list with `src/utils/redact.ts` by duplicating the patterns — a hook has to answer
  in milliseconds and cannot afford the CLI's start-up — with a parity test asserting that the
  same sample strings give the same answer through both.

### Why the report is split into notes and assembly

`session-report.md` is two different jobs wearing one filename. The executive summary, the
coverage map, the recommendations and the reflection are the session's opinion; everything
around them is a contract that `references/output-contract.md` already specifies exactly.

So the session writes `phase-7-notes.md` first — its own words, header first — and
`qa-reporting-agent` assembles the report around them, runs `qualiow session finalize`, and
fixes only header and format violations. The split is what makes the delegation safe: the
agent cannot invent a summary, because the summary already exists and its instruction is to
copy it. Bug reports and `stats.json` are never delegated. If the Agent tool is unavailable,
the session writes the report itself and runs `finalize` — the notes file is a valid input to
both paths.

Quick sessions keep writing their own report. Spinning up an agent to assemble roughly thirty
lines costs more than it saves.

### Why `/qa-gather` forks entirely

Gather is the one skill whose *whole job* is reading things the session should not be carrying
— tickets, PRs, design docs, diffs, pasted text — and whose output is a single file that the
next session reads instead. It has no interactive step to lose, so the skill runs with
`context: fork` in `qa-gather-agent` and the session sees only the resulting context path.

The cost is that the agent starts with the invocation and nothing else: paths, URLs and pasted
text must be in the same message, and gaps become `[GAP]` / `[ASSUMPTION]` markers rather than
a follow-up question. That was already the skill's convention, so the fork made it a rule
instead of a habit.

### What a delegate must return

Bounded — the request states the maximum size. Structured — a table or a fixed heading set.
Cited — `file:line`, an element ref, or the probe command that produced it. Free of opinions:
no "looks fine", no "this is probably a bug", no severity, no verdict. The session reasons
over the delegate's output; it never pastes that output into a report unchanged.

Each agent also carries a `maxTurns` ceiling in its own frontmatter, so a delegate that starts
wandering stops instead of quietly becoming a second session.

### Alternatives

| Option | Why not |
|--------|---------|
| A third-party routing runtime | Claude Code already has the pieces — sub-agents that pin a model and an effort, forked skill contexts, and plugin-native `PreToolUse` hooks. Adding a runtime would add an install step, a process and a failure mode for capability we already have |
| Route everything, including the interaction phases | Sells the product. See the exclusion above |
| A global read block, as the plugin that prompted this does | Polices the user's own code in the same project. Scoped guards are the version that survives contact with a real repository |
| Hooks only, no sub-agents | A hook can refuse a read; it cannot answer the question the read was for. Refusal without a route is just a broken session |
| Sub-agents only, no hooks | Instructions are followed most of the time, and "most of the time" is how the whole manifest ends up in context on the one session that mattered |
| One big orchestrator agent per session (ADR-009 as written) | Still blocked on ISSUE-001 permission inheritance under plugin installs. The four bounded agents are the part that could ship without it |

### Overrides

- `QUALIOW_HOOKS=off` in `.claude/settings.json` `env` — disables both guards for a project.
- `QUALIOW_READ_MAX_LINES=<n>` — moves the read ceiling for a project.
- `model: inherit` in a project's copy of an agent — runs that delegate on the session's own
  model, for anyone who would rather pay for the read than route it.
- `CLAUDE_CODE_SUBAGENT_MODEL` — the environment-level override for the whole set.
- The agents ship without `permissionMode`, deliberately: a plugin-distributed agent cannot
  declare one (ISSUE-001), so permission behaviour is the consuming project's
  `settings.json`, not ours. `tests/unit/agents-lint.test.ts` enforces the absence.

### Consequences

- **A refusal must always name a route.** The read guard's deny message carries the cheaper
  command, because a block with no alternative just moves the cost to the retry loop.
- **The contract for each delegate lives in its agent file**, not in the calling skill, so the
  routing can be re-tuned without touching skill text that six files copy from each other.
- **Two enabled hook sets is a supported mistake, not a broken one.** A plugin install and a
  project that ran `init --hooks` both fire: the same deny twice and two node spawns per tool
  call. Documented, not guarded against.
- **Measurement is `/skill-doctor` before and after**, plus a dogfood `/qa-explore-quick`
  followed by `/qa-explore-report latest` against the shipped `testers-ai` target. The
  per-skill context-cost lines are recorded in the pull request and the changelog **only as
  measured** — this record states no saving, and no number belongs here until that run has
  happened. ISSUE-003 is the standing reason: an unrepeatable measurement is not evidence.

**Status: DONE in 2.2.0**

---

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
