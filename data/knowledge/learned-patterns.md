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