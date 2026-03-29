# Bug Report

## Title

`[Component] fails [Condition] causing [Impact]`

> _Example: [Login Form] fails [when password contains special characters] causing [authentication error and user lockout]_

---

## Severity

> Select one. See definitions below.

- [ ] **Critical**
- [ ] **High**
- [ ] **Medium**
- [ ] **Low**

### Severity Level Definitions

| Level    | Definition                                                                 | Examples                                                                                      |
|----------|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Critical | System down, data loss, security breach. Blocks all users immediately.     | Payment gateway crashes on all transactions; user passwords exposed in API response; database corruption losing customer orders. |
| High     | Major feature broken, many users affected. No reasonable workaround.       | Checkout fails for all credit card payments; search returns zero results for every query; login broken on mobile devices.         |
| Medium   | Partial break, workaround exists. Some users affected under certain paths. | Discount code applies twice if user clicks fast; filter resets after pagination; profile photo upload fails on Safari only.       |
| Low      | Cosmetic issue, rare edge case. Minimal user or business impact.           | Footer alignment off by 2px on wide screens; tooltip text truncated in German locale; hover state missing on disabled button.     |

> **Note: When in doubt, go one level LOWER. Severity inflation destroys credibility.** A bug report rated "Critical" that turns out to be cosmetic undermines every future report you file. Reserve Critical for genuine emergencies. If you hesitate between two levels, pick the lower one and let the evidence speak for itself.

---

## URL

`[URL where the bug was found]`

## Environment

| Property  | Value                     |
|-----------|---------------------------|
| Browser   | [e.g., Chrome 125.0]     |
| Viewport  | [e.g., 1920x1080]        |
| OS        | [e.g., macOS 15.x]       |
| Auth      | [e.g., logged in as X]   |
| Device    | [e.g., Desktop / Mobile] |

---

## Expected Behavior

_What should happen according to requirements, conventions, or reasonable user expectations._

> [Describe the expected outcome clearly.]

## Actual Behavior

_What actually happens instead._

> [Describe the actual outcome. Be precise -- include error messages verbatim if applicable.]

---

## Steps to Reproduce

1. Navigate to `[URL]`
2. [Action 2]
3. [Action 3]
4. [Action 4]
5. Observe: [what goes wrong]

> _Reproduction rate: [Always / Intermittent (~X%) / Once]_

---

## Business Impact

> This section is **mandatory**. Every bug exists in a business context. Articulating impact helps engineering prioritize correctly and helps stakeholders understand the risk without needing to read technical details.

### Revenue Impact

> [Does this bug prevent purchases, cause incorrect charges, block upgrades, or reduce conversion? Quantify if possible -- e.g., "Blocks all guest checkout, which represents ~30% of orders."]

### Trust Impact

> [Would a user lose confidence in the product? Would they contact support, leave a negative review, or churn? e.g., "User sees a $0.00 balance briefly before correct amount loads -- creates panic."]

### Regulatory Risk

> [Does this violate any compliance requirements? Specify the regulation. e.g., "Credit card number visible in URL query string -- PCI DSS violation." If none, write "No known regulatory risk."]
>
> Common frameworks to consider: SOX, PCI DSS, GDPR, CCPA, HIPAA, WCAG 2.1 AA, CAN-SPAM, KYC/AML, Regulation E.

### Data Risk

> [Is data corrupted, lost, or exposed? e.g., "Order total saved as $0 in database when coupon equals cart value -- data integrity failure." If none, write "No data risk identified."]

### Scale

> [How many users are affected and under what conditions? e.g., "All users on iOS Safari 17+ (~18% of mobile traffic)" or "Only affects accounts created before the migration on 2025-01-15 (~200 accounts)."]

---

## Risk Priority

> Use this matrix to communicate urgency objectively.

| Factor      | Rating           | Justification                                     |
|-------------|------------------|----------------------------------------------------|
| Likelihood  | High / Med / Low | [How likely is a user to hit this? Every time? Rare edge case?] |
| Impact      | High / Med / Low | [How bad is it when they do? Data loss? Mild annoyance?]        |
| **Risk**    | **[Result]**     | **Risk = Likelihood x Impact** (see matrix below)  |

### Risk Matrix

|                    | **Impact: Low** | **Impact: Med** | **Impact: High** |
|--------------------|-----------------|-----------------|-------------------|
| **Likelihood: High** | Medium        | High            | Critical          |
| **Likelihood: Med**  | Low           | Medium          | High              |
| **Likelihood: Low**  | Low           | Low             | Medium            |

---

## Recommended Fix Priority

> **Priority: [P0 / P1 / P2 / P3]**

| Priority | Meaning                              | Typical SLA          |
|----------|--------------------------------------|----------------------|
| P0       | Fix immediately, interrupt sprint    | Hours                |
| P1       | Fix this sprint                      | Days                 |
| P2       | Fix next sprint                      | 1-2 weeks            |
| P3       | Backlog, fix when convenient         | When capacity allows |

**Justification:** [Explain why this priority level is appropriate given the risk assessment and business impact above. e.g., "Risk is High (likely + revenue-impacting), but a workaround exists (users can switch payment method), so P1 rather than P0."]

---

## Impact

### User Impact

> [How does this affect the end user? Can they complete their task? What is the degraded experience?]

### Business Impact Summary

> [One-sentence summary referencing the detailed Business Impact section above. e.g., "Blocks ~30% of revenue through guest checkout with no workaround."]

---

## Evidence

### Screenshots

> _Path: `output/sessions/[session-id]/screenshots/[filename].png`_

### Console Errors

```
[Paste any relevant console errors here]
```

### Network Failures

```
[Paste any failed requests -- method, URL, status code, response body excerpt]
```

### Additional Logs

```
[Any other diagnostic output -- application logs, state dumps, etc.]
```

---

## Additional Context

> [Any other relevant information: related bugs, recent deploys, feature flags, user reports, etc.]
