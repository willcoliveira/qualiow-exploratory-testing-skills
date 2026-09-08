> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Session Report — Example App

## Session Metadata

| Field | Value |
|---|---|
| Session ID | 2026-09-08-1813-explore-example |
| Kind | explore |
| Target | Example App |
| URL | https://example.com |
| Date | 2026-09-08 |
| Duration | 42 min |
| Charter | charter.md |

## Executive Summary

Exploratory testing of Example App covered login, checkout and search. Two bugs were
found, one of which blocks checkout entirely. The biggest risk is the checkout 500 error
under an empty-cart condition, which affects every guest session.

## Summary Stats

| Metric | Count |
|---|---|
| Pages Explored | 12 |
| Actions performed | 34 |
| Bugs — Critical | 0 |
| Bugs — High | 1 |
| Bugs — Medium | 1 |
| Bugs — Low | 0 |
| **Total bugs** | **2** |

## Coverage Map

| Area | Risk | Status | Bugs | Notes |
|---|---|---|---|---|
| Login | P0 | tested | 0 | Happy path and invalid credentials both verified |
| Checkout | P0 | tested | 1 | |
| Search | P2 | partial | | Time box expired before exhausting filter combinations |

_Status: `tested` (fully explored with the planned heuristics) · `partial` (visited, not all heuristics or paths exercised) · `not-tested` (in scope, not reached) · `code-verified-only` (believed correct from reading source, never observed running: this is UNVERIFIABLE, not a pass). Name the single not-tested item that carries the most risk._

## Bugs Found

| # | ID | Title | Severity | Report |
|---|---|---|---|---|
| 1 | BUG-001 | [Checkout] fails [when the cart is empty] causing [a 500 error] | High | bugs/BUG-001.md |
| 2 | BUG-002 | [Account] leaks [session token] causing [a redirect to an internal host] | Medium | bugs/BUG-002.md |

## Observations

- Error messages are generic and do not leak stack traces to the end user.
- Session cookies are marked HttpOnly and Secure, which is good security practice.

## Areas Not Tested

| Area | Reason |
|---|---|
| Password reset | Time box expired before reaching this area |

## Recommendations

- [ ] Fix the checkout 500 error for an empty cart (BUG-001).
- [ ] Audit the account redirect flow for leaked tokens (BUG-002).

## Reflection

1. **Biggest risk found:** The checkout 500 error blocks every guest session with an empty cart.
2. **What I would tell the CEO:** Checkout is broken for a common edge case — fix before the next release.
3. **What I did not test that still worries me:** Password reset was not reached in this time box.
4. **Most useful heuristic / least useful:** SFDIPOT was most useful; RCRCRC added little here.
5. **Next session should focus on:** Password reset and account settings.

## Session Stats

| Metric | Value |
|---|---|
| Duration | 42 min |
| Phases completed | 8/8 |
| Bugs found | 2 (Critical: 0, High: 1, Medium: 1, Low: 0) |
| Pages explored | 12 |
| Screenshots taken | 5 |
| Console errors found | 1 |
| Data integrity checks | 4/4 |
