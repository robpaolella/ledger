import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

process.umask(0o077);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.resolve(process.env.LEDGER_LIVE_DIR || path.join(os.homedir(), 'ledger-live/live'));
const checkout = path.resolve(process.env.LEDGER_LIVE_CHECKOUT || '/git/ledger-worktrees/live-instance');
const backups = path.join(path.dirname(dir), 'backups');
const stateFile = path.join(dir, 'live-process.json');
const database = path.join(dir, 'ledger.db');
const entry = path.join(checkout, 'packages/server/dist/index.js');
const port = Number(process.env.LEDGER_LIVE_PORT || 3001);
const [command, source, ...extra] = process.argv.slice(2);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = message => { throw new Error(message); };
const cleanEnv = { PATH: process.env.PATH, HOME: dir, NODE_ENV: 'production' };
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function identity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1).split(' ');
  return `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat[19]}`;
}
function owned(state) {
  try {
    return Number.isInteger(state.pid) && state.pid > 1 && identity(state.pid) === state.identity
      && fs.readFileSync(`/proc/${state.pid}/cmdline`, 'utf8') === `${state.execPath}\0${entry}\0`
      && fs.readlinkSync(`/proc/${state.pid}/cwd`) === dir
      && fs.readFileSync(`/proc/${state.pid}/environ`, 'utf8').split('\0').includes(`DATABASE_PATH=${database}`);
  } catch { return false; }
}
function listens(pid) {
  const sockets = new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd => {
    try { return [fs.readlinkSync(`/proc/${pid}/fd/${fd}`)]; } catch { return []; }
  }));
  return ['tcp', 'tcp6'].some(table => fs.readFileSync(`/proc/${pid}/net/${table}`, 'utf8').trim().split('\n').slice(1).some(line => {
    const fields = line.trim().split(/\s+/);
    return fields[3] === '0A' && parseInt(fields[1].split(':')[1], 16) === port && sockets.has(`socket:[${fields[9]}]`);
  }));
}
function readState() {
  if (!fs.existsSync(stateFile)) return null;
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { fail('Process record is unreadable; refusing to start or stop.'); }
}
function assertPlain(target, directory = false) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) fail('Expected ordinary files and folders, not links.');
}
function copyPrivate(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { mode: 0o700 });
    for (const name of fs.readdirSync(from)) copyPrivate(path.join(from, name), path.join(to, name));
  } else {
    assertPlain(from);
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(to, 0o600);
  }
}
function initialize() {
  if (fs.existsSync(dir)) {
    if (source) fail('Working folder already exists; source was not copied.');
    assertPlain(dir, true);
    return;
  }
  if (!source) fail('First start needs an offline source folder: start <source-folder>.');
  const original = path.resolve(source);
  assertPlain(original, true);
  assertPlain(path.join(original, 'ledger.db'));
  assertPlain(path.join(original, '.jwt-secret'));
  assertPlain(path.join(original, 'uploads'), true);
  const staging = fs.mkdtempSync(`${dir}.initializing-`);
  try {
    for (const name of ['ledger.db', 'ledger.db-wal', 'ledger.db-shm', '.jwt-secret', 'uploads']) {
      if (fs.existsSync(path.join(original, name))) copyPrivate(path.join(original, name), path.join(staging, name));
    }
    fs.renameSync(staging, dir);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
function prepareBuild() {
  if (!fs.existsSync(checkout)) {
    git('fetch', 'origin', 'feature/platform-retheme');
    git('worktree', 'add', '--detach', checkout, 'origin/feature/platform-retheme');
  }
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (checkout === repo || git('-C', checkout, 'rev-parse', '--show-toplevel') !== checkout
    || git('-C', checkout, 'rev-parse', '--path-format=absolute', '--git-common-dir') !== common)
    fail('Live checkout must be a separate worktree of this repository.');
  git('merge-base', '--is-ancestor', git('-C', checkout, 'rev-parse', 'HEAD'), 'origin/feature/platform-retheme');
  if (fs.existsSync(entry) && fs.existsSync(path.join(checkout, 'packages/client/dist/index.html'))
    && fs.existsSync(path.join(checkout, 'node_modules'))) return;
  for (const args of [['ci'], ['run', 'build']]) {
    execFileSync('npm', args, { cwd: checkout, env: { PATH: process.env.PATH, HOME: os.homedir() }, stdio: 'inherit' });
  }
}
async function backup() {
  assertPlain(database);
  fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
  assertPlain(backups, true);
  const target = path.join(backups, `ledger-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}.db`);
  const Database = createRequire(path.join(checkout, 'packages/server/package.json'))('better-sqlite3');
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try { await db.backup(`${target}.partial`); fs.renameSync(`${target}.partial`, target); }
  finally { db.close(); fs.rmSync(`${target}.partial`, { force: true }); }
  const files = fs.readdirSync(backups).filter(name => /^ledger-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-\d+\.db$/.test(name)).sort().reverse();
  for (const name of files.slice(30)) fs.unlinkSync(path.join(backups, name));
  console.log('Pre-start backup saved (newest 30 retained).');
}
async function stop(state) {
  if (!state || !owned(state)) { console.log('Ledger is not running; no process was stopped.'); return; }
  process.kill(state.pid, 'SIGTERM');
  for (let i = 0; i < 100 && owned(state); i++) await wait(100);
  if (owned(state)) fail('Ledger has not stopped yet; no other process was signalled.');
  fs.rmSync(stateFile, { force: true });
  console.log('Ledger stopped.');
}
async function start(state) {
  if (state && owned(state)) { console.log(`Ledger is already running on port ${state.port}.`); return; }
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Choose a port between 1 and 65535 with LEDGER_LIVE_PORT.');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is busy or unavailable; Ledger was not started.`)));
    probe.listen(port, () => probe.close(resolve));
  });
  initialize();
  prepareBuild();
  await backup(); // No app process (and therefore no migration) before a successful backup.
  assertPlain(path.join(dir, '.jwt-secret'));
  assertPlain(path.join(dir, 'uploads'), true);
  const tokenPath = path.join(path.dirname(dir), 'logodev-token/token.txt');
  const token = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
  const logPath = path.join(dir, 'server.log');
  const log = fs.openSync(logPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600);
  const child = spawn(process.execPath, [entry], {
    cwd: dir, detached: true, stdio: ['ignore', log, log],
    env: { ...cleanEnv, PORT: String(port), DATABASE_PATH: database, LOGODEV_TOKEN: token },
  });
  fs.closeSync(log);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const record = { pid: child.pid, identity: identity(child.pid), execPath: process.execPath, port };
  try {
    const stateFd = fs.openSync(stateFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(stateFd, JSON.stringify(record)); } finally { fs.closeSync(stateFd); }
    for (let i = 0; i < 150; i++) {
      if (!owned(record)) fail('Ledger exited during startup; check the private server log.');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
        if (response.ok && owned(record) && listens(record.pid)) {
          child.unref();
          const addresses = Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal);
          console.log(`Ledger started: ${addresses.map(a => `http://${a.address}:${port}`).join(' ') || `http://localhost:${port} (no LAN address found)`}`);
          return;
        }
      } catch { /* Wait for migrations and listening. */ }
      await wait(200);
    }
    fail('Ledger did not become healthy; startup was stopped.');
  } catch (error) {
    // This ChildProcess is ours even if a path/metadata check unexpectedly fails.
    child.kill('SIGTERM');
    await stop(record);
    throw error;
  }
}
try {
  if (!['start', 'stop', 'status'].includes(command) || extra.length || (source && command !== 'start')) fail('Usage: start [offline-source-folder] | stop | status');
  const state = readState();
  if (command === 'start') await start(state);
  else if (command === 'stop') await stop(state);
  else console.log(state && owned(state) ? `Ledger is running on port ${state.port}.` : 'Ledger is not running.');
} catch (error) {
  // Never include subprocess output, environment values or file contents in failures.
  console.error(error.message?.startsWith('Command failed') ? 'Checkout/build failed; Ledger was not started.' : error.message);
  process.exitCode = 1;
}
