# Playwright Test Agents Integration (opt-in)

> **This file is opt-in reference material.** Read it only when the consumer project has
> `@playwright/test` installed and a `playwright.config.*` file. Otherwise skip it;
> `qa-explore` works end-to-end without it.

## Purpose

`qa-explore` is an **exploratory** skill: blind (or context-enriched) discovery of bugs,
risks and missing functionality in a web application, bounded by a 45-minute session.

**Playwright Test Agents** (Playwright 1.56+) are a different, complementary capability:
three agent definitions, **planner**, **generator** and **healer**, that author and maintain
executable Playwright test specs.

| Concern | `qa-explore` | Playwright Test Agents |
|---|---|---|
| Goal | Find unknown bugs and risks | Generate and maintain regression tests |
| Output | Bug reports, session report, coverage map | `tests/*.spec.ts` files |
| When to use | New feature, new app, post-incident, pre-release audit | Known behaviour you want locked in with a test |
| Input required | Just a URL (context optional) | A plan, a spec, or a reproducible behaviour |

Use `qa-explore` to discover; use Test Agents to codify a discovery into a regression test.

## When to use this handoff

- Phase 5 or 6 produced a **reproducible** bug that deserves a regression test.
- The user completed a session and asked "can you write a test for this bug?"
- The user wants to seed a new test project from a session charter.

Not mid-session (finish `qa-explore` first), not without `@playwright/test`, and not for a
bug that is not reproducible (flaky observations belong in the bug report only).

## Prerequisites

1. `@playwright/test ^1.59.1` installed in the consumer project (an optional peer
   dependency of this package).
2. A `playwright.config.ts` or `playwright.config.js` in the consumer project. If absent,
   run `npm init playwright@latest` first.
3. A completed session with a bug report that has exact reproduction steps.

## Bootstrap

From the consumer project root:

```bash
npx playwright init-agents --loop=claude
```

Supported loops: `claude`, `codex`, `copilot`, `opencode`, `vscode`, `vscode-legacy`.
With `--loop=claude` it writes:

- `.claude/agents/` with one Markdown definition each for the planner, generator and healer
- `.mcp.json` registering the `playwright-test` server (`npx playwright run-test-mcp-server`)
- `specs/` with a `README.md`, and a default seed spec file if the project has none
  (`--prompts` additionally writes `.claude/prompts/`)

It does not create a `tests/agents/` directory and does not edit `playwright.config.*`.
The definitions are generated files: re-run the command after upgrading Playwright so the
agents pick up new tools and instructions.

## The three agents (upstream definitions)

- **Planner** explores the app and produces a Markdown test plan. Hand-off from
  `qa-explore`: feed it the charter and the coverage map for P0 journeys that have no
  automated coverage.
- **Generator** transforms the Markdown plan into Playwright Test files. Hand-off: pass a
  reproducible bug's steps and expected-vs-actual; it writes `tests/repro-BUG-NNN.spec.ts`,
  which fails until the fix lands.
- **Healer** executes the test suite and automatically repairs failing tests. No direct
  hand-off; the team uses it later when a generated spec breaks for non-bug reasons.

## Bug → regression test workflow

1. **In phase 5 or 6**, confirm the bug is reproducible: trigger it twice with the same
   steps and identical results.
2. **In phase 7**, write `bugs/BUG-NNN.md` per `output-contract.md`.
3. **After the session**, invoke the generator agent with the bug report as input.
4. **Run the new spec once**: `npx playwright test tests/repro-BUG-NNN.spec.ts`. It should
   fail while the bug exists. Commit it with the bug report.

## Limitations

- Opt-in only. This file, the `Bash(npx playwright:*)` permission and the peer dependency
  are all optional; sessions that never touch them are unaffected.
- Test Agents turn known behaviour into specs. They do not replace exploratory discovery.
- The generator needs deterministic reproduction steps.

## Feature cross-reference

Playwright APIs the phases mention, with the version that introduced them, and how each is
reached from a `playwright-cli` session:

| Feature | Version | Used in | How |
|---|---|---|---|
| `npx playwright init-agents` | 1.56 | `${CLAUDE_SKILL_DIR}/phases/00-setup.md`, this file | shell |
| `page.consoleMessages()`, `page.pageErrors()`, `page.requests()` | 1.59 | `${CLAUDE_SKILL_DIR}/phases/03-discovery.md` | `playwright-cli run-code "async page => …"` |
| `page.accessibility` **removed** | 1.57 | `${CLAUDE_SKILL_DIR}/phases/06-edge-cases.md` | use `snapshot` (aria tree) or `run-code` + `page.ariaSnapshot()` |
| `locator.ariaSnapshot()` (1.49), `page.ariaSnapshot()` (1.59) | 1.49 / 1.59 | `${CLAUDE_SKILL_DIR}/phases/06-edge-cases.md` | `run-code` |
| `page.pickLocator()` | 1.59 | `${CLAUDE_SKILL_DIR}/phases/05-features.md` | human-only (opens a picker in a headed browser); agents use `generate-locator <ref>` |
| `page.screencast` | 1.59 | `${CLAUDE_SKILL_DIR}/phases/07-reporting.md` | `video-start` / `video-chapter`, or a `run-code --filename` hero script |
| `npx playwright trace open <trace>` | 1.59 | `${CLAUDE_SKILL_DIR}/phases/07-reporting.md` | shell |
| `--debug=cli`, `browser.bind()` | 1.59 | reference only | not used by the session |
