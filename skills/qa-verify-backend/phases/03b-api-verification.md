# Phase 3b: API Verification

Phase 3 asks *"is the resource configured the way the AC says?"*. This phase asks
*"does the endpoint actually behave the way the AC says, for inputs the UI will never
send?"* — the service's own HTTP surface, between the browser and the cloud resources.

Run it whenever the ticket touches a request/response contract: a search or list
endpoint, validation rules, pagination, filter values, an error contract, a payload
shape a consumer reads. Skip it when the change has no HTTP surface at all.

Read `references/api-probes.md` for the mechanics and the case catalogue,
`references/environment-fingerprinting.md` before you believe any result, and
`references/payload-verification.md` once you have one — a well-shaped `200` says nothing
about whether the numbers in it are right.

## Step 1: Prove Which Implementation You Are Probing

**Do this before the first probe, and record it in `evidence/fingerprint.md`.**

A green result against an environment that does not run the changed code proves
nothing, and a red result there is not the ticket's bug. Establish, with evidence:

- the deployed build of every component in the request path (version endpoint, or a
  behavioural fingerprint when there is none),
- whether the changed code path is **selected** here — a feature flag, a config
  toggle, a routing rule can pick between two implementations of the same feature
  inside one identical build,
- whether the commit carrying the change is actually an ancestor of what is deployed.

If the environment does not run the changed path, say so and stop this lane. The
verdict is `NOT-REACHABLE` for that environment (phase 5), not `PASS` and not `FAIL`.

## Step 2: Get an Authenticated Request Context

Preferred: **run the request inside the already-authenticated page**. `fetch` from the
page context carries the session cookie, the CSRF token, and any client interceptors —
the same credentials the UI has — so there is no token to obtain and nothing to store.

```bash
playwright-cli -s=<session> open <base_url> --headed --profile .auth/<profile>   # once
playwright-cli -s=<session> eval "$(cat probes/<probe>.js)" --raw
```

`--headed` matters when login goes through an interactive identity provider: that round
cannot complete headless. `--profile` is what makes it stick — a persistent profile
directory outlives a `storage_state` JSON by a wide margin.

Fall back to an out-of-browser runner (a script driving `curl`) only when you need
volume or a machine-readable matrix. Take the credential from the authenticated profile
(`playwright-cli cookie-list`), keep it in a file outside the repo, and reference it by
path — never inline it into a script, a report, or this repo.

Record which mode produced each result. An in-page probe and a bare `curl` do not prove
the same thing: the first proves the endpoint behaves this way *for a real logged-in
session*, the second proves it behaves this way *for whoever holds that credential*.

## Step 3: Build the Case Matrix Before You Run Anything

Write the cases down first, as data, so the run is repeatable and the evidence is a
table rather than a scroll of output. Derive them from the ACs, then add the standard
families from `references/api-probes.md` — the ACs are a floor:

boundary lengths · tokenisation and whitespace · metacharacters of whatever query
language sits underneath · empty, null, absent and whitespace-only · enum values that
are valid, invalid, empty, wildcard and injected · pagination bounds and types · casing
and normalisation · type confusion on every field.

Each case gets a stable label. That label is what the report, the bug and the re-run all
refer to.

## Step 4: Run, Record Raw, Then Interpret

Capture per case: **HTTP status, the count or shape the caller would read, how many rows
actually came back, elapsed time, and the first line of any error body.** Save the raw
result to `evidence/` — `eval --filename` writes it straight to disk without paying for
it in context — and interpret afterwards.

Read the results for these, in this order:

1. **Status vs shape.** A `200` whose body is an error, or a `200` with `count > 0` and
   zero rows, is worse than a `500` — the caller cannot tell it went wrong.
2. **The silent zero.** An invalid enum, an unknown filter value or an unparseable term
   that returns `200` with an empty result is indistinguishable from a genuine no-match.
   Someone will read it as data.
3. **Unbounded responses.** An empty or absent query that returns the whole collection;
   a `limit` above the documented cap that is honoured anyway.
4. **The crash family.** Group every input that `500`s and find the one character or
   shape they share — that is one bug, not nine.
5. **Inputs the UI cannot produce.** These are not reassurance. The browser guard is the
   only thing preventing them, and mobile clients, integrations and scripts do not have
   it. Judge them on the consequence of the call succeeding, not on how it was reached.

## Step 5: Parity Across Environments

Run the identical matrix in every environment the ticket claims to affect. Then obey the
rule that makes the comparison meaningful:

> **Compare status codes and shapes. Never compare absolute counts.** Different
> environments hold different data, and the data drifts under you.

A divergence in *shape* between two environments running the same build is a
configuration finding — go back to step 1 and name the switch. A divergence in *counts*
is usually nothing.

## Step 5b: Check the Values, Not Just the Shape

A `200` with a well-formed body has proven the contract, not the content. For every derived
value the ACs mention — a percentage, total, ratio, delta or aggregate — recompute it from
the raw figures in the same response, using the formula from the **specification** rather
than from the code under test. Pick cases that stress sign, zero, scale and cardinality,
and add the structural invariants the values must satisfy regardless of magnitude.

Then write down what the check does not prove: when both sides come from one payload you
have verified the derivation, not the inputs. Name the independent oracle that would close
it, and say whether you ran it. Full guidance in `references/payload-verification.md`.

## Step 6: The Differential Pass — the Same Matrix at Both Surfaces

If the ticket also has a UI, run the overlapping cases through the screen too, and sort
every finding into four buckets:

| Bucket | Meaning |
|--------|---------|
| **Both** | The UI faithfully reflects the endpoint. Fix it once, in the service. |
| **API only** | A real defect the UI's own guard is hiding. Reachable by every non-browser client. |
| **UI only** | The client invents or masks a behaviour the service does not have — an error rendered as an empty result, a value re-formatted, a field dropped. |
| **Neither** | Environment or access noise, not a product defect. |

Hold the raw response next to every number on screen while you do this. A correct payload
can still reach the user as a wrong value — a formatter that guesses what a value is, a
unit applied twice, rounding that crosses a threshold, truncation shown as a total. When it
happens, work out which change owns the corruption before filing it; it is frequently not
the change under test, and it is frequently deployed on one environment and not another.

Two corrections this pass reliably produces, both worth stating explicitly in the
report:

- **A client-side guard recorded as a pass is not a pass.** "The button is disabled
  until you type" describes the client, not the endpoint. Call the endpoint the way the
  guard is preventing before you write `PASS`.
- **A discrepancy between what the endpoint returns and what the screen shows is its own
  defect**, independent of the endpoint's behaviour, and it belongs to the client team.

## Read-Only Discipline

The API lane calls **read** endpoints only. Reads that the ticket's own ACs describe,
plus the standard families above, against endpoints the target's `api.probe_allowlist`
declares. Anything that creates, mutates or deletes belongs to phase 4, goes through the
real write path, and never runs against production. See `references/safety-rules.md`.

Response bodies are real records. Redact before they touch the disk.

## Record

Update `ac-matrix.md` as you go, one row per AC, each verdict naming the environment it
holds in. Write the case table to `evidence/api-probe-matrix.md` using
`data/templates/api-probe-matrix.md`.
