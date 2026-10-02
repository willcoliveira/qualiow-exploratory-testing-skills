> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# BUG-NNN: [Component] fails [Condition] causing [Impact]

> _Title example: `[Login Form] fails [when password contains special characters] causing [authentication error and user lockout]`. Number bugs from BUG-001 per session; one file per bug at `bugs/BUG-NNN.md`._

**Severity:** Critical | High | Medium | Low
**Priority:** P0 | P1 | P2 | P3
**Component:** [Component]
**URL:** [exact URL where the bug was found — mobile: screen name or deep link — backend: endpoint or resource]
**Environment:** [e.g. Playwright CLI, Chromium, 1280x720, logged in as X — mobile: mode / platform / device / OS — backend: env kind + build]
**Reproduction rate:** Always | Intermittent (~X%) | Once
**Verification:** Verified | Verified (severity adjusted from X) | Unverified (reason)

> _The Verification line and the `## Verification` section at the end are present only when the session ran the adversarial `qa-bug-judge` (Phase 7 of `/qa-explore`). A candidate the judge refuted lives in `bugs/refuted/` with `**Verification:** Refuted` (or `Unreproducible`) and a `## Refutation (Judge)` section holding the verdict block verbatim._

> _Severity per `severity-guide.md`: Critical = data loss, security breach, financial loss, system unusable; High = major feature broken, no reasonable workaround; Medium = partial break, workaround exists, or an important missing feature; Low = cosmetic, rare edge case. **When in doubt, go one level LOWER.** Priority = severity adjusted by workaround and blast radius (P0 hours · P1 this sprint · P2 next sprint · P3 backlog)._

## Summary

[Two sentences: what breaks, and why it matters to the business.]

## Expected Behavior

[What should happen according to requirements, conventions, or reasonable user expectations.]

## Actual Behavior

[What actually happens instead. Be precise; include error messages verbatim.]

## Steps to Reproduce

1. Navigate to `[URL]`
2. [Action 2]
3. [Action 3]
4. Observe: [what goes wrong]

## Business Impact

> _Mandatory. Answer at least one bullet; write "none identified" for the rest. Quantify where you can ("blocks all guest checkout, ~30% of orders")._

- **Revenue impact:** [prevents purchases, incorrect charges, blocked upgrades, reduced conversion?]
- **Trust impact:** [would a user lose confidence, contact support, churn?]
- **Regulatory risk:** [SOX, PCI DSS, GDPR, CCPA, HIPAA, WCAG 2.1 AA, KYC/AML, Regulation E — name the regulation, or "none identified"]
- **Data risk:** [corrupted, lost, or exposed data?]
- **Scale:** [how many users, under what conditions]

## Evidence

- Screenshot: `screenshots/BUG-NNN.png`
- Video: `videos/BUG-NNN.webm` (if recorded; `.mp4` on mobile)
- Log: `logs/BUG-NNN.log` (mobile) / `evidence/<file>` (backend), or "none"
- Console errors: [verbatim, redacted, or "none"]
- Network failures: [method, URL, status, response excerpt — redacted — or "none"]

## Recommended Fix Priority

[Why this priority relative to the other findings: risk (likelihood × impact, see `severity-guide.md`), workaround, blast radius, and anything related — recent deploys, feature flags, user reports.]

## Verification

- Verdict: [CONFIRMED | CONFIRMED-ADJUSTED | UNVERIFIED] ([live-repro | evidence-only], [high | medium | low] confidence)
- Judge repro result: [one line — what the judge observed, or why it could not run the steps]
- Severity: [original X → final Y — only when adjusted; or "kept at X; judge proposed Y" when overruled]
- Full verdict: `../verification/VERDICT-NNN.md`
