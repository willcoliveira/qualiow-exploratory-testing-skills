#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Bash).
 *
 * Code-execution routes that a pre-approved `Bash(playwright-cli:*)`,
 * `Bash(git -C:*)` or a permissive `npx` rule would otherwise let through
 * without a prompt:
 *
 * - `playwright-cli run-code` (direct or via `npx playwright-cli`) runs its
 *   JavaScript in the Playwright node process, not in the browser sandbox —
 *   the `vm` context holding `page` is escapable to the host `process`. It is
 *   used legitimately, so the decision is `ask`: the user confirms every call.
 * - `npx -c/--call <shell>`, and `npx -y`/`-p` of a package outside a short
 *   allowlist, install or run arbitrary code. The decision is `deny`.
 * - `git -c <key>=<value>`, `--config-env`, `--upload-pack`, `--receive-pack`,
 *   `--exec`, `--exec-path=`, `--ext-diff`, `--output` and `-O` /
 *   `--open-files-in-pager` (bundled after other short flags or abbreviated, as
 *   git accepts them) run a program or write an arbitrary file from an
 *   otherwise read-only git call — the skills pre-approve `git -C <repo> …` for
 *   the repository under test. So does an environment assignment in front of
 *   git (`GIT_PAGER=`, `GIT_EXTERNAL_DIFF=`, `GIT_CONFIG_*`, `PAGER=`, …) or an
 *   `export` in the same command line. And `git -C <path> <subcommand>` is
 *   limited to the read-only subcommands the skills use; anything else
 *   (config, checkout, fetch, branch -D, …) changes the repository or its
 *   configuration. The decision is `ask`.
 *
 * Compound commands are split on `&&`, `||`, `;`, `|`, `&` and newlines;
 * leading `VAR=value` assignments and `env`/`command`/`exec`/`time`/`nohup`
 * wrappers are skipped; `bash|sh|zsh -c '<cmd>'`, `eval`, `$(…)`, `<(…)` and
 * backticks are inspected as nested commands. A `deny` anywhere wins over an
 * `ask`.
 *
 * Node built-ins only — a git-sourced plugin install has neither `dist/` nor
 * `node_modules`. Never throws and never blocks on its own failure: any error
 * here lets the command through (exit 0, no stdout) to the normal permission
 * check rather than breaking the caller because of a hook bug.
 */
import { readFileSync } from 'node:fs';

const NPX_ALLOWED_PACKAGES = new Set(['playwright-cli', '@playwright/cli', 'qualiow-exploratory-testing']);
const PLAYWRIGHT_CLI_NAMES = new Set(['playwright-cli', '@playwright/cli']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'time', 'nohup']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const ENV_BUILTINS = new Set(['export', 'declare', 'typeset', 'readonly']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MAX_DEPTH = 4;

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

/** Index just past the bracket that closes the one at `start`, honouring quotes. */
function skipBalanced(s, start, open, close) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') i++;
      continue;
    }
    if (c === '\\') i++;
    else if (c === "'" || c === '"') quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  return s.length;
}

/**
 * Splits a command line into segments of words. Honours single and double
 * quotes and backslash escapes; splits on unquoted && || ; | & and newlines.
 * `$(…)`, `<(…)`, `>(…)`, `${…}` and backtick spans stay inside the word they
 * appear in (so `X=$(git …)` is one assignment word); the bodies of the
 * command substitutions are returned in `nested`, to be checked on their own.
 */
function parse(command) {
  const segs = [];
  const nested = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segs.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
      continue;
    }
    if ((c === '$' || c === '<' || c === '>') && command[i + 1] === '(') {
      const end = skipBalanced(command, i + 1, '(', ')');
      nested.push(command.slice(i + 2, end - 1));
      word += command.slice(i, end);
      inWord = true;
      i = end - 1;
    } else if (c === '$' && command[i + 1] === '{') {
      const end = skipBalanced(command, i + 1, '{', '}');
      word += command.slice(i, end);
      inWord = true;
      i = end - 1;
    } else if (c === '`') {
      let j = i + 1;
      while (j < command.length && command[j] !== '`') j += command[j] === '\\' ? 2 : 1;
      nested.push(command.slice(i + 1, j));
      word += command.slice(i, j + 1);
      inWord = true;
      i = j;
    } else if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (c === ';' || c === '|' || c === '&' || c === '\n') {
      endSegment();
    } else if (c === ' ' || c === '\t' || c === '(' || c === ')' || c === '{' || c === '}') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endSegment();
  return { segs, nested };
}

/** `$(…)`, `<(…)` and backtick bodies anywhere in the text (quoted ones too), inspected as nested commands. */
function substitutions(command) {
  const found = [];
  for (const m of command.matchAll(/[$<>]\(([^()]*)\)/g)) found.push(m[1]);
  for (const m of command.matchAll(/`([^`]*)`/g)) found.push(m[1]);
  return found;
}

function basename(word) {
  const parts = word.split('/');
  return parts[parts.length - 1];
}

/** `@scope/name@1.2.3` → `@scope/name`, `name@latest` → `name`. */
function packageName(spec) {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(0, at) : spec;
}

function runCodeIn(words) {
  return words.includes('run-code');
}

/**
 * A segment that changes the environment of the commands after it: `export`,
 * `declare`, … or a bare assignment to a variable that is already exported
 * (assigning `PAGER=` in the shell changes what a later `git` sees).
 */
function changesEnv(words) {
  if (words[0] === 'set') return words.some((w) => /^-[A-Za-z]*a/.test(w) || w === 'allexport');
  if (ENV_BUILTINS.has(words[0])) return true;
  return (
    words.every((w) => ASSIGNMENT.test(w)) &&
    words.some((w) => Object.prototype.hasOwnProperty.call(process.env, w.slice(0, w.indexOf('='))))
  );
}

const ASK_RUN_CODE =
  'ask:playwright-cli run-code executes JavaScript in the Playwright node process (outside the browser sandbox); ' +
  'confirm the code is yours and contains no text taken from page content. Set QUALIOW_HOOKS=off to disable.';

const ASK_GIT_ENV =
  'ask:an environment assignment or export next to git (GIT_PAGER, GIT_EXTERNAL_DIFF, GIT_CONFIG_*, PAGER, ' +
  'LESSOPEN, EDITOR, …) can make it run a program; confirm the assignment is intended.';

// Long git options that run a program or write a file. git accepts any unambiguous
// abbreviation of a long option, so a prefix of at least `min` characters counts.
const GIT_EXEC_LONG = [
  { name: 'upload-pack', min: 3 },
  { name: 'receive-pack', min: 3 },
  { name: 'exec', min: 3 },
  { name: 'ext-diff', min: 3 },
  { name: 'output', min: 3 },
  { name: 'config-env', min: 3 },
  { name: 'open-files-in-pager', min: 2 },
];

// Global options that take the next word as their value.
const GIT_GLOBAL_WITH_VALUE = /^(-C|-c|--git-dir|--work-tree|--namespace|--config-env|--super-prefix|--attr-source)$/;

// `git -C <path> <subcommand>`: the read-only subcommands the skills use. `branch`,
// `tag` and `remote` are read-only only in their listing forms (gitReadOnly).
const GIT_READ_ONLY = new Set([
  'diff',
  'show',
  'log',
  'rev-parse',
  'merge-base',
  'ls-files',
  'ls-tree',
  'cat-file',
  'grep',
  'status',
  'blame',
  'describe',
  'for-each-ref',
  'rev-list',
  'shortlog',
  'name-rev',
]);
const BRANCH_LIST_TRIGGER = /^(--list|-l|-a|--all|-r|--remotes|--show-current|--contains(=.*)?)$/;
const BRANCH_LIST_OPTION =
  /^(-[larvi]+|--list|--all|--remotes|--show-current|--verbose|--ignore-case|--no-color|--no-column|--no-abbrev|--omit-empty|--(no-)?contains(=.*)?|--(no-)?merged(=.*)?|--points-at(=.*)?|--format=.*|--sort=.*|--color(=.*)?|--column(=.*)?|--abbrev(=.*)?)$/;
const TAG_LIST_OPTION =
  /^(-(l|i|n\d*)+|--list|--ignore-case|--no-color|--no-column|--omit-empty|--(no-)?contains(=.*)?|--(no-)?merged(=.*)?|--points-at(=.*)?|--format=.*|--sort=.*|--color(=.*)?|--column(=.*)?)$/;

/** The option word as git would act on it, when it runs a program or writes a file; else null. */
function gitExecWord(word) {
  if (/^-[^-]/.test(word)) return word.includes('O') ? '-O' : null;
  if (/^--exec-path=/.test(word)) return '--exec-path';
  const m = /^--([a-z-]+)(=|$)/.exec(word);
  if (!m) return null;
  const hit = GIT_EXEC_LONG.find((o) => m[1].length >= o.min && o.name.startsWith(m[1]));
  return hit ? `--${hit.name}` : null;
}

function gitReadOnly(sub, args) {
  if (GIT_READ_ONLY.has(sub)) return true;
  const options = args.filter((a) => a.startsWith('-'));
  if (sub === 'branch') return options.some((o) => BRANCH_LIST_TRIGGER.test(o)) && options.every((o) => BRANCH_LIST_OPTION.test(o));
  if (sub === 'tag') return options.some((o) => o === '-l' || o === '--list') && options.every((o) => TAG_LIST_OPTION.test(o));
  if (sub === 'remote') {
    if (args.length === 1 && (args[0] === '-v' || args[0] === '--verbose')) return true;
    return args[0] === 'get-url' && args.slice(1).every((a) => !a.startsWith('-') || a === '--push' || a === '--all');
  }
  return false;
}

/** 'ask:<reason>' or null for the words after `git`. */
function checkGit(args, envChanged) {
  if (envChanged) return ASK_GIT_ENV;
  let k = 0;
  let withC = false;
  // Global options before the subcommand: `-c` is a config override there (and a
  // harmless diff flag after it, as in `git log -c`).
  while (k < args.length && args[k].startsWith('-')) {
    if (args[k] === '-c') return `ask:git -c can set a config value that runs a program (core.pager, …); confirm it is intended.`;
    if (args[k] === '-C') withC = true;
    k += GIT_GLOBAL_WITH_VALUE.test(args[k]) ? 2 : 1;
  }
  const globals = args.slice(0, k).filter((w, n, all) => n === 0 || !GIT_GLOBAL_WITH_VALUE.test(all[n - 1]));
  const sub = args[k];
  const subArgs = args.slice(k + 1);
  const option = [...subArgs, ...globals].map(gitExecWord).find(Boolean);
  if (option) return `ask:git ${option} can run a program or write an arbitrary file; confirm it is intended.`;
  if (withC && sub !== undefined && !gitReadOnly(sub, subArgs)) {
    return (
      `ask:git -C <path> ${sub} is not one of the read-only git subcommands the skills pre-approve ` +
      '(diff, show, log, rev-parse, merge-base, ls-files, grep, status, …); confirm it is intended.'
    );
  }
  return null;
}

/** Returns 'deny:<reason>', 'ask:<reason>' or null for one segment's words. */
function checkWords(words, ctx, depth) {
  let i = 0;
  let assigned = false;
  while (i < words.length && ASSIGNMENT.test(words[i])) {
    assigned = true;
    i++;
  }
  while (i < words.length && WRAPPERS.has(basename(words[i]))) {
    i++;
    while (i < words.length && (ASSIGNMENT.test(words[i]) || words[i].startsWith('-'))) {
      if (ASSIGNMENT.test(words[i])) assigned = true;
      i++;
    }
  }
  if (i >= words.length) return null;
  const program = basename(words[i]);
  const rest = words.slice(i + 1);

  if (SHELLS.has(program)) {
    const c = rest.findIndex((w) => /^-[a-z]*c$/.test(w));
    if (c >= 0 && rest[c + 1] != null) return checkCommand(rest[c + 1], ctx, depth + 1);
    return null;
  }
  if (program === 'eval') return checkCommand(rest.join(' '), ctx, depth + 1);

  if (program === 'playwright-cli') return runCodeIn(rest) ? ASK_RUN_CODE : null;

  if (program === 'git') return checkGit(rest, assigned || ctx.envChanged);

  if (program !== 'npx') return null;

  let yes = false;
  const packages = [];
  let j = 0;
  for (; j < rest.length; j++) {
    const w = rest[j];
    if (w === '--') {
      j++;
      break;
    }
    if (!w.startsWith('-')) break;
    if (w === '-c' || w === '--call' || w.startsWith('--call=')) {
      return 'deny:npx -c/--call runs an arbitrary shell string; call the tool directly instead. Set QUALIOW_HOOKS=off to disable.';
    }
    if (w === '-y' || w === '--yes' || w.startsWith('--yes=')) yes = true;
    else if (w === '-p' || w === '--package') {
      if (rest[j + 1] != null) packages.push(rest[++j]);
    } else if (w.startsWith('--package=')) packages.push(w.slice('--package='.length));
  }
  const command = rest.slice(j);
  const candidates = packages.length ? packages : command.length ? [command[0]] : [];
  if (packages.length || yes) {
    const unknown = candidates.map(packageName).filter((p) => !NPX_ALLOWED_PACKAGES.has(p));
    if (unknown.length) {
      return (
        `deny:npx would install and run ${unknown.join(', ')}, which is not on the qualiow allowlist ` +
        `(${[...NPX_ALLOWED_PACKAGES].join(', ')}). Install it deliberately instead. Set QUALIOW_HOOKS=off to disable.`
      );
    }
  }
  if (command.length) {
    const bin = PLAYWRIGHT_CLI_NAMES.has(packageName(command[0])) ? 'playwright-cli' : basename(command[0]);
    if (bin === 'playwright-cli' && runCodeIn(command.slice(1))) return ASK_RUN_CODE;
  }
  return null;
}

/** Worst decision across every segment and nested command. */
function checkCommand(command, ctx, depth = 0) {
  if (typeof command !== 'string' || depth > MAX_DEPTH) return null;
  const { segs, nested } = parse(command);
  const inner = { ...ctx, envChanged: ctx.envChanged || segs.some(changesEnv) };
  let ask = null;
  const bodies = [...new Set([...nested, ...substitutions(command)])];
  const results = [...bodies.map((s) => checkCommand(s, inner, depth + 1)), ...segs.map((w) => checkWords(w, inner, depth))];
  for (const r of results) {
    if (!r) continue;
    if (r.startsWith('deny:')) return r;
    ask = ask || r;
  }
  return ask;
}

try {
  if (process.env.QUALIOW_HOOKS === 'off') process.exit(0);

  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }
  if (!raw || !raw.trim()) process.exit(0);

  const input = JSON.parse(raw);
  if (input.tool_name !== 'Bash') process.exit(0);

  const command = (input.tool_input || {}).command;
  if (!command || typeof command !== 'string') process.exit(0);

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const result = checkCommand(command, { cwd, envChanged: false });
  if (result && result.startsWith('deny:')) decide('deny', result.slice('deny:'.length));
  else if (result && result.startsWith('ask:')) decide('ask', result.slice('ask:'.length));
  process.exit(0);
} catch {
  process.exit(0);
}
