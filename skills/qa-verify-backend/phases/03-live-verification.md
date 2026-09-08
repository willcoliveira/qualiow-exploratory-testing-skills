# Phase 3: Live Verification

Skip if the live lane is BLOCKED — but still write every probe command into
`evidence/live-probes.md` so a human with credentials can run them unchanged.

Read `${CLAUDE_SKILL_DIR}/references/aws-readonly-probes.md` for the command catalogue. Read
`${CLAUDE_SKILL_DIR}/references/safety-rules.md` before the first probe, and confirm the fingerprint from
phase 0 step 3c is on file — a probe of an environment that does not run the change
measures something else.

This phase covers the **cloud resources**. The service's own HTTP endpoints are phase 3b
(`${CLAUDE_SKILL_DIR}/phases/03b-api-verification.md`); most tickets need both.

## Rules

- **Read-only only.** `describe-*`, `get-*`, `list-*`, `query`, `scan`,
  `simulate-principal-policy`, `filter-log-events`. Nothing that mutates.
- **One probe per AC.** Paste the raw output into `evidence/` before interpreting it.
  Interpretation without the raw output is an opinion.
- **Confirm resource names first.** Names in a target config are asserted, not proven.
  `list-tables` / `list-functions` before you trust them. A probe against a
  non-existent resource returns an error that reads like a failure but is a typo.
- **Redact before writing to disk.** Real user emails, tokens, consumer PII.

## Per-AC Probes

Work through the matrix. For each AC whose evidence source includes `live`:

1. Run the probe.
2. Save raw output to `evidence/<ac-id>-<resource>.json`.
3. State the verdict and quote the specific field that decides it.

Example write-up:

```
AC4 — stream view type
  probe:  aws dynamodb describe-table --table-name <config> --query 'Table.StreamSpecification'
  raw:    evidence/AC4-config-table.json
  field:  StreamViewType = "NEW_AND_OLD_IMAGES"
  verdict: FAIL — AC requires NEW_IMAGE
```

## Probe the Failure Path, Not Just the Resource

The resource existing proves almost nothing. Add these regardless of what the ACs say:

- **Dead letter queue depth** — a non-zero `ApproximateNumberOfMessages` means events
  are already being lost. Check it before and after the e2e trigger.
- **Lambda error and throttle metrics** over the life of the environment.
- **Event source mapping state** — `Enabled`, `LastProcessingResult`, and whether
  partial-batch reporting is actually configured on the mapping (not just returned by
  the handler code — the handler's return value is ignored without it).
- **Log level in the deployed function's environment** — a debug/trace level on a
  component that logs whole event payloads is a data-exposure finding in any system
  handling personal data.
- **Effective permissions** — `iam simulate-principal-policy` for both the actions the
  component needs and the actions it must **not** have. Proving a denial is as
  important as proving an allow.

## Record

Update `ac-matrix.md` verdicts as you go. Append findings to `evidence/live-review.md`.
