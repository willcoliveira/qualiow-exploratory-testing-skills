# Environment Fingerprinting — Prove What Is Running Before You Judge It

A verdict is a claim about code. A probe is an observation of an environment. They are
only the same thing if the environment runs that code — and often it does not.

Do this **before the first probe of any lane**, and write the result to
`evidence/fingerprint.md`. It costs a few minutes and it is the difference between a
report and a guess.

## The Three Questions

### 1. Which build is deployed, in every component of the path?

A request usually crosses more than one deployable. Fingerprint each of them, not just
the one the ticket names.

```bash
# whatever the service exposes
curl -s https://service-alpha.example.com/api/v1/version
curl -s https://service-alpha.example.com/version.json
```

Record build id, timestamp and commit for each component. A frontend from this week in
front of a gateway from last month is the normal case, not the exception, and it
explains most "the UI shows nothing" reports without any bug being involved.

**When there is no version endpoint, fingerprint behaviourally.** Pick two or three
inputs whose answer differs between the old and the new implementation, and use the
answers as the identifier:

| Probe | Answer | Means |
|-------|--------|-------|
| the input the fix was written for | works | the fix is present |
| the input the fix was written for | old behaviour | the fix is absent, **or** a different implementation is serving this path |
| an out-of-range parameter | `400` | the validation change is present |
| an out-of-range parameter | `500` | it is not |

Write the table down. It becomes the cheapest possible deployment check for everyone
after you.

### 2. Is the changed code path *selected* here?

This is the question that gets skipped, and it is the one that invalidates whole
sessions. One identical build can contain two implementations of the same feature, with
a flag, an environment variable, a config value or a routing rule choosing between them.

> **Same build, opposite behaviour ⇒ configuration, not deploy lag.**

If two environments return the same commit hash and behave differently, stop looking for
a missing deployment and go find the switch. Read its value **from the environment's own
configuration**, not from the default in the code:

```bash
# the deployed value, wherever it is declared for this environment
grep -rn "<FLAG_NAME>" <deployment-config-path>
```

Then state the consequence plainly. When the flag is off in the environments that
matter, a fix that only lands behind the flag has not reached a single user, and
**flipping it is a separate decision with its own risk** — often introducing regressions
of its own. That belongs in the report as a finding, not as a footnote.

Two implementations of one feature is itself worth reporting: it means every fix has to
be written twice, and the copy nobody is testing is usually the one production runs.

### 3. Is the commit actually deployed?

Do not infer it from a merge date.

```bash
git -C <repo> merge-base --is-ancestor <commit-under-test> <deployed-commit> \
  && echo DEPLOYED || echo NOT DEPLOYED
```

Run it for every commit the ticket depends on. "Not an ancestor" is evidence; "it was
merged three weeks ago" is not.

## What It Changes About the Verdict

Every verdict is scoped to an environment. Once the fingerprint is on the table:

| Situation | Verdict |
|-----------|---------|
| Changed path runs here, behaves as the AC says | `PASS` in this environment — name it |
| Changed path runs here, behaves otherwise | `FAIL` |
| Changed path is **not selected or not deployed** here | `NOT-REACHABLE` — never `PASS`, never `FAIL` |
| Verified only in an environment that runs a different implementation | `UNVERIFIABLE` for the environment that matters |

A `PASS` in the only environment where the flag is on is a true statement about that
environment and a misleading one about the release. Say both halves.

## Common Shapes

- **Frontend/backend skew.** The UI ships a feature whose API is not deployed. Renders as
  empty values, dashes or zeros — and gets filed as a data bug.
- **Flag-selected duplicate implementations.** Described above. The most expensive of the
  set, because the fix looks done.
- **A separate deployable.** The fix lives in a service the ticket does not name, with its
  own release train. Its version is not in the gateway's build id.
- **Environment-specific data.** Different collection sizes, different seed data,
  different tenants. This is why only shapes and status codes compare across
  environments — never counts.
- **Cached or edge-served responses.** The origin has the fix; the response you are
  reading does not. Check the cache headers before reporting a stale answer as a bug.
