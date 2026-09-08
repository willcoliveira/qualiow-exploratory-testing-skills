# Phase 1: AC Decomposition

Turn prose acceptance criteria into falsifiable checks **before** you look at the
implementation. Doing this first is what stops you from rationalising whatever the
code happens to do.

## For Each AC, Write

| Field | Meaning |
|-------|---------|
| **ID** | AC1, AC2… as numbered in the ticket |
| **Claim** | The AC restated as a single falsifiable statement |
| **Evidence source** | `static` (file+line), `live` (cloud probe command), `api` (request + raw response), `e2e` (trigger + re-probe), or a combination |
| **Falsifier** | What observation would prove this AC false — name it now |
| **Consumer** | Which downstream ticket/system depends on this being true in a particular shape |

Example:

```
AC4: "DynamoDB Stream (NEW_IMAGE) is enabled on the existing config table"
  Claim:      The config table's stream is enabled with view type exactly NEW_IMAGE.
  Evidence:   static → the table resource in IaC; live → describe-table StreamSpecification
  Falsifier:  StreamViewType is anything other than NEW_IMAGE, or StreamEnabled is false
  Consumer:   the stream Lambda's mapper — if OldImage is absent, delete handling changes
```

## Flag Untestable ACs

An AC is untestable when it has no observable falsifier. Common shapes:
- **Unbounded removal** — "all X are removed". Removed from where? Define the search
  space (this repo, this module, this account) and say which you checked.
- **Manual data work** — "garbage entries are cleaned up". Cleaned up in which
  environments? A merged runbook is not executed work.
- **Vague quality words** — "clean", "maintainable", "simple". Convert to something
  countable or mark it as not independently verifiable.
- **A guard described as a behaviour** — "the user cannot submit an empty search". That is
  a statement about the client. Restate it as the endpoint's contract ("an empty query
  returns 400 with an error body") and route it to the `api` lane. If the ticket only ever
  meant the client, say so and add the endpoint's behaviour as a negative-space check.

## Name the Environment in the Claim

Every claim is a claim about an environment. Write it in: *"in staging, an empty query
returns 400"*. An AC verified in one environment and asserted for another is the single
most common false `PASS` this skill exists to prevent — see
`${CLAUDE_SKILL_DIR}/references/environment-fingerprinting.md`.

Report these as **DoR gaps**, not as failures of the developer. They are ticket-writing
defects and they belong in the report — an untestable AC will be marked done by whoever
is under the least time pressure.

## Add Domain Checks

From `<data>/domains/<domain>.yml`, pull the `data_integrity_checks` and add any that this
change touches but the ticket never mentions. These become findings in the
**negative space** — the things the ACs forgot to require.

Write the skeleton matrix to `ac-matrix.md` with every verdict set to `PENDING`.
