#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const META = JSON.parse(fs.readFileSync(path.join(SOURCE, 'package.json'), 'utf8'));
export const preset = JSON.parse(fs.readFileSync(path.join(SOURCE, 'preset/ui.json'), 'utf8'));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
export function readJson(p) {
  const raw = read(p);
  if (raw === null) return {};
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`Expected a JSON object: ${p}`);
  return value;
}
function atomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const temporary = `${p}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, data, { mode: 0o600 });
    fs.renameSync(temporary, p);
  } finally { fs.rmSync(temporary, { force: true }); }
}
const writeJson = (p, value) => atomic(p, JSON.stringify(value, null, 2) + '\n');
const statePath = agent => path.join(agent, 'styles/pi-claude-style/state.json');
function assertPackages(settings) {
  if (settings.packages !== undefined && !Array.isArray(settings.packages)) throw new Error('settings.packages must be an array');
}
export function isReplacedPackage(entry) {
  const source = typeof entry === 'string' ? entry : entry?.source;
  return typeof source === 'string' && (
    /^npm:(pi-cc-extensions|pi-comfy-ui|@adrianapan\/pikit)(@|$)/.test(source) ||
    /(?:github\.com[/:])(?:minuque\/pi-cc-extensions|adanft\/pi-comfy-ui|adrianapan\/pikit)(?:\.git)?(?:@|\/|$)/.test(source)
  );
}
function mergeLeaves(target, patch, changes, keys = []) {
  for (const [key, value] of Object.entries(patch)) {
    const route = [...keys, key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (own(target, key) && (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key]))) {
        throw new Error(`Expected an object at ${route.join('.')}`);
      }
      target[key] ??= {};
      mergeLeaves(target[key], value, changes, route);
    } else {
      changes.push({ keys: route, existed: own(target, key), before: target[key], after: value });
      target[key] = value;
    }
  }
}
function revertLeaves(target, changes, warnings) {
  for (const change of changes) {
    let parent = target;
    for (const key of change.keys.slice(0, -1)) parent = parent?.[key];
    const key = change.keys.at(-1);
    if (!parent || !equal(parent[key], change.after)) { warnings.push(`Preserved later edit: ${change.keys.join('.')}`); continue; }
    if (change.existed) parent[key] = change.before;
    else delete parent[key];
  }
}
function presetSpecs(agent) {
  // CC 1.x renamed its config. Preserve old custom options without letting the
  // dependency's import-time migration delete a file owned by an earlier preset.
  const cc = fs.existsSync(path.join(agent, 'pi-cc-extensions.json'))
    ? preset.ccStyle
    : { ...readJson(path.join(agent, 'claude-code-style.json')), ...preset.ccStyle };
  return [
    ['settings.json', preset.settings],
    ['configs/footer.json', preset.footer],
    ['pi-cc-extensions.json', cc],
  ];
}

export function upgradePreset(agent, packageRoot, previous, { now = Date.now() } = {}) {
  const next = structuredClone(previous);
  const plans = [];
  for (const [rel, patch] of presetSpecs(agent)) {
    const destination = path.join(agent, rel);
    const beforeRaw = read(destination);
    const current = readJson(destination);
    let record = next.files.find(file => file.rel === rel);
    if (!record) {
      record = { rel, existed: beforeRaw !== null, changes: [] };
      next.files.push(record);
    }
    const updates = [];
    mergeLeaves(current, patch, updates);
    for (const change of updates) {
      const old = record.changes.find(item => equal(item.keys, change.keys));
      if (old && !equal(change.before, old.after)) {
        // A user's later customization wins; keep its original rollback record.
        let parent = current;
        for (const key of change.keys.slice(0, -1)) parent = parent[key];
        if (change.existed) parent[change.keys.at(-1)] = change.before;
        else delete parent[change.keys.at(-1)];
      } else if (old) old.after = change.after;
      else record.changes.push(change);
    }
    if (rel === 'settings.json') {
      assertPackages(current);
      current.packages = (current.packages ?? []).filter(p => p !== previous.packageRoot && p !== packageRoot);
      current.packages.push(packageRoot);
    }
    plans.push({ rel, destination, beforeRaw, current });
  }
  const upgradeBackup = path.join(previous.backup, 'upgrades', String(now));
  fs.mkdirSync(upgradeBackup, { recursive: true, mode: 0o700 });
  writeJson(path.join(upgradeBackup, 'state.json'), previous);
  for (const plan of plans) if (plan.beforeRaw !== null) atomic(path.join(upgradeBackup, plan.rel), plan.beforeRaw);
  next.version = META.version;
  next.packageRoot = packageRoot;
  next.installedPackages = previous.installedPackages.map(p => p === previous.packageRoot ? packageRoot : p);
  next.upgradedAt = now;
  try {
    for (const plan of plans) writeJson(plan.destination, plan.current);
    writeJson(statePath(agent), next);
  } catch (error) {
    for (const plan of plans) {
      if (plan.beforeRaw === null) fs.rmSync(plan.destination, { force: true });
      else atomic(plan.destination, plan.beforeRaw);
    }
    writeJson(statePath(agent), previous);
    throw error;
  }
  return { alreadyInstalled: false, upgraded: true, state: next };
}
export function applyPreset(agent, packageRoot, { now = Date.now() } = {}) {
  agent = path.resolve(agent); packageRoot = path.resolve(packageRoot);
  const stateFile = statePath(agent);
  if (fs.existsSync(stateFile)) {
    const state = readJson(stateFile);
    if (state.version === META.version) return { alreadyInstalled: true, state };
    return upgradePreset(agent, packageRoot, state, { now });
  }
  const specs = presetSpecs(agent);
  // Parse and validate every destination before modifying any user configuration.
  const files = specs.map(([rel, patch]) => {
    const destination = path.join(agent, rel);
    const beforeRaw = read(destination);
    const after = readJson(destination);
    const changes = [];
    mergeLeaves(after, patch, changes);
    return { rel, destination, beforeRaw, after, changes };
  });
  const settings = files[0];
  assertPackages(settings.after);
  const originalPackages = settings.after.packages;
  const beforePackages = originalPackages ?? [];
  const removed = beforePackages.filter(isReplacedPackage);
  settings.after.packages = beforePackages.filter(p => !isReplacedPackage(p) && p !== packageRoot);
  settings.after.packages.push(packageRoot);
  const backup = path.join(agent, 'styles/pi-claude-style/backups', String(now));
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  for (const file of files) {
    if (file.beforeRaw !== null) atomic(path.join(backup, file.rel), file.beforeRaw);
  }
  const localFooter = path.join(agent, 'extensions/pikit-lite.ts');
  const footerSource = read(localFooter);
  const disabled = footerSource && /@adrianapan\/pikit/.test(footerSource) && /footer/.test(footerSource)
    ? { original: localFooter, saved: path.join(backup, 'disabled/pikit-lite.ts') } : null;
  const state = {
    version: META.version, packageRoot, backup, installedAt: now,
    files: files.map(({ rel, beforeRaw, changes }) => ({ rel, existed: beforeRaw !== null, changes })),
    originalPackages, removed, installedPackages: settings.after.packages, disabled,
  };
  try {
    if (disabled) { fs.mkdirSync(path.dirname(disabled.saved), { recursive: true }); fs.renameSync(disabled.original, disabled.saved); }
    for (const file of files) writeJson(file.destination, file.after);
    writeJson(stateFile, state);
  } catch (error) {
    for (const file of files) {
      if (file.beforeRaw === null) fs.rmSync(file.destination, { force: true });
      else atomic(file.destination, file.beforeRaw);
    }
    if (disabled && fs.existsSync(disabled.saved) && !fs.existsSync(disabled.original)) fs.renameSync(disabled.saved, disabled.original);
    fs.rmSync(stateFile, { force: true });
    throw error;
  }
  return { alreadyInstalled: false, state };
}
export function uninstallPreset(agent) {
  const stateFile = statePath(agent);
  if (!fs.existsSync(stateFile)) return { notInstalled: true, warnings: [] };
  const state = readJson(stateFile);
  const warnings = [];
  // Build the full revert plan first: malformed JSON must not cause partial restoration.
  const plans = state.files.map(file => {
    const destination = path.join(agent, file.rel);
    const current = readJson(destination);
    revertLeaves(current, file.changes, warnings);
    if (file.rel === 'settings.json') {
      assertPackages(current);
      if (equal(current.packages, state.installedPackages)) {
        if (state.originalPackages === undefined) delete current.packages;
        else current.packages = state.originalPackages;
      } else {
        const packages = (current.packages ?? []).filter(p => p !== state.packageRoot);
        for (const entry of state.removed) if (!packages.some(p => equal(p, entry))) packages.push(entry);
        current.packages = packages;
      }
    }
    // Remove empty nested containers introduced by the preset.
    if (file.rel === 'configs/footer.json' && current.colors && !Object.keys(current.colors).length) delete current.colors;
    return { destination, current, remove: !file.existed && !Object.keys(current).length, beforeRaw: read(destination) };
  });
  const restoredFooter = state.disabled && !fs.existsSync(state.disabled.original) && fs.existsSync(state.disabled.saved);
  try {
    for (const plan of plans) {
      if (plan.remove) fs.rmSync(plan.destination, { force: true });
      else writeJson(plan.destination, plan.current);
    }
    if (restoredFooter) fs.renameSync(state.disabled.saved, state.disabled.original);
    else if (state.disabled) warnings.push('Local footer was changed or moved; original remains in backup.');
    fs.rmSync(stateFile);
  } catch (error) {
    for (const plan of plans) {
      if (plan.beforeRaw === null) fs.rmSync(plan.destination, { force: true });
      else atomic(plan.destination, plan.beforeRaw);
    }
    if (restoredFooter && fs.existsSync(state.disabled.original) && !fs.existsSync(state.disabled.saved)) fs.renameSync(state.disabled.original, state.disabled.saved);
    throw error;
  }
  return { notInstalled: false, warnings, backup: state.backup };
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout: 300_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
export function cli(args = process.argv.slice(2)) {
  const action = args[0] ?? 'install';
  if (!['install', 'uninstall'].includes(action)) throw new Error('Usage: node scripts/setup.mjs [install|uninstall]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node >=22.19.0 is required.');
  const agent = path.resolve(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent'));
  const base = path.join(agent, 'styles/pi-claude-style');
  fs.mkdirSync(base, { recursive: true });
  const lock = path.join(base, 'setup.lock');
  fs.mkdirSync(lock); // Fail rather than race another installer.
  try {
    if (action === 'uninstall') {
      const result = uninstallPreset(agent);
      console.log(result.notInstalled ? 'Style is not installed.' : 'Style removed. Restart Pi to restore the previous UI.');
      for (const warning of result.warnings) console.warn(warning);
      return;
    }
    if (fs.existsSync(statePath(agent)) && readJson(statePath(agent)).version === META.version) { console.log('Style already installed. No configuration changed.'); return; }
    let check = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 20_000 });
    if (check.error?.code === 'ENOENT') {
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--global', '@earendil-works/pi-coding-agent@1.5.0', '--no-audit', '--no-fund']);
      check = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 20_000 });
    }
    if (check.status !== 0 || !/\b1\.5\.\d+\b/.test(check.stdout || '')) throw new Error('Requires Pi 1.5.x (tested 1.5.0). Existing Pi was not replaced.');
    // Fail on malformed destinations before downloading dependencies.
    for (const rel of ['settings.json', 'configs/footer.json', 'pi-cc-extensions.json']) readJson(path.join(agent, rel));
    const destination = path.join(base, META.version);
    if (path.resolve(SOURCE) !== path.resolve(destination)) {
      fs.cpSync(SOURCE, destination, { recursive: true, filter: p => !['node_modules', '.git', 'tests', '.github'].includes(path.basename(p)) });
    }
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'], { cwd: destination });
    const result = applyPreset(agent, destination);
    console.log(`Installed Pi Claude Style ${META.version}.\nBackup: ${result.state.backup}\nRestart Pi to activate the theme, renderer, input panel and footer.`);
    console.log(`Uninstall: node "${path.join(destination, 'scripts/setup.mjs')}" uninstall`);
  } finally { fs.rmdirSync(lock); }
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { cli(); } catch (error) { console.error(`pi-claude-style: ${error.message}`); process.exitCode = 1; }
}
