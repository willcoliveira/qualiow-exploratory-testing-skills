# Playwright Test Agents Integration (opt-in)

> **This file is opt-in reference material.** Read it only when the session has access to `@playwright/test` and the consumer project has a `playwright.config.*` file. Otherwise skip this file — `qa-explore` works end-to-end without it.

## Purpose

`qa-explore` is an **exploratory** skill: its job is blind (or context-enriched) discovery of bugs, risks, and missing functionality in a web application, bounded by a 45-minute session.

**Playwright Test Agents** (introduced in Playwright 1.56) is a different, complementary capability: a set of three LLM-driven agents — **planner**, **generator**, **healer** — that author and maintain executable Playwright test specs.

These two are complementary, not overlapping:

| Concern | `qa-explore` | Playwright Test Agents |
|---|---|---|
| Goal | Find unknown bugs and risks | Generate and maintain regression tests |
| Output | Bug reports, session report, coverage map | `tests/*.spec.ts` files |
| When to use | New feature, new app, post-incident, pre-release audit | Known behavior you want locked in with a test |
| Input required | Just a URL (context optional) | A plan / spec / reproducible behavior |

Use `qa-explore` to discover; use Test Agents to codify a discovery into a regression test.

## When to use this handoff

You are in the right file if ANY of these are true:

- Phase 5 or 6 of `qa-explore` produced a **reproducible** bug that deserves a regression test.
- The user completed a `qa-explore` session and explicitly asked "can you write a test for this bug?"
- The user wants to seed a new test project from a qa-explore charter.

You are in the WRONG file if:

- You are mid-session. Finish `qa-explore` first; Test Agents run after reporting.
- `@playwright/test` is not a resolved dependency in the consumer project (the peer dep is optional — consumers who didn't install it cannot use this file).
- The bug is not reproducible. Test Agents need deterministic input; flaky observations go in the bug report only.

## Prerequisites

1. `@playwright/test ^1.59.1` installed in the consumer project (declared as optional peer dep in this package).
2. A `playwright.config.ts` or `playwright.config.js` present in the consumer project. If absent, run `npm init playwright@latest` first.
3. The `qa-explore` session has completed at least Phase 5 (features) and produced a bug report with exact reproduction steps.

## Bootstrap

From the consumer project root:

```bash
npx playwright init-agents --loop=claude
```

This generates the following (as of Playwright 1.59):

- Agent definition files for the selected loop (`claude`, `vscode`, or `opencode` are supported)
- A minimal `tests/agents/` scaffolding directory
- Updates to `playwright.config.ts` to wire agent reporters

The `--loop=claude` flag optimizes the agent definitions for Claude Code. `--loop=vscode` optimizes them for VS Code's built-in Copilot integration. Pick the one that matches the consumer's environment.

This command is idempotent — re-running it updates definitions without deleting committed tests.

## The three agents

### Planner

**Role:** Given a description of desired behavior (from a charter, a PRD, or a bug repro), produce an ordered plan of tests to write.

**Hand-off from qa-explore:** After a session, if the charter identified P0 journeys that have NO automated coverage, feed the charter and coverage map to the planner. The output is a list of test files the team should author.

**Output:** Markdown plan with one bullet per proposed test spec.

### Generator

**Role:** Given a plan item (or a single reproducible bug), emit a working `.spec.ts` file.

**Hand-off from qa-explore:** This is the most common handoff. When Phase 5 or 6 produces a reproducible bug, pass the bug's repro steps + expected vs actual to the generator. The generator writes `tests/repro-<bug-id>.spec.ts`, typically a 20-40 line spec.

**Output:** A test spec file that fails initially (since the bug is not yet fixed) and will pass once the fix lands.

### Healer

**Role:** When an existing spec becomes flaky — for example, because a locator shifted — the healer rewrites the failing parts of the spec to match the current DOM, using `locator.normalize()` and `page.pickLocator()` (Playwright 1.59) under the hood.

**Hand-off from qa-explore:** Not a direct handoff. Used by the consumer's team later when a generated spec starts failing due to non-bug changes.

## Bug → regression test workflow

1. **In Phase 5 or 6 of `qa-explore`**, confirm the bug is reproducible: trigger it twice in a row with the same steps and record identical results.
2. **In Phase 7 (reporting)**, write the bug report with exact steps-to-reproduce and business impact. Place the generated `bugs/BUG-NNN.md` in the session output directory as usual.
3. **After `qa-explore` finishes**, invoke the generator agent (via the loop configured at bootstrap) with the bug-report markdown as input. The generator produces `tests/repro-BUG-NNN.spec.ts`.
4. **Run the new spec once** with `npx playwright test tests/repro-BUG-NNN.spec.ts` to confirm it fails (the bug is still present). Commit the failing test alongside the bug report; when the fix lands, the same test will pass.

This workflow treats `qa-explore` as the discovery phase and Test Agents as the codification phase.

## Complementary tooling note

The official **Playwright MCP server** (see `github.com/microsoft/playwright-mcp`) is an alternative runtime harness for LLM-driven browser automation via accessibility trees. It overlaps with `playwright-cli` but targets long-lived agent sessions with persistent browser state. It is NOT required for Test Agents or `qa-explore` — mentioned here only so the consumer knows it exists.

## Limitations

- **Opt-in only.** This file, the `Bash(npx playwright:*)` permission, and the `@playwright/test` peer dep are all optional. Consumers on Playwright 1.0–1.55 or without `@playwright/test` are unaffected — `qa-explore` works identically for them.
- **Not a replacement for the charter.** Test Agents turn known behavior into specs. They do not replace exploratory discovery; a planner fed only a charter will miss what the charter itself missed.
- **Requires a reproducible bug.** Flaky observations, race conditions that only triggered once, and "it felt wrong" findings are valuable in the bug report but cannot be codified by the generator.
- **Peer dep floor is 1.59.1.** This is deliberate: the APIs referenced here (`ariaSnapshot`, `screencast`, `pickLocator`, `normalize`, `trace` CLI) are all 1.59 features. Earlier Playwright versions will either omit these methods or expose older variants that do not match the guidance below.

## Feature cross-reference

Playwright 1.56–1.59 additions and the qa-explore files that reference them:

| Feature | Playwright version | Referenced in |
|---|---|---|
| Test Agents framework (planner / generator / healer) | 1.56 | `SKILL.md`, `phases/00-setup.md`, `phases/05-features.md`, this file |
| `npx playwright init-agents` | 1.56 | `phases/00-setup.md`, `phases/05-features.md`, this file |
| `page.consoleMessages()` | 1.56 | `phases/03-discovery.md` |
| `page.pageErrors()` | 1.56 | `phases/03-discovery.md` |
| `page.requests()` | 1.56 | `phases/03-discovery.md` |
| Service Worker network routing | 1.56 | `phases/03-discovery.md` |
| `--test-list` / `--test-list-invert` | 1.56 | (used by Test Agents internally) |
| `page.accessibility` deprecation | 1.57 | `phases/06-edge-cases.md` |
| HTML reporter "Speedboard" timeline | 1.58 | `phases/07-reporting.md` |
| Trace Viewer themes | 1.58 | `phases/07-reporting.md` |
| `page.ariaSnapshot()` | 1.59 | `phases/06-edge-cases.md` |
| `page.pickLocator()` | 1.59 | `phases/05-features.md`, `qa-explore-quick/SKILL.md` |
| `locator.normalize()` | 1.59 | `phases/05-features.md`, `qa-explore-quick/SKILL.md` |
| `npx playwright trace` CLI | 1.59 | `phases/07-reporting.md` |
| `page.screencast()` | 1.59 | `phases/07-reporting.md` |
| `browser.bind()` | 1.59 | (reference only, not in phase guidance) |
| `--debug=cli` flag | 1.59 | (reference only, not in phase guidance) |
