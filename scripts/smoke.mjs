// Loads the actual extension through Pi's loader, without sending a model request.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
if (npm.status !== 0) throw new Error('Cannot locate global npm root');
const piRoot = process.env.PI_RUNTIME_PATH || path.join(npm.stdout.trim(), '@earendil-works/pi-coding-agent');
const agent = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-style-smoke-'));
process.env.PI_CODING_AGENT_DIR = agent;
try {
  const { loadExtensions } = await import(pathToFileURL(path.join(piRoot, 'dist/core/extensions/loader.js')));
  const result = await loadExtensions([path.join(root, 'extensions/index.ts')], agent);
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const { loadThemeFromPath } = await import(pathToFileURL(path.join(piRoot, 'dist/modes/interactive/theme/theme.js')));
  const theme = loadThemeFromPath(path.join(root, 'themes/claude-warm.json'));
  assert.ok(theme.fg('accent', 'warm').includes('warm'));
  const { applyPreset } = await import('./setup.mjs');
  applyPreset(agent, root);
  console.log('PASS: Pi loaded the theme and the complete CC → Comfy → footer extension stack. No model request sent.');
} finally { fs.rmSync(agent, { recursive: true, force: true }); }
