# Learned Patterns

_Seeded from community exploratory testing sessions. Add your own via /qa-explore-feedback._

## False Positive Patterns (skip these)

Findings that looked real on a first read and did not survive tracing. Check the
disqualifier before filing any of these.

- **"Errors are swallowed instead of retried"** (backend queue handlers): before filing, read the
  wrapper that invokes the handler. A `return false` and a thrown exception often converge on the
  same partial-batch-failure path, so retry and DLQ semantics are identical. *Disqualifier: the
  wrapper's catch block reports the same unprocessed records the `false` path does.*
- **"Alerting severity regressed from fatal to error"**: check the logger's metric config first.
  If `pushOnError` and `pushOnFatal` are both true, nothing changes operationally. *Disqualifier:
  both flags set.*
- **"This cleanup/deletion script is dangerous"**: read it to the end before calling it a safety
  defect. Dry-run defaults, cross-checks against another source of truth, and fail-closed error
  handling are common and often present. *Disqualifier: it dry-runs by default and aborts rather
  than proceeding when its safety check fails.* Scope creep may still be a valid, separate finding.
- **"The branch's tests fail"** — rule out your own harness first. A mis-resolved workspace
  dependency, stale build, or wrong Node version produces errors that look exactly like product
  defects. *Disqualifier: it passes once the harness is corrected.* File nothing until you have
  re-run clean.
- **"A value never arrives / is never written"**: trace it to the persistence or serialization
  layer before claiming absence. *Disqualifier: some earlier step already stamps it.*
- **"No evidence record exists, so the work was not done"**: absence of an evidence record is not
  evidence of absence. *Disqualifier: measuring the data shows it is already in the desired state.*
- **"The result count changed, so it is a regression"**: counts drift with the data and differ per
  environment. *Disqualifier: the two numbers come from different environments, or from runs days
  apart on a collection that changes.* Compare status codes and response shapes instead.
- **"It behaves differently in staging, so the deploy is broken"**: check the configuration before
  the deployment. *Disqualifier: both environments report the same build, and a flag or config
  value selects a different code path in each.* That is still a finding — just a different one.
- **"It only reproduces after editing client-side storage / typing a URL the product never
  surfaces"**: no user vector, so not a defect on its own. *Disqualifier: no affordance anywhere in
  the product reaches that state.* **Then go looking for one** — see the triage patterns below,
  because this disqualifier is wrong more often than any other on this list.
- **"The behaviour is inconsistent across surfaces"** where the requirement was never written:
  route it to product as a requirements gap and a negative-space observation, not as a bug.
  *Disqualifier: no acceptance criterion, spec or design covers it, and both behaviours are
  defensible.*

## Triage and Re-Verification Patterns

- **"Closed: no legitimate user vector" is a hypothesis to falsify, not a fact.** When a bug is
  closed because "users cannot reach this", the next session on that surface must actively hunt
  for vectors the triage did not consider — alternative menu entries, help and onboarding
  affordances, query parameters, deep links, other clients. A defect closed on this rationale and
  left broken for a release is a recurring, expensive pattern.
- **"Partial fix" is the most common re-test outcome.** A fix typically addresses the reported
  symptom, not the defect class. When re-verifying anything marked fixed, test the class: the same
  code path with a different trigger, and structurally equivalent surfaces built from the same
  component or pattern. Re-running only the original repro will pass and prove very little.
- **Re-verify against a build, not against a date.** Record the build id or commit of every
  component when the bug was found and again when it is re-tested. A re-run against the same build
  cannot surface a fix, and "it was merged" is not "it is deployed".
- **A fix behind a flag that is off is not a fix.** Re-testing in the one environment where the
  flag is on says nothing about the environments users are in. Say both halves.

## Missed Bug Patterns (always check these)

- **Empty state messaging**: Always check what lists/carts/search results show when empty — should display a user-friendly message, not blank space
- **Brute force / account lockout**: Try 5+ failed login attempts — system should lock account or add delay
- **Footer legal links**: Always verify "Terms of Service" and "Privacy Policy" are clickable and lead somewhere
- **Menu active state**: Navigation items should visually indicate the current page/section
- **Checkout completeness**: Real e-commerce checkouts need delivery address, payment method selection, unique order/shipment IDs
- **Quantity controls**: In e-commerce, always test adding multiple of the same item — is there a quantity selector or just add/remove?
- **Content consistency**: Compare all product/item names for consistent formatting patterns
- **Invalid input in ALL text fields**: Try spaces-only, single characters, emojis in every text input — not just injection payloads
- **Duplicate identifiers**: Order IDs, shipment numbers, transaction IDs should be unique across multiple operations
- **Cart state isolation**: Verify cart/session data is cleared on logout — no leakage between users
- **Password storage**: Check forgot-password flow — if it shows the actual password, passwords aren't hashed
- **API surface exposure**: Check for public Swagger UI, API docs, or WSDL/WADL endpoints accessible without auth

## Domain-Specific Insights

### E-commerce
- Empty cart should show "Your cart is empty" message with CTA to continue shopping
- Product descriptions should not contain code syntax visible to end users
- Checkout flow should collect: name, address, payment method, and generate unique order ID
- Price calculations: test with discounts, tax, multiple quantities, $0 totals
- Test ALL user personas if multiple exist — each may have different bugs

### Fintech
- Session IDs should never appear in URLs (security risk)
- Admin pages should require authentication
- Transfer operations need validation: $0, negative amounts, overdraft, same-account transfer
- Financial calculations must handle decimal precision correctly
- Verify transactions appear in BOTH sender and receiver account histories
- Check for MFA/2FA on sensitive operations
- Loan approval should enforce documented requirements (down payment thresholds, terms disclosure)

### Backend / API / event-driven (no UI surface)

- **A swapped read path is the whole risk.** "Replace X with Y" tickets on a read path are rarely
  mechanical, however small the diff. See `technique-contract-narrowing`.
- **`SELECT *` -> projection drops fields silently.** Trace every field the downstream mapper reads
  to the selection token that requests it. The gap table written in the ticket is a claim to
  falsify, not a specification to trust.
- **Assert on the serialized payload, not the object.** `JSON.stringify` omits `undefined` keys, so
  a mapper that always assigns the key still publishes a payload without it.
- **"Structurally identical" needs a differential test.** One record, both paths, diff the output.
  If the branch does not contain that test, the AC is unverified no matter how green the suite is.
- **Optional-everywhere schemas hide missing data.** Zod `.optional()` / TS optional means the
  response parses fine with the field gone. Tests asserting "parses" and "does not throw" cannot
  falsify equivalence.
- **Check what an AC names before scoring it.** ACs cite Cucumber scenarios, suites, or dashboards
  that sometimes do not exist. That is an AC defect to report, not something to reinterpret.
- **Producers cannot observe downstream filtering.** A test claiming to verify routing must read
  the router or the consumer (rule metrics, target state, DLQ depth) — never the producer's logs.
- **Log-scraping oracles hide a LOG_LEVEL dependency.** If the asserted line is `logger.debug`, the
  suite silently requires debug logging, and "broken flow" is indistinguishable from "quiet logs".
- **Read the infra value, do not infer it.** A committed `.tf` value is not proof of a deployed
  attribute. Without account access the verdict is `BLOCKED` — write the probe commands out ready
  to run rather than inferring `PASS` from source.
- **Scan the diff for what the ticket did not ask for.** Lockfile regenerations, CI jobs, steering
  docs, and validation tweaks ride along and consume the review attention the real change needed.
- **Grep committed files for real identifiers.** UIDs, customer emails, and staff contacts turn up
  in incident notes and fixtures. In any system handling personal data that is a compliance
  finding, not just untidiness.
- **Ask whether anyone consumes the field.** A dropped field nobody reads is a documentation fix,
  not a code fix. Say so explicitly — it is usually answerable only by the consuming team, and
  naming that unknown is more useful than assuming severity.

### HTTP endpoints — what a browser can never show you

- **Fingerprint before you probe.** Which build is deployed in every component of the path, and
  whether the changed path is even selected here. Same build plus different behaviour means
  configuration, not deploy lag. See `technique-environment-fingerprinting`.
- **A client-side guard is not the endpoint's contract.** "The button is disabled until you type"
  describes the browser. Call the endpoint the way the guard is preventing before recording a
  `PASS` — an empty body, a filter with no query, a pagination value the control cannot produce.
  These are the cases that reach every non-browser client. See `technique-ui-api-differential`.
- **`200` is not a pass.** A login page returns `200`. So does an error body, a zero-row page with a
  non-zero count, and a silently rejected filter value. Read the body.
- **Group the crash family.** Nine inputs that `500` on the same unescaped character are one bug
  with nine examples. Find the shared character before writing anything up.
- **Metacharacters are ordinary when the data contains them.** If real values carry brackets,
  colons or asterisks, copying a value out of a result and pasting it back in is a normal user
  action — and the fastest route from an "edge case" to a customer report.
- **Probe the four kinds of nothing separately.** Empty string, `null`, whitespace-only and the
  field absent are four different requests, and they routinely behave four different ways. One of
  them is often a match-all that returns the entire collection.
- **Check the cap is code, not documentation.** A `limit` above the documented maximum that is
  honoured anyway is both an availability risk and a bulk-extraction path.
- **An invalid enum answered with `200` and an empty list will be read as data.** Expect a `4xx`
  with an error body; silent rejection is a finding. See `technique-silent-failure-audit`.
- **Repeat one read as a second identity and in a second scope.** A read that ignores tenant,
  market or ownership is a data-exposure finding no UI session will surface.
- **Compare shapes across environments, never counts.** Different data, drifting under you.
- **Run the request from inside the authenticated page.** `fetch` with the session's own cookies
  needs no token plumbing, survives SSO and MFA, and keeps the credential in the browser where it
  belongs. See `technique-authenticated-api-probing`.

### Calculated values and what reaches the screen

- **Recompute every derived value from the raw figures in the same response**, using the formula
  from the spec — not from the code under test. Recomputing the implementation's own arithmetic
  proves only that arithmetic is deterministic.
- **Then say what that does not prove.** Both sides came from one payload, so you verified the
  derivation and not the inputs. Name the independent oracle that would close it and whether you
  ran it. See `technique-derived-value-verification`.
- **Pick a negative, a zero, a very large and a very small value, and a single-item case.** Sign
  handling is where derivation breaks; a single-item aggregate is the cleanest comparison against
  any second system, with no aggregation ambiguity.
- **Add the structural invariants** — a total equal to the sum of its parts, one metric bounded by
  another, a derived cost positive. Cheap, and they generalise past the cases you picked.
- **Hold the raw response next to the screen.** A correct payload still reaches the user wrong when
  a formatter guesses what a value is (`value > 1 ? value : value * 100`), a unit is applied twice,
  rounding crosses a threshold, or a truncated figure is presented as a total.
- **A self-contradicting tile is the tell** — a percentage printed above the fraction it came from,
  and the two disagree. One of them is a lie.
- **Attribute a rendering defect to the change that owns it.** It is usually not the backend ticket
  that surfaced it, and it is frequently deployed on one environment and not another. Say plainly
  when the change under test is not at fault. See `technique-presentation-integrity`.
- **Consistent is not causal.** A locale, currency or format setting whose current value happens to
  match the output proves nothing until you change the setting and watch the output follow.
- **Measure timing in the page, cold and warm.** Wrap the request in `performance.now()` and record
  the first, second and third call. A cold path an order of magnitude slower is the number every
  user gets first, and no averaged dashboard shows it.

### Reporting a set of tickets

- **Establish what is deployed before testing anything.** A ticket whose backend is not in the
  build is *not testable here* — testing its UI produces a convincing, meaningless result that
  looks exactly like a data bug and gets filed as one.
- **Keep "not tested" visible.** It disappears between "passed" and "failed" unless the vocabulary
  has a slot for it, and so does "not testable here".
- **Mark a code reading differently from an observation.** 🔍 code-verified-only is `UNVERIFIABLE`,
  not green.
- **Carry-overs get their own section.** Pre-existing defects mixed into a release's results
  inflate the apparent risk of shipping it and bury the findings that belong to it.
- **A deploy landing mid-session invalidates everything measured before it.** Re-fingerprint, keep
  the pre-deploy findings in their own file, and never merge the two into one table.
- **State the tolerance on any baseline comparison.** A few per cent on a large live collection is
  churn. And when a system-wide figure and a per-user figure disagree, name which one describes the
  behaviour the change actually altered.
- **Close with a disposition and its reversal condition**, plus the scope of what you checked when
  it is narrower than the question being asked. See `technique-release-readiness-verification`.

### Findings with no acceptance criterion

- **Write the spec instead of filing ten bugs.** Group by cause, put observed against expected, and
  make the decisions explicit: reject or clamp (reject — silent correction breaks callers that
  trust the value back); an error or an empty result (an error — a silent zero is read as data);
  where validation lives (the layer covering every implementation, never only the client).
- **Rank by what users can reach today**, not by how bad each finding reads. Name which one is live
  in production and which only exists in an environment nobody ships from.
- **Finish with a plain-English reply.** The section that gets the work scheduled is the one the
  person funding the fix can read. See `technique-expected-behaviour-specification`.