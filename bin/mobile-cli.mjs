#!/usr/bin/env node
// mobile-cli — Maestro-backed shim mimicking the playwright-cli command surface
// used by qualiow exploratory testing skills, adapted for iOS/Android.
//
// State persists in $MOBILE_CLI_STATE (default ~/.mobile-cli/state.json):
//   { device, platform, appId, refs: { e1: {id, text, x, y, bounds, class} }, capturedAt }
//
// Commands:
//   set-device <udid|emulator-5554>     persist target device
//   set-app <bundleOrPackage>           persist app id
//   info                                show resolved state
//   launch                              cold-start the app
//   stop                                force-stop the app
//   relaunch-clean                      stop+clear+launch (android only)
//   snapshot [--full]                   write refs, print ref'd tree
//   click <ref>                         tap element by ref
//   fill <ref> <text...>                tap then inputText
//   press <key>                         BACK | ENTER | HOME
//   screenshot <path>                   save PNG
//   logs [--since <sec>] [--errors]     dump device logs (logcat / simctl log)
//   logs-clear                          clear device log buffer (android)
//   deep-link <url>                     open a deep link in the app
//   open-url <url>                      open a URL in the device browser (alias of deep-link)
//   running                             which activity / app is foreground
//   record-start <path>                 begin video recording
//   record-stop                         stop video recording

import { execFileSync, execSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const STATE_PATH = process.env.MOBILE_CLI_STATE || join(homedir(), '.mobile-cli', 'state.json');
const REC_PID_PATH = STATE_PATH.replace(/\.json$/, '.rec.pid');

// Maestro prints an analytics banner on first run, corrupting parsed output
// (e.g. the hierarchy JSON). Opt out for every maestro child process.
process.env.MAESTRO_CLI_NO_ANALYTICS = process.env.MAESTRO_CLI_NO_ANALYTICS || '1';

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function runOk(cmd, args, opts = {}) {
  try { return { ok: true, out: run(cmd, args, opts) }; }
  catch (e) { return { ok: false, out: e.stdout?.toString() || '', err: e.stderr?.toString() || e.message }; }
}

function platformFromDevice(device) {
  // emulator-* or NNNN.NNNN.NNNN style or starts with 'R' → android adb; UDID with hyphens → ios
  if (!device) return null;
  if (device.startsWith('emulator-') || /^[0-9A-F]{8}$/i.test(device) || device.length < 16) return 'android';
  return 'ios';
}

function reqDevice(s) {
  if (!s.device) throw new Error('No device set. Run: mobile-cli set-device <udid|emulator-5554>');
  return s;
}
function reqApp(s) {
  reqDevice(s);
  if (!s.appId) throw new Error('No app set. Run: mobile-cli set-app <bundleId|package>');
  return s;
}

// ---- maestro wrapper ----
function maestro(state, args) {
  reqDevice(state);
  return runOk('maestro', ['--device', state.device, ...args]);
}

// ---- snapshot: parse maestro hierarchy → ref-numbered text tree ----
function parseBounds(b) {
  // "[x1,y1][x2,y2]"
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b || '');
  if (!m) return null;
  const [, x1, y1, x2, y2] = m.map(Number);
  return { x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2), w: x2 - x1, h: y2 - y1 };
}

// IDs to exclude as system chrome (status bar, navigation bar, notifications).
const SYSTEM_ID_PREFIXES = [
  'com.android.systemui:',
  'com.google.android.apps.nexuslauncher:',
  'android:id/statusBar',
  'android:id/navigationBarBackground',
];
function isSystemChrome(id) {
  return id && SYSTEM_ID_PREFIXES.some(p => id.startsWith(p));
}

// Text patterns of dev-only chrome the app renders on top of every screen.
// These traps confuse exploratory agents (one accidental tap = lost in the debug menu).
const DEV_CHROME_TEXT_PATTERNS = [
  /^Debug tools$/i,    // floating bug button (app/sections/debug-menu trigger)
];
function isDevChrome(text) {
  return text && DEV_CHROME_TEXT_PATTERNS.some(p => p.test(text.trim()));
}

// ---- browser-target snapshot tuning ----
// When the "app under test" is actually a mobile browser driving a web app, the a11y
// tree is dominated by the browser's own shell (address bar, tabs, toolbar, on-screen
// keyboard) plus a few wrapper containers around the rendered page. The web content we
// care about lives *inside* those wrappers, so we treat two kinds of nodes specially.
// All of this is gated on the app id being a known browser so native-app snapshots are
// completely unaffected (backward-compatible).
const BROWSER_APP_IDS = [
  'com.apple.mobilesafari',   // iOS Safari
  'com.android.chrome',       // Android Chrome
  'org.mozilla.firefox',      // Firefox (android)
  'com.microsoft.emmx',       // Edge (android)
];
function isBrowserApp(appId) {
  return !!appId && BROWSER_APP_IDS.includes(appId);
}

// Pass-through wrappers: the browser nests the live web page a few layers deep
// (iOS Safari: SafariWindow > TabDocument > WebView > <page>). We never emit these as
// their own ref, but we DO keep walking into them so the page content surfaces.
const BROWSER_PASSTHROUGH_ID_PREFIXES = [
  // iOS Safari
  'SafariWindow',
  'TabDocument',
  'WebView',
  // Android Chrome — wrappers around the rendered page compositor
  'com.android.chrome:id/coordinator',
  'com.android.chrome:id/compositor_view_holder',
  'com.android.chrome:id/content',
];
function isBrowserPassthrough(id) {
  return id && BROWSER_PASSTHROUGH_ID_PREFIXES.some(p => id.startsWith(p));
}

// Browser-own UI subtrees (address/URL bar, tab bar, toolbar, reload/menu buttons,
// on-screen keyboard, input accessory, dimming overlays). None of this is app-under-test
// content — prune the whole subtree like system chrome so web snapshots aren't drowned.
const BROWSER_CHROME_ID_PREFIXES = [
  // iOS Safari
  'CapsuleViewController',         // the entire URL/address bar cluster
  'CapsuleNavigationBar',
  'TabBarItemTitle',
  'BackButton',
  'ReloadButton',
  'MoreMenuButton',
  'PageFormatMenuButton',
  'AdditionalDimmingOverlay',
  'Toolbar',
  'inputView',
  'SystemInputAssistantView',
  'UIKeyboardLayout',
  'UIKeyboard',
  'kb-autofill-key',
  // Android Chrome
  'com.android.chrome:id/toolbar',
  'com.android.chrome:id/url_bar',
  'com.android.chrome:id/tab_switcher_button',
  'com.android.chrome:id/menu_button',
  'com.android.chrome:id/control_container',
  'com.android.chrome:id/toolbar_container',
  'com.android.chrome:id/bottom_container',
  'com.android.chrome:id/location_bar',
  'com.android.chrome:id/omnibox',
  'com.android.chrome:id/message',          // promo/infobar bubbles ("Open tabs to visit…")
  'com.android.chrome:id/infobar',
];
function isBrowserChrome(id) {
  return id && BROWSER_CHROME_ID_PREFIXES.some(p => id.startsWith(p));
}

function isInteresting(attrs) {
  if (!attrs) return false;
  const cls = attrs.class || '';
  const id = attrs['resource-id'] || '';
  if (isSystemChrome(id)) return false;
  const text = attrs.text || attrs.accessibilityText || attrs.hintText || attrs.label || '';
  if (isDevChrome(text)) return false;
  const clickable = attrs.clickable === 'true' || attrs.clickable === true;
  if (id) return true;
  if (clickable && text) return true;
  if (/EditText|TextField|Button|CheckBox|Switch|TextView/i.test(cls) && (text || clickable)) return true;
  if (text && text.length > 0 && text.length < 200) return true; // visible text
  return false;
}

function summarizeClass(cls) {
  if (!cls) return '?';
  if (/EditText|TextField/i.test(cls)) return 'Input';
  if (/Button/i.test(cls)) return 'Button';
  if (/CheckBox/i.test(cls)) return 'Checkbox';
  if (/Switch/i.test(cls)) return 'Switch';
  if (/ImageView|Image\b/i.test(cls)) return 'Image';
  if (/TextView|StaticText|Label/i.test(cls)) return 'Text';
  if (/ViewGroup|Layout|Stack|Scroll/i.test(cls)) return 'Group';
  return cls.split('.').pop() || cls;
}

function snapshot(state, opts = {}) {
  const r = maestro(state, ['hierarchy']);
  if (!r.ok) throw new Error('maestro hierarchy failed:\n' + r.err);
  let json;
  // Tolerate any banner/log lines maestro prints before the JSON payload.
  const jsonStart = r.out.indexOf('{');
  const raw = jsonStart >= 0 ? r.out.slice(jsonStart) : r.out;
  try { json = JSON.parse(raw); } catch (e) { throw new Error('hierarchy not JSON:\n' + r.out.slice(0, 200)); }

  const refs = {};
  const lines = [];
  let n = 0;
  const browser = isBrowserApp(state.appId);

  function walk(node, depth) {
    if (!node) return;
    const a = node.attributes || {};
    const id = (a['resource-id'] || '').trim();
    if (isSystemChrome(id)) return; // skip whole systemui/launcher subtrees
    if (browser && isBrowserChrome(id)) return; // skip the browser's own URL bar / toolbar / keyboard subtrees
    const aText = (a.text || a.accessibilityText || a.hintText || a.label || '').trim();
    if (isDevChrome(aText)) return; // skip Debug tools floater and similar dev-only chrome
    const bounds = parseBounds(a.bounds);
    const text = aText;
    const kind = summarizeClass(a.class);
    let show = opts.full ? !!bounds : isInteresting(a);
    // Browser page-wrapper nodes (SafariWindow/TabDocument/WebView): don't emit the
    // wrapper itself, but keep walking so the web content inside surfaces.
    if (browser && isBrowserPassthrough(id)) show = false;
    if (show && bounds && bounds.w > 0 && bounds.h > 0) {
      n += 1;
      const ref = 'e' + n;
      refs[ref] = {
        id,
        text,
        class: a.class || '',
        clickable: a.clickable === 'true',
        x: bounds.cx, y: bounds.cy,
        bounds: [bounds.x1, bounds.y1, bounds.x2, bounds.y2],
        kind,
      };
      const idPart = id ? ` id=${id}` : '';
      const textPart = text ? ` "${text.replace(/\s+/g, ' ').slice(0, 80)}"` : '';
      const indent = '  '.repeat(Math.min(depth, 6));
      lines.push(`${indent}- [${ref}] ${kind}${textPart}${idPart}`);
    }
    for (const child of node.children || []) walk(child, depth + (show ? 1 : 0));
  }
  walk(json, 0);

  state.refs = refs;
  state.capturedAt = new Date().toISOString();
  saveState(state);
  return { tree: lines.join('\n'), count: n };
}

function getRef(state, ref) {
  if (!state.refs || !state.refs[ref]) throw new Error(`Unknown ref '${ref}'. Run snapshot first.`);
  return state.refs[ref];
}

// ---- maestro flow runner (one-shot YAML) ----
// Maestro CLI has no `input` / `tap-by-id` one-shot commands, so we write a tiny flow
// to /tmp and run it via `maestro test`. Startup is ~3-5s, but avoids char-by-char IME
// re-renders that adb input text triggers on React Native TextInputs.
function runFlow(state, commandsYaml) {
  reqApp(state);
  const tmpPath = `/tmp/_mcli_flow_${process.pid}_${Date.now()}.yaml`;
  const yaml = `appId: ${state.appId}\n---\n${commandsYaml}\n`;
  writeFileSync(tmpPath, yaml);
  try {
    return runOk('maestro', ['--device', state.device, 'test', tmpPath]);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

// ---- actions ----
function tap(state, ref) {
  const r = getRef(state, ref);
  if (state.platform === 'android') {
    return runOk('adb', ['-s', state.device, 'shell', 'input', 'tap', String(r.x), String(r.y)]);
  }
  // iOS sim — simctl has no `io tap`, and current Maestro CLIs have no one-shot
  // `tap` command either; run a tiny tapOn-point flow instead.
  return runFlow(state, `- tapOn:\n    point: "${r.x},${r.y}"`);
}

// Tap by testID directly via Maestro — no snapshot required first.
function tapById(state, id) {
  return runFlow(state, `- tapOn:\n    id: "${id}"`);
}

function fill(state, ref, text) {
  const tapRes = tap(state, ref);
  if (!tapRes.ok) return tapRes;
  sleep(250);
  // Use Maestro flow for text input on both platforms — avoids React Native
  // per-char re-render hell that makes adb input text crawl on long strings.
  // Maestro startup ≈ adb-input-text cost at ~15+ chars, faster above that.
  const escaped = String(text).replace(/"/g, '\\"');
  return runFlow(state, `- inputText: "${escaped}"`);
}

// Fill by testID — combines tapById + inputText into one Maestro flow (one startup, not two).
function fillById(state, id, text) {
  const escaped = String(text).replace(/"/g, '\\"');
  return runFlow(state, `- tapOn:\n    id: "${id}"\n- inputText: "${escaped}"`);
}

// Wait until a text substring appears in the visible hierarchy, or timeout.
// Polls every 1s. Returns { ok: true, elapsed_ms } on hit, { ok: false } on timeout.
function waitText(state, substring, timeoutSec = 10) {
  const deadline = Date.now() + timeoutSec * 1000;
  const start = Date.now();
  while (Date.now() < deadline) {
    const r = maestro(state, ['hierarchy']);
    if (r.ok && r.out.includes(substring)) {
      return { ok: true, out: `found "${substring}" after ${Date.now() - start}ms` };
    }
    sleep(1000);
  }
  return { ok: false, err: `timeout: "${substring}" not seen in ${timeoutSec}s` };
}

function press(state, key) {
  const map = { BACK: 'KEYCODE_BACK', ENTER: 'KEYCODE_ENTER', HOME: 'KEYCODE_HOME', TAB: 'KEYCODE_TAB', ESCAPE: 'KEYCODE_ESCAPE' };
  const k = map[key.toUpperCase()];
  if (!k) throw new Error(`Unknown key: ${key}. One of: ${Object.keys(map).join(', ')}`);
  if (state.platform === 'android') {
    return runOk('adb', ['-s', state.device, 'shell', 'input', 'keyevent', k]);
  }
  // iOS sim: no hardware keys, but Maestro can synthesize Enter (submit the focused
  // field) and Home. BACK still has no iOS equivalent — use an in-app back control.
  const iosKey = { ENTER: 'Enter', HOME: 'Home' }[key.toUpperCase()];
  if (iosKey) return runFlow(state, `- pressKey: ${iosKey}`);
  throw new Error(`press ${key} not supported on iOS sim. Use a UI back button via snapshot+click.`);
}

// Clear the text of an already-filled input: tap it, then Maestro eraseText.
function clearField(state, ref) {
  const tapRes = tap(state, ref);
  if (!tapRes.ok) return tapRes;
  sleep(250);
  return runFlow(state, `- eraseText: 200`); // erase up to 200 chars from the focused field
}

function launch(state) {
  reqApp(state);
  if (state.platform === 'android') {
    // Resolve the launcher activity and am start it — the classic `monkey -p <pkg>`
    // hack breaks on newer images (API 35 emulator mangles the args). Fall back to
    // monkey only if resolution fails.
    const res = runOk('adb', ['-s', state.device, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', '-c', 'android.intent.category.LAUNCHER', state.appId]);
    const comp = (res.out || '').trim().split('\n').pop()?.trim();
    if (res.ok && comp && comp.includes('/')) {
      return runOk('adb', ['-s', state.device, 'shell', 'am', 'start', '-n', comp]);
    }
    return runOk('adb', ['-s', state.device, 'shell', 'monkey', '-p', state.appId, '-c', 'android.intent.category.LAUNCHER', '1']);
  }
  return runOk('xcrun', ['simctl', 'launch', state.device, state.appId]);
}
function stop(state) {
  reqApp(state);
  if (state.platform === 'android') return runOk('adb', ['-s', state.device, 'shell', 'am', 'force-stop', state.appId]);
  return runOk('xcrun', ['simctl', 'terminate', state.device, state.appId]);
}
function relaunchClean(state) {
  reqApp(state);
  if (state.platform !== 'android') throw new Error('relaunch-clean is android-only (use stop+launch on ios).');
  stop(state);
  runOk('adb', ['-s', state.device, 'shell', 'pm', 'clear', state.appId]);
  return launch(state);
}
function screenshot(state, path) {
  reqApp(state);
  if (state.platform === 'android') {
    const tmp = '/sdcard/_mobile_cli_shot.png';
    runOk('adb', ['-s', state.device, 'shell', 'screencap', '-p', tmp]);
    const r = runOk('adb', ['-s', state.device, 'pull', tmp, path]);
    runOk('adb', ['-s', state.device, 'shell', 'rm', tmp]);
    return r;
  }
  return runOk('xcrun', ['simctl', 'io', state.device, 'screenshot', path]);
}
function deepLink(state, url) {
  reqApp(state);
  if (state.platform === 'android') {
    return runOk('adb', ['-s', state.device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url, state.appId]);
  }
  return runOk('xcrun', ['simctl', 'openurl', state.device, url]);
}
function running(state) {
  reqDevice(state);
  if (state.platform === 'android') {
    return runOk('adb', ['-s', state.device, 'shell', 'dumpsys', 'window'], {}).out
      .split('\n').filter(l => /mCurrentFocus|mFocusedApp/.test(l)).join('\n');
  }
  return run('xcrun', ['simctl', 'listapps', state.device]).slice(0, 400);
}

function logs(state, args) {
  reqDevice(state);
  const errors = args.includes('--errors');
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx >= 0 ? parseInt(args[sinceIdx + 1], 10) : 60;
  if (state.platform === 'android') {
    // logcat with time filter; need to compute -T <time>
    const t = new Date(Date.now() - since * 1000);
    const ts = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.000`;
    const lvl = errors ? '*:E' : '*:W';
    const out = runOk('adb', ['-s', state.device, 'logcat', '-d', '-T', ts, lvl]).out || '';
    return out.split('\n').slice(-400).join('\n');
  }
  const out = runOk('xcrun', ['simctl', 'spawn', state.device, 'log', 'show', '--last', `${since}s`, '--predicate', `processImagePath contains "${state.appId || ''}"`]).out || '';
  return out.split('\n').slice(-400).join('\n');
}
function logsClear(state) {
  reqDevice(state);
  if (state.platform === 'android') return runOk('adb', ['-s', state.device, 'logcat', '-c']);
  return { ok: true, out: '(ios log buffer not clearable)' };
}

function recordStart(state, path) {
  reqDevice(state);
  if (existsSync(REC_PID_PATH)) throw new Error('Recording already in progress.');
  let proc;
  if (state.platform === 'android') {
    // screenrecord runs on device, then we pull. simpler: use adb screenrecord directly piped to file (max 3min)
    proc = spawn('adb', ['-s', state.device, 'exec-out', 'screenrecord', '--output-format=h264', '-'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const w = createWriteStream(path);
    proc.stdout.pipe(w);
  } else {
    proc = spawn('xcrun', ['simctl', 'io', state.device, 'recordVideo', path], { stdio: 'ignore', detached: true });
  }
  writeFileSync(REC_PID_PATH, String(proc.pid));
  proc.unref();
  return { ok: true, out: `recording pid=${proc.pid}` };
}
function recordStop() {
  if (!existsSync(REC_PID_PATH)) throw new Error('No recording in progress.');
  const pid = parseInt(readFileSync(REC_PID_PATH, 'utf8'), 10);
  try { process.kill(pid, 'SIGINT'); } catch {}
  unlinkSync(REC_PID_PATH);
  return { ok: true, out: `stopped pid=${pid}` };
}

function sleep(ms) {
  try { execSync(`sleep ${(ms / 1000).toFixed(3)}`); } catch {}
}

// ---- main ----
function main() {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`mobile-cli — Maestro-backed shim for native iOS/Android exploratory testing

Commands:
  set-device <udid>      e.g. emulator-5554 OR iOS sim UDID
  set-app <appId>        e.g. com.apple.mobilesafari | com.android.chrome | io.example.app
  info
  launch | stop | relaunch-clean
  snapshot [--full]
  click <ref>            ref = e1, e2, ... from last snapshot
  fill <ref> <text...>   tap then enter text (uses Maestro flow — fast on long text)
  clear <ref>            tap then erase the field's existing text (Maestro eraseText)
  tap-id <testID>        tap by testID directly (skips snapshot — saves a hierarchy call)
  fill-id <testID> <text...>  tap by id + inputText in one Maestro flow (fastest combo)
  wait-text <substring> [timeout-sec]   poll hierarchy for text to appear, default 10s
  press <BACK|ENTER|HOME|TAB|ESCAPE>   (iOS: ENTER + HOME via Maestro; BACK is Android-only)
  screenshot <path>
  logs [--since <sec>] [--errors]
  logs-clear
  deep-link <url>
  open-url <url>         open a URL in the device browser (Safari/Chrome) — alias of deep-link
  running
  record-start <path> | record-stop
`);
    process.exit(0);
  }
  const state = loadState();
  try {
    switch (cmd) {
      case 'set-device': {
        state.device = args[0];
        state.platform = platformFromDevice(args[0]);
        saveState(state);
        console.log(`device=${state.device} platform=${state.platform}`);
        return;
      }
      case 'set-app': {
        reqDevice(state);
        state.appId = args[0];
        saveState(state);
        console.log(`appId=${state.appId}`);
        return;
      }
      case 'info': {
        console.log(JSON.stringify({ device: state.device, platform: state.platform, appId: state.appId, refs: Object.keys(state.refs || {}).length, capturedAt: state.capturedAt }, null, 2));
        return;
      }
      case 'launch': { const r = launch(state); process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err); return; }
      case 'stop':   { const r = stop(state);   process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err); return; }
      case 'relaunch-clean': { const r = relaunchClean(state); process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err); return; }
      case 'snapshot': {
        const full = args.includes('--full');
        const { tree, count } = snapshot(state, { full });
        console.log(tree);
        console.log(`\n(${count} refs captured)`);
        return;
      }
      case 'click': {
        const r = tap(state, args[0]);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `tapped ${args[0]}`); return;
      }
      case 'tap-id': {
        const r = tapById(state, args[0]);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `tapped id=${args[0]}`); return;
      }
      case 'fill': {
        const ref = args[0]; const text = args.slice(1).join(' ');
        const r = fill(state, ref, text);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `filled ${ref}`); return;
      }
      case 'clear': {
        const r = clearField(state, args[0]);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `cleared ${args[0]}`); return;
      }
      case 'fill-id': {
        const id = args[0]; const text = args.slice(1).join(' ');
        const r = fillById(state, id, text);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `filled id=${id}`); return;
      }
      case 'wait-text': {
        const r = waitText(state, args[0], args[1] ? parseInt(args[1], 10) : 10);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err); return;
      }
      case 'press': {
        const r = press(state, args[0]);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `pressed ${args[0]}`); return;
      }
      case 'screenshot': {
        const r = screenshot(state, args[0]);
        process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `saved ${args[0]}`); return;
      }
      case 'logs': console.log(logs(state, args)); return;
      case 'logs-clear': { const r = logsClear(state); console.log(r.out || r.err); return; }
      case 'deep-link': { const r = deepLink(state, args[0]); process.exitCode = r.ok ? 0 : 1; console.log(r.out || r.err || `opened ${args[0]}`); return; }
      // open-url — ergonomic alias of deep-link for browser targets. simctl openurl /
      // am start VIEW already opens any http(s) URL in the device browser; the URL does
      // not need to be registered as an app-scoped deep link.
      case 'open-url': { const r = deepLink(state, args[0]); process.exitCode = r.ok ? 0 : 1; console.log(r.ok ? `opened ${args[0]}` : (r.err || r.out)); return; }
      case 'running': console.log(running(state)); return;
      case 'record-start': { const r = recordStart(state, args[0]); console.log(r.out); return; }
      case 'record-stop':  { const r = recordStop(); console.log(r.out); return; }
      default:
        console.error(`Unknown command: ${cmd}. Run with --help.`);
        process.exit(2);
    }
  } catch (e) {
    console.error(`mobile-cli error: ${e.message}`);
    process.exit(1);
  }
}

main();
