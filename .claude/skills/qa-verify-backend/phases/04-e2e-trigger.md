# Phase 4: End-to-End Trigger

Covers the "verified in environment" style of AC: a real change through the real write
path, then re-probe the data layer.

Skip if `--no-e2e`, if the target declares `environment.kind: production` (or the production
rule in `security-rules.md` fired in setup), or if the live lane is BLOCKED. Record the skip
and its reason in the charter and the report.

## Step 1: Capture the Before State

Query the target store and record what exists **before** you touch anything. Without a
before, "a record appeared" cannot be distinguished from "a record was already there".

Also record DLQ depth and the Lambda's error count now.

## Step 2: Trigger Through the Real Path

Prefer the path a real operator uses — the UI. Hand off to `/qa-explore` or drive
`playwright-cli` directly against the target's `base_url`. Make the change
**identifiable**: a value you can search for, containing no real data.

Note the exact wall-clock time of the save and the identity you were logged in as.
Both are needed to judge the resulting record.

If the UI is unavailable, call the write API directly with the same auth — but say so
in the report, because an API-only trigger does not prove the UI's identity
propagation works.

**For a service that has no UI at all, the write API *is* the real path** and no caveat is
owed. Restrict every state-changing call to the target's `api.write_allowlist`; an endpoint
absent from that list stays uncalled even when its verb looks harmless. Where the service
offers a workspace reset, treat it as destructive: it is the one call that erases the
evidence for everything already observed, so make it deliberate and never routine cleanup
between cases.

Conversely, if the UI trigger succeeds, that is not evidence the endpoint accepts what
other clients will send. The client's own guards are still in the path. Phase 3b covers
what happens without them.

## Step 3: Re-Probe and Compare

Give the asynchronous path a moment, then query again and compare against the before
state. Check, in this order:

1. **Count** — exactly the expected number of new records. Zero is a failure. More than
   expected means duplication or fan-out nobody designed for.
2. **Attribution** — the actor equals the user you logged in as. Not a role, not a
   placeholder, not the previous editor.
3. **Fidelity** — the stored snapshot matches what the source store now holds, field for
   field. Compare the actual documents; do not eyeball two summaries. Where the record
   carries derived values, recompute them from the raw figures beside them
   (`${CLAUDE_SKILL_DIR}/references/payload-verification.md`) rather than trusting that they were computed
   once and correctly.
4. **Key shape** — the sort key format matches what the consumer will query and sort by.
5. **Completeness** — every attribute the ACs require is present, with the required type.
   A missing attribute here is a `FAIL` on that AC no matter how well the rest works.

## Step 4: The Adversarial Passes

The happy path passing is the beginning, not the end. Run these — they are where audit
and event pipelines actually break:

- **Same-tick writes.** Save twice as fast as the UI allows. Then count records. If the
  key is time-based at coarse granularity, one write silently overwrote the other.
- **Delete.** Delete an entity and check who the record attributes it to.
- **Bulk save.** A save that writes N items — do you get N attributable records?
- **Second identity.** Repeat as a different user; confirm attribution follows.
- **Isolation.** Change one scope (market/tenant/brand) and confirm no record touched
  another.
- **DLQ after.** Re-check depth. Anything new means the pipeline dropped something
  while you watched.
- **The replayed event.** Send the same event twice — sequentially, then concurrently, then
  with one field altered. Which field the system deduplicates on is rarely the one the
  documentation implies, and "deduplicated" is not the same claim as "applied exactly once":
  check the effect, not just the status.
- **The late event.** Deliver an event *after* a timeout, sweeper or retry has already
  resolved the record. A system that closed the record and then still applies the arriving
  event has two truths at once — and in a money system that is the expensive kind.

Record each with its own evidence file. Any of these that fails is a bug report,
whether or not an AC covers it — the ACs are a floor, not a ceiling.
