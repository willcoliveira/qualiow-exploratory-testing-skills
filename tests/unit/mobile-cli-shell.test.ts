import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-ignore — untyped ESM driver script; the pure helpers are imported for testing.
import { shq, validateAppId, isComponentName, maestroLiteral, stripControls, assignRefs, EXIT } from '../../bin/mobile-cli.mjs';

const MCLI = resolve(process.cwd(), 'bin', 'mobile-cli.mjs');

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

// Maestro 2.x Env.evaluateScripts, transcribed: evaluate `${...}` not preceded by a
// backslash, then strip the backslash from `\${...}`. `eval` here only tags the span.
function maestroEvaluate(s: string): string {
  const evaluated = s.replace(/(?<!\\)\$\{([^$]*)\}/g, (_m, js) => `<EVAL:${js}>`);
  return evaluated.replace(/\\\$\{([^$]*)\}/g, (m) => m.slice(m.indexOf('\\') + 1));
}

describe('shq — quoting for the device shell', () => {
  it('single-quotes and escapes embedded quotes', () => {
    expect(shq('a b')).toBe("'a b'");
    expect(shq("it's")).toBe("'it'\\''s'");
    expect(shq('')).toBe("''");
  });

  it('round-trips metacharacters through a real POSIX sh', () => {
    const nasty = "myapp://x?id=&n=NaN;touch /nope `id` $(id) 'q' \"d\" | > <";
    const r = spawnSync('sh', ['-c', `printf %s ${shq(nasty)}`], { encoding: 'utf8' });
    expect(r.stdout).toBe(nasty);
  });
});

describe('validateAppId / isComponentName', () => {
  it('accepts bundle ids and package names', () => {
    for (const id of ['com.example.app', 'com.apple.mobilesafari', 'com.my-co.app_1', 'io.x9']) {
      expect(validateAppId(id)).toBe(id);
    }
  });

  it('rejects shell metacharacters, quotes, spaces and option-looking ids', () => {
    for (const id of ['com.x;reboot', 'com.x app', '-n', '"com.x"', 'com.x$(id)', '', 'a/b']) {
      expect(() => validateAppId(id)).toThrow(/Invalid app id/);
    }
  });

  it('only treats pkg/Activity strings as components', () => {
    expect(isComponentName('com.x/.MainActivity')).toBe(true);
    expect(isComponentName('com.x/com.x.Main$Inner')).toBe(true);
    expect(isComponentName('com.x/.Main;touch /x')).toBe(false);
    expect(isComponentName('No activity found')).toBe(false);
  });
});

describe('maestroLiteral — typed text is never evaluated as JS', () => {
  const cases = [
    'plain text', '${7*7}', 'a ${x} b ${y} c', '\\${7*7}', '${a$b}', '${unclosed',
    '$${x}}', 'pre {${1}} } post', "${http.post('http://x')}", '\\\\${z}', '} ${ } ${}',
  ];
  it.each(cases)('arrives verbatim after Maestro evaluation: %s', (text) => {
    expect(maestroEvaluate(maestroLiteral(text))).toBe(text);
  });

  it('control: unescaped text IS evaluated by the transcribed Maestro logic', () => {
    expect(maestroEvaluate('${7*7}')).toBe('<EVAL:7*7>');
  });
});

describe('stripControls / snapshot output', () => {
  it('drops ESC, BEL and C1 controls', () => {
    expect(stripControls('a\u001b[2Jb\u0007c\u009bd')).toBe('a[2Jbcd');
    expect(stripControls('l1\nl2\tx\r', { keepNewlines: true })).toBe('l1\nl2\tx');
  });

  it('assignRefs never prints terminal escapes from app labels or ids', () => {
    const json = {
      attributes: { bounds: '[0,0][100,100]' },
      children: [{ attributes: { text: 'Hi\u001b]0;pwned\u0007 there', 'resource-id': 'id\u001b[31m', bounds: '[0,0][50,50]' } }],
    };
    const { tree } = assignRefs(json);
    expect(tree).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(tree).toContain('Hi]0;pwned there');
  });
});

// A stub adb that behaves like the real one for `shell`: join the arguments with spaces
// and hand the string to sh -c, where "device" commands are logging stubs.
const describeSh = process.platform === 'win32' ? describe.skip : describe;
describeSh('mobile-cli against a stub adb (device-side re-parse)', () => {
  function setup(extraDevice: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'mcli-shell-'));
    tmpDirs.push(dir);
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'device'));
    const log = join(dir, 'device.log');
    writeFileSync(join(dir, 'bin', 'adb'), [
      '#!/bin/sh',
      'while [ "$1" = "-s" ]; do shift 2; done',
      'if [ "$1" = "shell" ]; then shift; CMD="$*"; PATH="$DEVICE_BIN:$PATH" sh -c "$CMD"; fi',
      '',
    ].join('\n'));
    // Each device command logs one argv per line, so truncation or splitting is visible.
    const logger = (name: string) => `#!/bin/sh\necho "${name}" >> "$DEVICE_LOG"; for a; do echo "  [$a]" >> "$DEVICE_LOG"; done\n`;
    for (const name of ['am', 'monkey', 'rm', 'kill', 'pm']) writeFileSync(join(dir, 'device', name), logger(name));
    for (const [name, body] of Object.entries(extraDevice)) writeFileSync(join(dir, 'device', name), body);
    writeFileSync(join(dir, 'bin', 'maestro'), '#!/bin/sh\nfor a; do case "$a" in *.yaml) cat "$a" > "$FLOW_OUT";; esac; done\n');
    for (const d of ['bin', 'device']) {
      for (const f of ['adb', 'maestro', 'am', 'monkey', 'rm', 'kill', 'pm', ...Object.keys(extraDevice)]) {
        const p = join(dir, d, f);
        if (existsSync(p)) chmodSync(p, 0o755);
      }
    }
    const state = join(dir, 'state.json');
    writeFileSync(state, JSON.stringify({ device: 'emulator-5554', platform: 'android', appId: 'com.example.app', refs: {} }));
    const run = (...args: string[]) => spawnSync(process.execPath, [MCLI, '--state', state, ...args], {
      encoding: 'utf8',
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        DEVICE_BIN: join(dir, 'device'),
        DEVICE_LOG: log,
        FLOW_OUT: join(dir, 'flow.yaml'),
        HOME: dir,
      },
    });
    const deviceLog = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    return { dir, state, run, deviceLog };
  }

  it('delivers a deep link with & intact as one argument', () => {
    const { run, deviceLog } = setup();
    const r = run('deep-link', 'myapp://item?id=&n=NaN');
    expect(r.status).toBe(0);
    expect(deviceLog()).toContain('  [myapp://item?id=&n=NaN]\n  [com.example.app]');
  });

  it('does not run a command smuggled into a URL', () => {
    const { dir, run, deviceLog } = setup();
    const marker = join(dir, 'PWNED');
    run('open-url', `myapp://open;touch ${marker}`);
    run('open-url', `myapp://x$(touch ${marker})`);
    expect(existsSync(marker)).toBe(false);
    expect(deviceLog()).toContain(`  [myapp://open;touch ${marker}]`);
  });

  it('refuses an injected app id at set-app and from a tampered state file', () => {
    const { dir, state, run } = setup();
    expect(run('set-app', 'com.x;touch PWNED').status).toBe(EXIT.USAGE);
    writeFileSync(state, JSON.stringify({ device: 'emulator-5554', platform: 'android', appId: 'com.x;touch PWNED' }));
    expect(run('stop').status).toBe(EXIT.USAGE);
    expect(existsSync(join(dir, 'PWNED'))).toBe(false);
  });

  it('ignores a resolve-activity answer that is not a component and falls back to monkey', () => {
    const { dir, run, deviceLog } = setup({ cmd: '#!/bin/sh\necho "com.x/.Main;touch PWNED"\n' });
    run('launch');
    expect(existsSync(join(dir, 'PWNED'))).toBe(false);
    expect(deviceLog()).toMatch(/^monkey\n {2}\[-p\]\n {2}\[com\.example\.app\]/m);
    expect(deviceLog()).not.toMatch(/^am\n/m);
  });

  it('escapes ${...} in typed text and refuses it in testIDs', () => {
    const { dir, run } = setup();
    expect(run('tap-id', '${http.get("http://x")}').status).toBe(EXIT.USAGE);
    expect(run('fill-id', 'email', 'total ${7*7}').status).toBe(0);
    const flow = readFileSync(join(dir, 'flow.yaml'), 'utf8');
    expect(flow).toContain('- inputText: "total \\\\${7*7}"');
  });
});
