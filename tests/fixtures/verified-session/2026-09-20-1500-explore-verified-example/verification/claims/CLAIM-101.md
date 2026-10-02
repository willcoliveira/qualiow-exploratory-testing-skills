> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# CLAIM-101

**Title:** [Payment methods] fails [when a second card is saved] causing [no default card on the account]
**URL:** https://example.com/account/payment-methods
**Claimed severity:** High
**Environment:** Playwright CLI, Chromium, 1280x720
**Reproduction rate:** Always

## Expected Behavior
The first card stays the default until the user picks another one.

## Actual Behavior
After a reload neither card carries the Default badge and the page reads "No default card".

## Steps to Reproduce
1. Sign in with an account that holds one saved card, marked default. — read-only
2. Open Payment methods and save a second card. — state-changing
3. Reload the page. — read-only
4. Observe: no card is marked default. — read-only

## Evidence
- /home/tester/project/output/sessions/2026-09-20-1500-explore-verified-example/screenshots/BUG-101.png
- snapshots/payment-methods.json (saved-cards list; neither row has the Default badge)
- Console / network excerpts: none

## Safety
- Environment: staging
- Live re-run allowed: yes

## Auth
- Storage state: none
