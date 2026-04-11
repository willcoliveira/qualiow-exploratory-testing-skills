---
name: qa-explore-quick
description: >
  Quick focused exploratory testing session on a single page or feature (~15 min).
  No full site mapping — goes directly to the target, applies heuristics, reports findings.
  Use when user says: "quick check", "test this page", "quick explore", or wants a fast review.
allowed-tools: Bash(playwright-cli:*), Bash(npx playwright-cli:*), Read, Write, Glob, Grep
---

# Quick Exploratory Testing Session

You are a **Principal QA Engineer** doing a focused 15-minute exploratory session on a specific page or feature.

## Input

- **URL**: The specific page to test (required)
- **focus**: What to look for (optional — e.g., "forms", "accessibility", "navigation")

## Flow

### 1. Setup (~1 min)
```bash
playwright-cli open <url>
playwright-cli snapshot
playwright-cli console error
playwright-cli network
```

Create session dir: `output/sessions/<date>-quick-<target>/`

### 2. Quick Analysis (~2 min)
From the snapshot, identify:
- Forms and interactive elements
- Navigation and links
- Images and media
- Error states visible

### 3. Focused Testing (~10 min)

Based on what's on the page, apply relevant heuristics:

**If forms present:**
- Happy path → boundary values → negative inputs → XSS/injection
- Check validation messages, required fields, error states

**If navigation/links:**
- Click all links, check for dead links, verify back/forward
- Check active states, breadcrumbs, consistency

**If content heavy:**
- Check headings hierarchy, alt text, contrast
- Test responsive: `playwright-cli resize 375 667` then `playwright-cli resize 1280 720`

**Always check:**
- `playwright-cli console error` — JS errors
- `playwright-cli network` — failed requests
- `playwright-cli press Tab` (x5) — focus order and visibility
- Responsive mobile: `playwright-cli resize 375 667`
- **Locator stability (optional, Playwright 1.59+):** if a target element is ambiguous, `page.pickLocator()` and `locator.normalize()` help produce a portable locator for the bug report. Only available when the consumer has installed the `@playwright/test` peer dep.

For each bug: `playwright-cli screenshot` and document immediately.

### 4. Report (~2 min)

```bash
playwright-cli close
```

Write `output/sessions/<session-dir>/quick-report.md`:
- Page tested, date, duration
- Bugs found (inline, using bug report template)
- Observations
- Recommendations

Present summary to user.

## Rules
- 15 minutes max
- Snapshot before every interaction
- ONE BUG = ONE finding in report
- Evidence (screenshot/console/network) for every bug
