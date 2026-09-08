import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
// @ts-ignore — untyped ESM driver script; the pure helpers are imported for testing.
import {
  buildFlow,
  detectPlatform,
  parseAdbDevices,
  parseSimDevices,
  getRef,
  assignRefs,
  parseHierarchy,
  parseSince,
  parseGlobalFlags,
  CliError,
  EXIT,
} from '../../bin/mobile-cli.mjs';

function parseFlow(yaml: string): { appId: string; steps: unknown[] } {
  const docs = YAML.parseAllDocuments(yaml).map((d) => d.toJS());
  expect(docs).toHaveLength(2);
  return { appId: docs[0].appId, steps: docs[1] };
}

describe('buildFlow — Maestro flow YAML is injection-proof', () => {
  it('round-trips quotes, newlines, backslashes, apostrophes and unicode exactly', () => {
    const nasty = 'line1\nline2 \\ back "quoted" \'single\' tab\t ünïcödé 🚀 #not-a-comment: x';
    const steps = [
      { tapOn: { id: 'field"with"quotes' } },
      { inputText: nasty },
      { eraseText: 200 },
      { pressKey: 'Enter' },
    ];
    const yaml = buildFlow('com.example.app', steps);
    const parsed = parseFlow(yaml);
    expect(parsed.appId).toBe('com.example.app');
    expect(parsed.steps).toEqual(steps);
  });

  it('keeps an appId containing ": " a string, not a nested map', () => {
    const yaml = buildFlow('weird: app', [{ inputText: 'x' }]);
    const parsed = parseFlow(yaml);
    expect(parsed.appId).toBe('weird: app');
  });

  it('cannot inject extra steps through typed text', () => {
    const payload = 'a"\n- launchApp';
    const yaml = buildFlow('com.x', [{ inputText: payload }]);
    const parsed = parseFlow(yaml);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]).toEqual({ inputText: payload });
    expect(yaml).not.toMatch(/^- launchApp/m);
  });

  it('cannot inject through a testID', () => {
    const id = 'btn"\n- eraseText: 999\n- tapOn:\n    id: "x';
    const yaml = buildFlow('com.x', [{ tapOn: { id } }, { inputText: 'v' }]);
    const parsed = parseFlow(yaml);
    expect(parsed.steps).toEqual([{ tapOn: { id } }, { inputText: 'v' }]);
  });

  it('refuses to build without an appId', () => {
    expect(() => buildFlow('', [{ inputText: 'x' }])).toThrow(CliError);
  });
});

describe('detectPlatform — from what adb and simctl list, never from string shape', () => {
  const adbOut = [
    'List of devices attached',
    'emulator-5554\tdevice',
    'R58M12345\tdevice',
    'ZY22OFFLINE\toffline',
    '',
  ].join('\n');
  const simJson = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
        { udid: 'ABCDEF01-1111-2222-3333-444444444444', name: 'qa-iphone', state: 'Shutdown', isAvailable: true },
        { udid: 'ABCDEF01-1111-2222-3333-555555555555', name: 'qa-iphone', state: 'Booted', isAvailable: true },
        { udid: 'ABCDEF01-1111-2222-3333-666666666666', name: 'old-iphone', state: 'Shutdown', isAvailable: false },
      ],
    },
  });
  const probes = { adbSerials: parseAdbDevices(adbOut), simDevices: parseSimDevices(simJson) };

  it('parses adb devices, keeping only "device" state', () => {
    expect(probes.adbSerials).toEqual(['emulator-5554', 'R58M12345']);
  });

  it('resolves an adb serial to android', () => {
    expect(detectPlatform('emulator-5554', probes)).toEqual({ platform: 'android', device: 'emulator-5554' });
    expect(detectPlatform('R58M12345', probes)).toEqual({ platform: 'android', device: 'R58M12345' });
  });

  it('resolves a simulator UDID (case-insensitive) to ios', () => {
    expect(detectPlatform('abcdef01-1111-2222-3333-444444444444', probes)).toEqual({
      platform: 'ios',
      device: 'ABCDEF01-1111-2222-3333-444444444444',
      deviceName: 'qa-iphone',
    });
  });

  it('resolves a short simulator NAME to ios and prefers the booted one', () => {
    expect(detectPlatform('qa-iphone', probes)).toEqual({
      platform: 'ios',
      device: 'ABCDEF01-1111-2222-3333-555555555555',
      deviceName: 'qa-iphone',
    });
  });

  it('ignores unavailable simulators and offline adb devices', () => {
    expect(detectPlatform('old-iphone', probes)).toBeNull();
    expect(detectPlatform('ZY22OFFLINE', probes)).toBeNull();
  });

  it('returns null for anything not listed', () => {
    expect(detectPlatform('nope', probes)).toBeNull();
    expect(detectPlatform('', probes)).toBeNull();
  });
});

describe('getRef — refs expire', () => {
  const state = {
    refs: { e1: { x: 10, y: 20 } },
    capturedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  };

  it('rejects a stale ref with exit code 3 and tells the agent to re-snapshot', () => {
    let err: unknown;
    try { getRef(state, 'e1'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(CliError);
    expect((err as { exitCode: number }).exitCode).toBe(EXIT.REF);
    expect((err as Error).message).toMatch(/run snapshot again/);
  });

  it('accepts a fresh ref', () => {
    const fresh = { ...state, capturedAt: new Date().toISOString() };
    expect(getRef(fresh, 'e1')).toEqual({ x: 10, y: 20 });
  });

  it('rejects an unknown ref with exit code 3', () => {
    const fresh = { ...state, capturedAt: new Date().toISOString() };
    expect(() => getRef(fresh, 'e9')).toThrow(/Unknown ref/);
    try { getRef(fresh, 'e9'); } catch (e) { expect((e as { exitCode: number }).exitCode).toBe(EXIT.REF); }
  });

  it('treats a missing capturedAt as stale', () => {
    expect(() => getRef({ refs: { e1: {} } }, 'e1')).toThrow(CliError);
  });
});

describe('assignRefs / parseHierarchy', () => {
  const hierarchy = {
    attributes: { bounds: '[0,0][100,100]', class: 'android.widget.FrameLayout' },
    children: [
      { attributes: { text: 'Hello', bounds: '[10,10][50,30]', class: 'android.widget.TextView' } },
      { attributes: { text: 'Off screen', bounds: '[200,200][300,300]', class: 'android.widget.TextView' } },
      { attributes: { 'resource-id': 'com.android.systemui:id/status_bar', bounds: '[0,0][100,10]' } },
    ],
  };

  it('gives refs to on-screen nodes only', () => {
    const { refs, count, tree } = assignRefs(hierarchy);
    expect(count).toBe(1);
    expect(refs.e1.text).toBe('Hello');
    expect(refs.e1.x).toBe(30);
    expect(tree).toContain('[e1] Text "Hello"');
    expect(tree).not.toContain('Off screen');
  });

  it('parses pure JSON and JSON preceded by a banner line', () => {
    const json = JSON.stringify(hierarchy);
    expect(parseHierarchy(json).attributes.bounds).toBe('[0,0][100,100]');
    expect(parseHierarchy('Maestro 2.6.0 banner\nanother line\n' + json).children).toHaveLength(3);
    expect(() => parseHierarchy('not json at all')).toThrow(/hierarchy not JSON/);
  });
});

describe('argument validation', () => {
  it('--since must be a positive integer', () => {
    expect(parseSince([])).toBe(60);
    expect(parseSince(['--since', '30'])).toBe(30);
    expect(() => parseSince(['--since'])).toThrow(CliError);
    expect(() => parseSince(['--since', 'abc'])).toThrow(CliError);
    expect(() => parseSince(['--since', '0'])).toThrow(CliError);
    try { parseSince(['--since', '-5']); } catch (e) { expect((e as { exitCode: number }).exitCode).toBe(EXIT.USAGE); }
  });

  it('--state is a global flag stripped from the command args', () => {
    expect(parseGlobalFlags(['--state', '/tmp/s.json', 'click', 'e1'])).toEqual({ args: ['click', 'e1'], statePath: '/tmp/s.json' });
    expect(parseGlobalFlags(['click', 'e1', '--state=/tmp/t.json'])).toEqual({ args: ['click', 'e1'], statePath: '/tmp/t.json' });
    expect(parseGlobalFlags(['snapshot'])).toEqual({ args: ['snapshot'], statePath: null });
    expect(() => parseGlobalFlags(['--state'])).toThrow(CliError);
  });
});
