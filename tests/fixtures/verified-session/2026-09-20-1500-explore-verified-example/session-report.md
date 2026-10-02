> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Session Report — Example App

## Session Metadata

| Field | Value |
|---|---|
| Session ID | 2026-09-20-1500-explore-verified-example |
| Kind | explore |
| Target | Example App |
| URL | https://example.com |
| Date | 2026-09-20 |
| Duration | 45 min |
| Charter | charter.md |

## Executive Summary

Payment methods, profile and search were explored; four candidate bugs were drafted and judged. Three
shipped (one high, one medium, one low) and one was refuted. The biggest risk is the lost
default card once a second card is saved.

## Summary Stats

| Metric | Count |
|---|---|
| Pages explored | 10 |
| Actions performed | 40 |
| Bugs — Critical | 0 |
| Bugs — High | 1 |
| Bugs — Medium | 1 |
| Bugs — Low | 1 |
| **Total bugs** | **3** |

## Coverage Map

| Area | Risk | Status | Bugs | Notes |
|---|---|---|---|---|
| Payment methods | P0 | tested | 1 | default-card flag verified |
| Profile | P1 | tested | 1 | Safari only |
| Search | P2 | partial | 1 | filter combinations not exhausted |

## Bugs Found

| # | ID | Title | Severity | Report | Verification |
|---|---|---|---|---|---|
| 1 | BUG-101 | [Payment methods] fails [when a second card is saved] causing [no default card on the account] | High | bugs/BUG-101.md | Verified |
| 2 | BUG-102 | [Profile] fails [to upload an avatar on Safari] causing [a silent no-op] | Medium | bugs/BUG-102.md | Verified (severity adjusted from High) |
| 3 | BUG-103 | [Search] fails [to apply the category filter] causing [unchanged results] | Low | bugs/BUG-103.md | Unverified (judge unavailable: timeout) |

## Observations

- Error pages leak no stack traces.

## Areas Not Tested

| Area | Reason |
|---|---|
| Password reset | time box expired |

## Recommendations

- [ ] Fix BUG-101 before the next release.

## Reflection

1. **Biggest risk found:** the lost default card.
2. **What I would tell the CEO:** saving a second card leaves the account with no default card.
3. **What I did not test that still worries me:** password reset.
4. **Most useful heuristic / least useful:** data-integrity chain / RCRCRC.
5. **Next session should focus on:** password reset and account settings.

## Session Stats

| Metric | Value |
|---|---|
| Duration | 45 min |
| Phases completed | 8/8 |
| Bugs found | 3 (Critical: 0, High: 1, Medium: 1, Low: 1) |
| Pages explored | 10 |
| Screenshots taken | 4 |
| Console errors found | 0 |
| Bugs judged | 4 (verified 2, unverified 1, refuted 1) |

## Refuted Findings

| ID | Claimed Title | Claimed Severity | Verdict | Refutation |
|---|---|---|---|---|
| BUG-104 | [Homepage] fails [on every load] causing [a 500 for the session endpoint] | Critical | Refuted | /api/session returned 200 on every load |
