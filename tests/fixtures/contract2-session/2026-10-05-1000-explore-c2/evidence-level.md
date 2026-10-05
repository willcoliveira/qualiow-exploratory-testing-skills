> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

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
