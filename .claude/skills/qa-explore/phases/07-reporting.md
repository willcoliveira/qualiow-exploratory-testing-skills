# Phase 7: Reflection & Reporting (~15% of time)

## Stop Recording

```bash
playwright-cli tracing-stop
playwright-cli close
```

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

## Update Indexes

Append to `output/sessions/INDEX.md` and `output/bugs/all-bugs.md`.
