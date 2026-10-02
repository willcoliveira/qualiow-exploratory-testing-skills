> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# CLAIM-104

**Title:** [Homepage] fails [on every load] causing [a 500 for the session endpoint]
**URL:** https://example.com/
**Claimed severity:** Critical
**Environment:** Playwright CLI, Chromium, 1280x720
**Reproduction rate:** Always

## Expected Behavior
No server errors on page load.

## Actual Behavior
The console shows a 500 response for /api/session on every load.

## Steps to Reproduce
1. Open https://example.com/. — read-only
2. Open the console. — read-only
3. Observe: a 500 for /api/session. — read-only

## Evidence
- screenshots/BUG-104.png
- snapshots/homepage-requests.json (network log of the first load)
- Console / network excerpts: GET /api/session 500 (one entry, first load)

## Safety
- Environment: staging
- Live re-run allowed: yes

## Auth
- Storage state: none
