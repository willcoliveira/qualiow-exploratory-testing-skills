# Paths and Resolution Order

Every qualiow skill resolves its inputs in the same order, whichever way the skills were
installed (`qualiow init` copy into a project, a Claude Code plugin, or this repository
checked out). Resolve once in the setup phase, then **write the resolved literal prefix in
every command**. Never put a shell variable as the first token of a command line: Claude
Code's permission rules match on the first literal token, so a command that begins with a
variable expansion matches no rule and prompts every time. Write `qa/bin/mcli snapshot`,
not a variable holding that prefix.

## Target config

| Input | Resolution order (first existing wins) |
|---|---|
| `--target <name>` | `$PWD/data/targets/<name>.yml` → `${CLAUDE_PLUGIN_ROOT}/data/targets/<name>.yml` |
| no `--target` | `$PWD/qa/target.yml` → `<data>/targets/_default.yml` |

`qa/target.yml` is the **project-local** target: it lives next to the code under test, is
written by `/qa-target-setup`, and is the right place for anything with internal hostnames.
`data/targets/` holds shared and example targets.

## Data directory (`<data>`)

First existing of: `$PWD/data` → `${CLAUDE_PLUGIN_ROOT}/data` →
`${CLAUDE_SKILL_DIR}/../../data` → `${CLAUDE_SKILL_DIR}/../../../data`. The `qualiow` CLI
resolves the same order — an explicit `--data <dir>`, then `$PWD/data`, then
`$CLAUDE_PLUGIN_ROOT/data`, then the data shipped inside the package.

Read from `<data>`: `domains/<domain>.yml`, `knowledge/manifest.yml`,
`knowledge/releases/<version>/entries/*.yml`, `knowledge/learned-patterns.md`,
`templates/*.md`, `security/SECURITY-POLICY.md`.

**Writes** (learned patterns from `/qa-explore-feedback`, custom entries from
`/qa-knowledge-add`) always go to `$PWD/data/…`; create the directory if it is missing.
Never write into a plugin directory.

## Credentials

`$PWD/qa/.env` → `$PWD/.env`. Target configs name env vars; the values live only in these
files. Read a value when you need it, pass it to the command, and never echo it into a
log, a report, or a command line that will be recorded.

## Mobile driver

First existing of: `$PWD/qa/bin/mcli` → `$PWD/bin/mcli` → `mcli` on `PATH` →
`${CLAUDE_PLUGIN_ROOT}/bin/mcli` → `${CLAUDE_SKILL_DIR}/../../bin/mcli`. Same order for
`wadb`, `wk-ios` and `doctor-mobile.sh`. The mobile phase files show `qa/bin/mcli` (the
default after `qualiow init`); in a checkout of this repository it is `bin/mcli`.
Substitute the prefix you resolved.

## CLI

`qualiow` is the deterministic half of the pack: knowledge digests, session finalization,
listings, archival. First working of:

1. `qualiow` on `PATH` — a marketplace plugin install (its `bin/` is on `PATH`), or a global
   npm install
2. `npx -y -p qualiow-exploratory-testing qualiow` — a project that depends on the npm package
3. `${CLAUDE_PLUGIN_ROOT}/bin/qualiow` — a plugin loaded with `--plugin-dir`
4. `bin/qualiow` — this repository checked out

The npm package is **`qualiow-exploratory-testing`** and the binary it installs is `qualiow`.
Never write bare `npx qualiow`: that spelling resolves a package that does not exist.

Same rule as the mobile driver — resolve once in setup, then write the resolved literal
prefix as the first token of every command. The phase files show `qualiow <command>` for
brevity; substitute the prefix you resolved.

## Output

Always `$PWD/output/`. Never write session output anywhere else.

### Session directory

`output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/`

- `kind` ∈ `explore` | `quick` | `mobile` | `backend`
- `slug` = target id without a leading `_`; mobile: `<target>-<ios|android>`; backend: the
  ticket id or the target id; an ad-hoc URL: the hostname with dots replaced by dashes.
  Lowercase `[a-z0-9-]`, at most 40 characters.
- Date first, so alphabetical order is chronological and "latest" is unambiguous.

`--session <dir>`: when `qualiow explore` (pre-flight) already created the directory, reuse
it instead of creating a second one.

### playwright-cli session id

`-s=<kind>-<HHmm>-<slug>` (for example `-s=explore-1420-parabank`). Every `playwright-cli`
command in the session carries it; the phase files omit the prefix for brevity. The session
ends with `playwright-cli -s=<sid> close` and then `playwright-cli -s=<sid> delete-data`.

### Index rows

`qualiow session finalize <session-dir>` writes both rows (and creates either index file if
it is missing). The formats below are what it appends — write them by hand only when the CLI
is unavailable.

Append to `output/sessions/INDEX.md` (columns `| Date | Kind | Target | Bugs | Duration | Status | Report |`):

```
| <YYYY-MM-DD> | <kind> | <target> | <bugs> | <N> min | complete | <session-dir>/session-report.md |
```

Append one row per bug to `output/bugs/all-bugs.md` (columns `| ID | Session | Title | Severity | Status | Report |`):

```
| BUG-NNN | <session-dir> | <title> | <severity> | open | <session-dir>/bugs/BUG-NNN.md |
```
