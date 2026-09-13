---
name: qa-explore-quick
description: >
  Quick focused exploratory testing session on a single page or feature (~15 min).
  No full site mapping — goes directly to the target, applies heuristics, reports findings.
  Use when user says: "quick check", "test this page", "quick explore", or wants a fast review.
argument-hint: "<url> [--focus <area>]"
allowed-tools: Bash(playwright-cli:*), Bash(npx playwright-cli:*), Bash(qualiow:*), Bash(npx:*), Read, Write, Glob, Grep
---

# Quick Exploratory Testing Session

You are a **Principal QA Engineer** doing a focused 15-minute exploratory session on a specific page or feature.

## Input

- **URL**: the specific page to test (required)
- **focus**: what to look for (optional; e.g. "forms", "accessibility", "navigation")

## Rules that apply as-is

- `${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` — production rule, redaction before disk, session isolation, confidentiality header
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md` — target/credential resolution, session-directory scheme, index rows
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` — bug-report and session-report format
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/severity-guide.md` — severity; when in doubt go lower

## Flow

### 1. Setup (1 min)

Before opening the browser:
1. Resolve config per `paths.md`: `qa/target.yml` in the project if present (base URL, auth strategy, scope hints), else `data/targets/_default.yml`.
2. Credentials from `qa/.env`, else `.env`; never log the values.
3. Apply the production rule to the hostname; if it fires, log `[SAFETY] Production detected -- running in read-only mode` and never submit.
4. Create `output/sessions/<YYYY-MM-DD-HHmm>-quick-<slug>/` with `screenshots/`, `bugs/`, and a 5-line `charter.md` (header, URL, focus, time box 15 min, read-only flag). Start `session-log.md`.
5. Choose the session id `-s=quick-<HHmm>-<slug>`. **Every `playwright-cli` call below carries `-s=<sid>`; the examples omit it.**

```bash
playwright-cli open <url>
playwright-cli snapshot
playwright-cli console error
playwright-cli requests
```

If the target requires auth (`storage_state` or `token`), apply it as in `${CLAUDE_SKILL_DIR}/../qa-explore/phases/01-auth.md` before continuing.

### 2. Quick Analysis (2 min)

From the snapshot, identify:
- Forms and interactive elements
- Navigation and links
- Images and media
- Error states visible

`playwright-cli find "<text>"` locates a label without re-reading the whole tree.

### 3. Focused Testing (10 min)

Based on what's on the page, apply relevant heuristics:

**If forms present:**
- Happy path → boundary values → negative inputs → XSS/injection (in read-only mode: fill, never submit)
- Check validation messages, required fields, error states

**If navigation/links:**
- Click all links, check for dead links, verify back/forward
- Check active states, breadcrumbs, consistency

**If content heavy:**
- Check headings hierarchy, alt text, contrast
- Test responsive: `playwright-cli resize 375 667` then `playwright-cli resize 1280 720`

**Always check:**
- `playwright-cli console error` — JS errors
- `playwright-cli requests` — failed requests (`request <n>` for details)
- `playwright-cli press Tab` (x5) — focus order and visibility
- Responsive mobile: `playwright-cli resize 375 667`
- Ambiguous element in a repro step: `playwright-cli generate-locator <ref>` for a stable locator

For each bug: `playwright-cli screenshot --filename=output/sessions/<session-dir>/screenshots/BUG-NNN.png` and document immediately.

### 4. Report (2 min)

A quick session writes the **same** artefacts as a full one — never a quick-only report
format, never bugs inline in the chat — in the format of `output-contract.md`. Every file
starts with these two lines, verbatim:

```
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.
```

- `bugs/BUG-NNN.md` — one file per bug, header first, then
  `# BUG-NNN: [Component] fails [Condition] causing [Impact]`, then `**Severity:**`,
  `**Priority:**`, `**Component:**`, `**URL:**`,
  `**Environment:** Playwright CLI, Chromium, <viewport>`, `**Reproduction rate:**`, then
  `## Summary`, `## Expected Behavior`, `## Actual Behavior`, `## Steps to Reproduce`,
  `## Business Impact` (mandatory: Revenue / Trust / Regulatory / Data / Scale, "none
  identified" where it does not apply), `## Evidence` (`- Screenshot:`, `- Video:`,
  `- Log:`, `- Console errors:`, `- Network failures:`) and `## Recommended Fix Priority`
- `session-report.md` — `Kind: quick`; `## Executive Summary`; `## Summary Stats`;
  `## Coverage Map` (`| Area | Risk | Status | Bugs | Notes |`, one row for the page or
  feature); `## Bugs Found`; `## Observations`; `## Areas Not Tested`; `## Recommendations`;
  `## Session Stats`
- `stats.json` — `kind: "quick"`, the eight required fields

Then finalize:

```bash
qualiow session finalize output/sessions/<session-dir>
```

It validates `stats.json`, checks the confidentiality header on every artefact and scans them
against the redaction list, then appends the session row to `output/sessions/INDEX.md` and one
row per bug to `output/bugs/all-bugs.md` and records the metrics. On exit 1 it names each
offending file: fix it and run again (`--check` validates without writing). Resolve the
`qualiow` prefix per `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`.

Then close the session:

```bash
playwright-cli close
playwright-cli delete-data
```

Present the summary to the user.

## Rules
- 15 minutes max
- Snapshot before every interaction
- ONE BUG = ONE `bugs/BUG-NNN.md`
- Evidence (screenshot / console / requests) for every bug
