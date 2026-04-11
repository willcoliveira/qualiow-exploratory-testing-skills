# Phase 7: Reflection & Reporting (~15% of time)

## Stop Recording

```bash
playwright-cli tracing-stop
playwright-cli close
```

### Trace Analysis (Playwright 1.58–1.59, optional)

Once tracing is stopped, the captured trace can be explored from the command line or the HTML reporter:

- **`npx playwright trace <trace.zip>`** *(Playwright 1.59)* — opens the trace from the CLI without launching the full UI reporter. Useful for agent-driven debugging of a specific step or failure.
- **HTML reporter "Speedboard" timeline** *(Playwright 1.58)* — when the session generated a Playwright HTML report, the "Speedboard" tab shows a timeline visualization of steps useful for spotting latency anomalies that correlate with the bugs you filed.
- **Trace Viewer themes** *(Playwright 1.58)* — the Trace Viewer now honors system theme; no action required, just mentioned here so the reviewer knows the option exists.
- **`page.screencast()`** *(Playwright 1.59, optional)* — if the session wants to attach an annotated video of the reproduction to the bug report, `page.screencast()` captures it with action annotations and chapter overlays. Treat it as premium evidence for Critical / High bugs; a screenshot remains sufficient for Medium / Low.

These helpers are additive — the existing `screenshots/bug-NNN.png` workflow below is unchanged.

## Reflect Before Writing

Before writing the report, answer these questions:
1. **What was the biggest risk I found?** (not the most bugs -- the biggest RISK)
2. **What would I tell the CEO in one sentence?**
3. **What did I NOT test that still worries me?**
4. **Which heuristic was most useful? Which was useless?**
5. **What should the next session focus on?**

## Write Bug Reports

For each bug, write `bugs/BUG-NNN.md`:

```markdown
## [Component] fails [Condition] causing [Impact]

**Severity:** Critical | High | Medium | Low
**URL:** [exact URL]
**Environment:** Playwright CLI, Chromium, [viewport]

### Expected Behavior
[What should happen -- from the USER's perspective]

### Actual Behavior
[What actually happens -- be specific, include error messages]

### Steps to Reproduce
1. [Exact steps -- a developer should be able to reproduce this]

### Business Impact
[THIS IS MANDATORY -- answer at least one:]
- **Revenue impact:** [Does this prevent purchases? Cause incorrect charges?]
- **Trust impact:** [Would a user lose confidence? Would they call support?]
- **Regulatory risk:** [Does this violate SOX, PCI, GDPR, WCAG, etc.?]
- **Data risk:** [Is data corrupted, lost, or exposed?]
- **Scale:** [How many users are affected? Under what conditions?]

### Evidence
- Screenshot: `screenshots/bug-NNN.png`
- Console errors: [if any]
- Network failures: [if any]

### Recommended Fix Priority
[Why this should be fixed before/after other bugs]
```

## Write Session Report

`session-report.md` with:
- **Executive summary** (3 sentences max -- what was tested, what was found, what's the risk)
- Business context and charter summary
- Bug summary table (severity, component, business impact)
- Data integrity results
- What's MISSING (negative space findings)
- Coverage map with risk ranking
- Cross-feature journey results
- Heuristic effectiveness (which worked, which didn't)
- Areas NOT tested and why
- Recommendations for next session
- Reflection answers

## Coverage Map

Document what was tested and what was not:

| Feature | Risk | Tested? | Findings | Notes |
|---------|------|---------|----------|-------|
| [feature] | P0 | Yes | 2 bugs | [notes] |
| [feature] | P1 | Partial | 1 bug | [notes] |
| [feature] | P2 | No | -- | Time ran out |

## Session Stats

Write `output/sessions/<session-dir>/stats.json` with session metrics:

```json
{
  "session_id": "<session-dir>",
  "target": "<target_url>",
  "domain": "<domain>",
  "started_at": "<from progress.json>",
  "completed_at": "<ISO timestamp now>",
  "duration_min": "<calculated>",
  "phases_completed": "<count of phases with status=complete>",
  "total_phases": 8,
  "bugs": {
    "total": "<count>",
    "critical": "<count>",
    "high": "<count>",
    "medium": "<count>",
    "low": "<count>"
  },
  "coverage": {
    "pages_explored": "<count>",
    "checklist_total": "<from domain config>",
    "checklist_verified": "<count checked>",
    "checklist_percentage": "<calculated>",
    "data_integrity_checks": "<count>",
    "data_integrity_passed": "<count>",
    "personas_tested": ["<list>"],
    "purchase_flows_tested": ["<list>"]
  },
  "evidence": {
    "screenshots": "<count>",
    "console_errors_found": "<count>",
    "network_failures_found": "<count>"
  },
  "areas_not_tested": ["<list with reasons>"],
  "blocked_by": "<if something blocked testing, note it>"
}
```

Also append a **stats summary** at the bottom of `session-report.md`:

```markdown
---

## Session Stats

| Metric | Value |
|--------|-------|
| Duration | <X> min |
| Phases completed | <N>/8 |
| Bugs found | <N> (Critical: <N>, High: <N>, Medium: <N>, Low: <N>) |
| Pages explored | <N> |
| Screenshots taken | <N> |
| Console errors found | <N> |

### Coverage

| Area | Risk | Tested | Depth | Bugs | Notes |
|------|------|--------|-------|------|-------|
| <area> | P0 | Yes | Deep | <N> | <notes> |
| <area> | P1 | Partial | Shallow | <N> | <blocked by...> |
| <area> | P2 | No | — | — | Time ran out |

### Checklist Coverage
<N>/<N> items verified (<X>%)

### Data Integrity
<N>/<N> checks passed

### Not Tested (and why)
- <area>: <reason>
```

## Update progress.json — Final

Set status to "complete", current_phase to "reporting", all phases to their final status.

## Update Indexes

Append to `output/sessions/INDEX.md` and `output/bugs/all-bugs.md`.
