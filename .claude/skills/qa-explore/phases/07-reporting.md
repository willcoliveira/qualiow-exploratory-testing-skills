# Phase 7: Reflection & Reporting (4 min)

Every command carries `-s=<sid>` (omitted here). The browser stays open until the evidence is captured; it is closed in the last step.

## Stop Recording

```bash
playwright-cli video-chapter "Reporting"
playwright-cli video-stop
playwright-cli tracing-stop
```

### Trace analysis (Playwright 1.59+, optional)

`tracing-stop` writes a trace under `traces/` (or the path it prints). To inspect it from
the command line: `npx playwright trace open <trace>` then `npx playwright trace actions --errors-only`,
`npx playwright trace requests --failed`, `npx playwright trace console`, and `npx playwright trace close`
(check `npx playwright trace --help` for the exact subcommands of the installed version).
Copy the trace into `output/sessions/<session-dir>/` if it is evidence for a bug.

### Annotated video for Critical / High bugs (optional)

The session recording from phase 2 already has chapters. For a polished reproduction of a
Critical or High bug, record a second clip with action callouts:

```bash
playwright-cli video-start output/sessions/<session-dir>/videos/BUG-NNN.webm
playwright-cli video-show-actions
# ...reproduce the bug...
playwright-cli video-hide-actions
playwright-cli video-stop
```

Or write a scripted "hero" reproduction with `page.screencast.start()` / `showChapter()` /
`showOverlay()` (Playwright 1.59) and run it with `playwright-cli run-code --filename=<script.js>`.
A screenshot remains sufficient for Medium / Low.

## Reflect Before Writing

1. **What was the biggest risk I found?** (not the most bugs; the biggest RISK)
2. **What would I tell the CEO in one sentence?**
3. **What did I NOT test that still worries me?**
4. **Which heuristic was most useful? Which was useless?**
5. **What should the next session focus on?**

## Write Bug Reports

One file per bug, `bugs/BUG-NNN.md`, in exactly the format of
`${CLAUDE_SKILL_DIR}/references/output-contract.md` (the template
`<data>/templates/bug-report.md` is the same format with guidance):

- the confidentiality header as the **first two lines**, verbatim:

  ```
  > CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
  > and application details. Do not share outside your organization without review.
  ```

- then `# BUG-NNN: [Component] fails [Condition] causing [Impact]`
- `**Severity:**` (per `severity-guide.md`; when in doubt go lower), `**Priority:**`,
  `**Component:**`, `**URL:**`, `**Environment:** Playwright CLI, Chromium, <viewport>`,
  `**Reproduction rate:**`
- `## Summary`, `## Expected Behavior`, `## Actual Behavior`, `## Steps to Reproduce`
- `## Business Impact` — MANDATORY; answer at least one of Revenue / Trust / Regulatory /
  Data / Scale, write "none identified" for the rest
- `## Evidence` — `Screenshot: screenshots/BUG-NNN.png` (take it with
  `playwright-cli screenshot --filename=output/sessions/<session-dir>/screenshots/BUG-NNN.png`),
  console errors, network failures (`playwright-cli request <n>` output, redacted)
- `## Recommended Fix Priority`

Redact per `security-rules.md` before writing.

## Write the Session Report

`session-report.md` in the format of `output-contract.md`: header, `# Session Report — <target>`,
`## Session Metadata`, `## Executive Summary` (3 sentences: what was tested, what was found,
the biggest risk), `## Summary Stats`, `## Coverage Map` with the header
`| Area | Risk | Status | Bugs | Notes |` (Status: tested / partial / not-tested /
code-verified-only), `## Bugs Found`, `## Observations` (including what's MISSING and the
data-integrity results), `## Areas Not Tested` with reasons, `## Recommendations` for the
next session, `## Reflection` (the five answers above), `## Session Stats`.

## Session Stats

Write `output/sessions/<session-dir>/stats.json` exactly as `output-contract.md` defines it
(`session_id`, `kind: "explore"`, `target`, `date`, `duration_min`, `bugs_found`,
`severity_counts`, `pages_explored`, plus the optional `domain`, `started_at`,
`completed_at`, `phases_completed`, `total_phases: 8`, `coverage`, `evidence`,
`areas_not_tested`, `blocked_by`). No other top-level keys.

Append the same numbers as the `## Session Stats` table at the end of `session-report.md`.

## Update progress.json — Final

Set `status` to `complete`, `current_phase` to `reporting`, every phase to its final status.

## Update Indexes

Append the session row to `output/sessions/INDEX.md` and one row per bug to
`output/bugs/all-bugs.md`, in the column order defined in `paths.md`.

## Close the Browser Session

Last, once every screenshot, trace and video is on disk:

```bash
playwright-cli close
playwright-cli delete-data
```

(both with `-s=<sid>`; also close and `delete-data` any extra session such as `-s=<sid>-race`).
Append to `session-log.md`: `[<timestamp>] [PHASE] Reporting complete — <N> bugs, session closed`.
