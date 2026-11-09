import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyPreset, uninstallPreset } from '../scripts/setup.mjs';
let agent;
const put = (rel, value) => { const p = path.join(agent, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value)); };
const get = rel => JSON.parse(fs.readFileSync(path.join(agent, rel), 'utf8'));
beforeEach(() => { agent = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-style-test-')); });
afterEach(() => fs.rmSync(agent, { recursive: true, force: true }));

test('fresh install configures all UI layers and clean uninstall removes its configuration', () => {
  const root = path.join(agent, 'package with spaces');
  applyPreset(agent, root);
  assert.equal(get('settings.json').theme, 'claude-warm');
  assert.deepEqual(get('settings.json').packages, [root]);
  assert.equal(get('configs/footer.json').colors.model, '#D77757');
  assert.equal(get('claude-code-style.json').diffViewMode, 'auto');
  uninstallPreset(agent);
  for (const rel of ['settings.json', 'configs/footer.json', 'claude-code-style.json']) assert.equal(fs.existsSync(path.join(agent, rel)), false);
});

test('merges UI settings and preserves model, credentials, unrelated plugins and footer layout', () => {
  put('settings.json', { defaultProvider: 'my-provider', defaultModel: 'my-model', secret: 'test-only', packages: ['npm:other@1', 'npm:pi-comfy-ui@0.3.1', { source: 'npm:pi-cc-extensions', extensions: ['x'] }] });
  put('configs/footer.json', { row1RightSegments: ['cost'], colors: { path: '#112233', model: '#abcdef' } });
  put('auth.json', '{"unchanged":true}');
  const auth = fs.readFileSync(path.join(agent, 'auth.json'));
  const result = applyPreset(agent, '/test/package');
  const s = get('settings.json');
  assert.equal(s.defaultProvider, 'my-provider'); assert.equal(s.defaultModel, 'my-model'); assert.equal(s.secret, 'test-only');
  assert.deepEqual(s.packages, ['npm:other@1', '/test/package']);
  assert.deepEqual(get('configs/footer.json').row1RightSegments, ['cost']);
  assert.equal(get('configs/footer.json').colors.path, '#112233');
  assert.deepEqual(fs.readFileSync(path.join(agent, 'auth.json')), auth);
  assert.ok(fs.existsSync(path.join(result.state.backup, 'settings.json')));
  uninstallPreset(agent);
  assert.equal(get('configs/footer.json').colors.model, '#abcdef');
  assert.equal(get('settings.json').packages.length, 3);
});

test('repeat install is idempotent and keeps the original backup', () => {
  put('settings.json', { theme: 'dark' });
  const first = applyPreset(agent, '/test/package', { now: 1 });
  const second = applyPreset(agent, '/test/package', { now: 2 });
  assert.equal(second.alreadyInstalled, true); assert.equal(first.state.backup, second.state.backup);
  uninstallPreset(agent); assert.equal(get('settings.json').theme, 'dark');
});

test('malformed secondary config fails without partially editing settings', () => {
  put('settings.json', '{ "theme": "dark" }'); put('configs/footer.json', '{broken');
  assert.throws(() => applyPreset(agent, '/test/package'));
  assert.equal(fs.readFileSync(path.join(agent, 'settings.json'), 'utf8'), '{ "theme": "dark" }');
  assert.equal(fs.existsSync(path.join(agent, 'claude-code-style.json')), false);
});

test('invalid nested settings fail before writes', () => {
  put('configs/footer.json', { colors: 'invalid' });
  assert.throws(() => applyPreset(agent, '/test/package'), /Expected an object/);
  assert.equal(fs.existsSync(path.join(agent, 'settings.json')), false);
});

test('known local Pikit footer is disabled and restored without modifying its source', () => {
  const source = 'import footer from "/any/@adrianapan/pikit/footer/index.ts";';
  put('extensions/pikit-lite.ts', source);
  applyPreset(agent, '/test/package');
  assert.equal(fs.existsSync(path.join(agent, 'extensions/pikit-lite.ts')), false);
  uninstallPreset(agent);
  assert.equal(fs.readFileSync(path.join(agent, 'extensions/pikit-lite.ts'), 'utf8'), source);
});

test('uninstall preserves later user changes and packages added after installation', () => {
  put('settings.json', { theme: 'dark', packages: ['npm:pi-cc-extensions@0.8.67', 'npm:other'] });
  applyPreset(agent, '/test/package');
  const s = get('settings.json'); s.theme = 'my-new-theme'; s.defaultModel = 'later-model'; s.packages.push('npm:later'); put('settings.json', s);
  const result = uninstallPreset(agent);
  const after = get('settings.json');
  assert.equal(after.theme, 'my-new-theme'); assert.equal(after.defaultModel, 'later-model');
  assert.deepEqual(new Set(after.packages), new Set(['npm:other', 'npm:later', 'npm:pi-cc-extensions@0.8.67']));
  assert.ok(result.warnings.some(w => w.includes('theme')));
});

test('malformed config during uninstall preserves installed state for recovery', () => {
  applyPreset(agent, '/test/package'); const settings = get('settings.json');
  put('claude-code-style.json', 'broken');
  assert.throws(() => uninstallPreset(agent));
  assert.deepEqual(get('settings.json'), settings);
  assert.ok(fs.existsSync(path.join(agent, 'styles/pi-claude-style/state.json')));
});
