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
 *   `--exec`, `--ext-diff` and `--output` run a program or write an arbitrary
 *   file from an otherwise read-only git call — the skills pre-approve
 *   `git -C <repo> …` for the repository under test. The decision is `ask`.
 *
 * Compound commands are split on `&&`, `||`, `;`, `|`, `&` and newlines;
 * leading `VAR=value` assignments and `env`/`command`/`exec`/`time`/`nohup`
 * wrappers are skipped; `bash|sh|zsh -c '<cmd>'`, `eval`, `$(…)` and backticks
 * are inspected as nested commands. A `deny` anywhere wins over an `ask`.
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

/**
 * Splits a command line into segments of words. Honours single and double
 * quotes and backslash escapes; splits on unquoted && || ; | & and newlines.
 */
function segments(command) {
  const out = [];
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
    if (words.length) out.push(words);
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
    if (c === '"' || c === "'") {
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
  return out;
}

/** `$(…)` and backtick bodies, inspected as nested commands. */
function substitutions(command) {
  const found = [];
  for (const m of command.matchAll(/\$\(([^()]*)\)/g)) found.push(m[1]);
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

const ASK_RUN_CODE =
  'ask:playwright-cli run-code executes JavaScript in the Playwright node process (outside the browser sandbox); ' +
  'confirm the code is yours and contains no text taken from page content. Set QUALIOW_HOOKS=off to disable.';

const GIT_EXEC_OPTION = /^(--upload-pack|--receive-pack|--exec|--ext-diff|--output|--config-env)(=|$)/;

/** A git option that runs a program or writes a file outside the read-only calls the skills make. */
function gitExecOption(words) {
  let k = 0;
  // Global options before the subcommand: `-c` is a config override there (and a
  // harmless diff flag after it, as in `git log -c`).
  while (k < words.length && words[k].startsWith('-')) {
    if (words[k] === '-c') return '-c';
    k += /^(-C|--git-dir|--work-tree|--namespace)$/.test(words[k]) ? 2 : 1;
  }
  const hit = words.slice(k).find((w) => GIT_EXEC_OPTION.test(w)) || words.slice(0, k).find((w) => GIT_EXEC_OPTION.test(w));
  return hit ? hit.split('=')[0] : null;
}

/** Returns 'deny:<reason>', 'ask:<reason>' or null for one segment's words. */
function checkWords(words, depth) {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  while (i < words.length && WRAPPERS.has(basename(words[i]))) {
    i++;
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || words[i].startsWith('-'))) i++;
  }
  if (i >= words.length) return null;
  const program = basename(words[i]);
  const rest = words.slice(i + 1);

  if (SHELLS.has(program)) {
    const c = rest.findIndex((w) => /^-[a-z]*c$/.test(w));
    if (c >= 0 && rest[c + 1] != null) return checkCommand(rest[c + 1], depth + 1);
    return null;
  }
  if (program === 'eval') return checkCommand(rest.join(' '), depth + 1);

  if (program === 'playwright-cli') return runCodeIn(rest) ? ASK_RUN_CODE : null;

  if (program === 'git') {
    const option = gitExecOption(rest);
    return option
      ? `ask:git ${option} can run a program or write an arbitrary file; confirm it is intended. Set QUALIOW_HOOKS=off to disable.`
      : null;
  }

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
function checkCommand(command, depth = 0) {
  if (typeof command !== 'string' || depth > MAX_DEPTH) return null;
  let ask = null;
  const nested = substitutions(command).map((s) => checkCommand(s, depth + 1));
  const direct = segments(command).map((w) => checkWords(w, depth));
  for (const r of [...nested, ...direct]) {
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

  const result = checkCommand(command);
  if (result && result.startsWith('deny:')) decide('deny', result.slice('deny:'.length));
  else if (result && result.startsWith('ask:')) decide('ask', result.slice('ask:'.length));
  process.exit(0);
} catch {
  process.exit(0);
}
