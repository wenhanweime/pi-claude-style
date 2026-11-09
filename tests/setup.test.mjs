import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  assert.equal(get('pi-cc-extensions.json').diffViewMode, 'auto');
  uninstallPreset(agent);
  for (const rel of ['settings.json', 'configs/footer.json', 'pi-cc-extensions.json']) assert.equal(fs.existsSync(path.join(agent, rel)), false);
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
  assert.equal(fs.existsSync(path.join(agent, 'pi-cc-extensions.json')), false);
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
  put('pi-cc-extensions.json', 'broken');
  assert.throws(() => uninstallPreset(agent));
  assert.deepEqual(get('settings.json'), settings);
  assert.ok(fs.existsSync(path.join(agent, 'styles/pi-claude-style/state.json')));
});

// macOS /var -> /private/var is a symlink; downloaded installers must still run.
test('CLI executes when invoked through a symlinked source directory', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const linkedRoot = path.join(agent, 'linked-source');
  fs.symlinkSync(root, linkedRoot, 'dir');
  const result = spawnSync(process.execPath, [path.join(linkedRoot, 'scripts/setup.mjs'), 'uninstall'], {
    env: { ...process.env, PI_CODING_AGENT_DIR: path.join(agent, 'isolated-agent') }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Style is not installed/);
});

function emulateV012(root) {
  applyPreset(agent, root, { now: 1 });
  const legacy = get('pi-cc-extensions.json');
  delete legacy.enableEditorPrefix; delete legacy.enableCustomFooter;
  put('claude-code-style.json', legacy);
  fs.rmSync(path.join(agent, 'pi-cc-extensions.json'));
  const state = get('styles/pi-claude-style/state.json');
  state.version = '0.1.2';
  const record = state.files.find(f => f.rel === 'pi-cc-extensions.json');
  record.rel = 'claude-code-style.json';
  record.changes = record.changes.filter(c => !['enableEditorPrefix', 'enableCustomFooter'].includes(c.keys[0]));
  put('styles/pi-claude-style/state.json', state);
  return state;
}

test('upgrading 0.1.2 retains the first backup and uninstall restores the pre-install UI', () => {
  put('settings.json', { theme: 'dark', defaultModel: 'mine', packages: ['npm:pi-cc-extensions@0.8.67'] });
  const previous = emulateV012('/test/old-package');
  const result = applyPreset(agent, '/test/new-package', { now: 2 });
  assert.equal(result.upgraded, true);
  assert.equal(result.state.backup, previous.backup);
  assert.deepEqual(get('settings.json').packages, ['/test/new-package']);
  assert.equal(get('pi-cc-extensions.json').enableEditorPrefix, false);
  assert.equal(get('pi-cc-extensions.json').enableCustomFooter, false);
  uninstallPreset(agent);
  assert.deepEqual(get('settings.json'), { theme: 'dark', defaultModel: 'mine', packages: ['npm:pi-cc-extensions@0.8.67'] });
  assert.equal(fs.existsSync(path.join(agent, 'pi-cc-extensions.json')), false);
  assert.equal(fs.existsSync(path.join(agent, 'claude-code-style.json')), false);
});

test('upgrade keeps user edits and plugins added since the first install', () => {
  put('settings.json', { theme: 'dark', packages: ['npm:other'] });
  emulateV012('/test/old-package');
  const settings = get('settings.json'); settings.theme = 'custom'; settings.packages.push('npm:later'); put('settings.json', settings);
  applyPreset(agent, '/test/new-package');
  assert.equal(get('settings.json').theme, 'custom');
  uninstallPreset(agent);
  assert.equal(get('settings.json').theme, 'custom');
  assert.deepEqual(new Set(get('settings.json').packages), new Set(['npm:other', 'npm:later']));
});

test('invalid new config aborts upgrade without modifying the old installation', () => {
  emulateV012('/test/old-package');
  const state = get('styles/pi-claude-style/state.json'); const settings = get('settings.json');
  put('pi-cc-extensions.json', '{invalid');
  assert.throws(() => applyPreset(agent, '/test/new-package'));
  assert.deepEqual(get('settings.json'), settings);
  assert.deepEqual(get('styles/pi-claude-style/state.json'), state);
});

test('legacy CC preferences are copied without deleting the original config', () => {
  const legacy = { enableAliases: false, previewLines: 8 };
  put('claude-code-style.json', legacy);
  applyPreset(agent, '/test/package');
  assert.equal(get('pi-cc-extensions.json').enableAliases, false);
  assert.equal(get('pi-cc-extensions.json').previewLines, 3);
  assert.deepEqual(get('claude-code-style.json'), legacy);
  uninstallPreset(agent);
  assert.equal(fs.existsSync(path.join(agent, 'pi-cc-extensions.json')), false);
  assert.deepEqual(get('claude-code-style.json'), legacy);
});
