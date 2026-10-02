> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Phase 7 Notes

## Executive Summary

Payment methods, profile and search were explored; four candidate bugs were drafted and judged. Three
shipped (one high, one medium, one low) and one was refuted. The biggest risk is the lost
default card once a second card is saved.

## Coverage Map

| Area | Risk | Status | Bugs | Notes |
|---|---|---|---|---|
| Payment methods | P0 | tested | 1 | default-card flag verified |
| Profile | P1 | tested | 1 | Safari only |
| Search | P2 | partial | 1 | filter combinations not exhausted |

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

## Refuted Findings

| ID | Claimed Title | Claimed Severity | Verdict | Refutation |
|---|---|---|---|---|
| BUG-104 | [Homepage] fails [on every load] causing [a 500 for the session endpoint] | Critical | Refuted | /api/session returned 200 on every load |
