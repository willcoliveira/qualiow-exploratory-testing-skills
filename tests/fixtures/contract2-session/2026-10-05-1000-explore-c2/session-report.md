> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Session Report — Example Shop

## Session Metadata
| Field | Value |
|---|---|
| Session ID | 2026-10-05-1000-explore-c2 |
| Kind | explore |
| Target | example-shop |
| Date | 2026-10-05 |
| Charter | charter.md |

## Executive Summary
A hand-built contract-2 fixture: no real application was tested.

## Coverage Level
A computed coverage fact for the tested scope — not a ship probability or release verdict.

**Coverage level: qualified** — every P0 and P1 area is tested; the gaps below remain.

### By risk tier

| Tier | Level | Areas | Tested |
|---|---|---|---|
| P0 | complete | 2 | 2 |
| P1 | complete | 1 | 1 |
| P2 | unassessed | 1 | 0 |
| P3 | unassessed | 1 | 0 |

### Findings

Reported beside the level, never folded into it: highest shipped severity High · 1 unverified · 1 on P0 areas.

### Gaps

| Code | Area | Tier | Bug |
|---|---|---|---|
| AREA_PARTIAL | A4 | P2 | — |
| AREA_DEFERRED | A5 | P3 | — |
| BUG_UNVERIFIED | A4 | P2 | BUG-002 |
| BUG_UNMAPPED | — | — | BUG-003 |

### To raise this level

- A4 (P2) is partial: finish it, cite an `A4-…` file under `screenshots/` or `evidence/`, and set it to `tested`.
- A5 (P3) was deferred by the time box: test it in a follow-up session (`/qa-explore --continue` carries it forward).
- BUG-002 (Medium, A4) is unverified: have the bug judge confirm it (a session with verification on).
- BUG-003 (Low) maps to no area: give it `**Area:** A<N>`, adding a charter row for where it was found if there is none.

## Summary Stats

| Metric | Value |
|--------|-------|
| Bugs found | 3 |
| Pages explored | 9 |

## Coverage Map

| Area | Risk | Status | Bugs | Notes |
|------|------|--------|------|-------|
| A1 Login | P0 | tested | 0 | Sign-in, lockout and reset paths |
| A2 Checkout | P0 | tested | 1 | BUG-001 on a changed cart total |
| A3 Search | P1 | tested | 0 | Empty, long and accented queries |
| A4 Account settings | P2 | partial | 1 | Password change not reached |
| A5 Help pages | P3 | deferred | 0 | Not reached in the time box |

## Bugs Found

| ID | Severity | Component | Title | Business Impact | Verification |
|----|----------|-----------|-------|-----------------|--------------|
| BUG-001 | High | Checkout | Charge for the old total after a cart change | Revenue | Verified |
| BUG-002 | Medium | Account settings | Clipped save button on a long display name | Trust | Unverified |
| BUG-003 | Low | Footer | Dead "Careers" link | Trust | Verified |

## Areas Not Tested

| Area | Reason |
|------|--------|
| A5 Help pages | Not reached in the time box |
