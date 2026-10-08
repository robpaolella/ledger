import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { lanUrls } from './live/network.mjs';

const repo = process.cwd();
const helper = path.join(repo, '.pi/skills/verify-ledger/run.mjs');
const run = (file, args, options = {}) => spawnSync(file, args, { encoding: 'utf8', timeout: 180000, ...options });
const good = result => { assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout; };
const freePort = async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
function hashes(folder) {
  return fs.readdirSync(folder, { recursive: true }).sort().filter(name => fs.statSync(path.join(folder, name)).isFile())
    .map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex')]);
}

test('LAN output excludes virtual interfaces and preserves fallback', () => {
  const address = { family: 'IPv4', internal: false, address: '192.168.1.5' };
  const virtual = Object.fromEntries(['docker0', 'br-test', 'veth1', 'virbr0', 'podman0', 'cni0', 'flannel.1', 'lxdbr0'].map(name => [name, [address]]));
  assert.equal(lanUrls(virtual, 4321), 'http://localhost:4321 (no LAN address found)');
  assert.equal(lanUrls({ ...virtual, eth0: [address], lo: [{ ...address, internal: true }], wlan0: undefined }, 4321), 'http://192.168.1.5:4321');
});

test('live lifecycle uses only isolated synthetic data', { timeout: 300000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-live-test-'));
  const evidence = path.join(temp, 'evidence');
  fs.mkdirSync(evidence);
  const remote = path.join(temp, 'remote.git');
  const sandbox = path.join(temp, 'repo');
  const script = path.join(sandbox, 'scripts/live.sh');
  const checkout = path.join(temp, 'checkout');
  const source = path.join(temp, 'source');
  const live = path.join(temp, 'live');
  const env = { PATH: process.env.PATH, HOME: temp, LEDGER_LIVE_DIR: live,
    LEDGER_LIVE_CHECKOUT: checkout, LEDGER_LIVE_PORT: String(await freePort()) };
  const cli = (...args) => run('bash', [script, ...args], { env });
  let wal;
  let unrelated;
  try {
    // Borrow objects read-only, but keep refs, commits and worktree records private.
    good(run('git', ['clone', '--shared', '--bare', repo, remote]));
    good(run('git', ['-C', remote, 'update-ref', 'refs/heads/feature/platform-retheme', 'HEAD']));
    good(run('git', ['clone', '--shared', '--branch', 'feature/platform-retheme', remote, sandbox]));
    fs.copyFileSync(path.join(repo, 'scripts/live.sh'), script);
    for (const name of ['main.mjs', 'network.mjs']) fs.copyFileSync(path.join(repo, 'scripts/live', name), path.join(sandbox, 'scripts/live', name));
    const testIdentity = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
    good(run('git', ['-C', sandbox, 'add', 'scripts/live.sh', 'scripts/live']));
    good(run('git', ['-C', sandbox, 'commit', '--allow-empty', '-m', 'synthetic launcher snapshot'], { env: testIdentity }));
    good(run('git', ['-C', sandbox, 'push', 'origin', 'HEAD:feature/platform-retheme']));
    good(run(process.execPath, [helper, 'launch', evidence], { env: { ...process.env, LEDGER_LOGODEV_TOKEN_FILE: path.join(temp, 'no-logo-token') } }));
    const fixture = JSON.parse(fs.readFileSync(path.join(evidence, 'run.json')));
    fs.mkdirSync(source);
    const seeded = new Database(fixture.database, { readonly: true });
    try { await seeded.backup(path.join(source, 'ledger.db')); } finally { seeded.close(); }
    fs.copyFileSync(path.join(fixture.scratch, '.jwt-secret'), path.join(source, '.jwt-secret'));
    fs.mkdirSync(path.join(source, 'uploads'));
    fs.writeFileSync(path.join(source, 'uploads/sample.txt'), 'synthetic upload');
    fs.writeFileSync(path.join(source, 'do-not-copy.txt'), 'unrelated source file');
    good(run(process.execPath, [helper, 'cleanup', evidence]));
    wal = new Database(path.join(source, 'ledger.db'));
    wal.pragma('journal_mode = WAL');
    wal.pragma('wal_autocheckpoint = 0');
    wal.exec('CREATE TABLE live_backup_test (value TEXT); INSERT INTO live_backup_test VALUES (\'WAL-only sample\')');
    const before = hashes(source); // No source writes from here until checksums are checked.
    fs.mkdirSync(path.join(temp, 'logodev-token'));
    const token = 'synthetic-token-never-log-62';
    fs.writeFileSync(path.join(temp, 'logodev-token/token.txt'), token);
    await t.test('checkout, branch and build failures precede copying; retry keeps source usable', () => {
      const unchanged = () => {
        assert.equal(fs.existsSync(live), false);
        assert.equal(fs.readdirSync(temp).some(n => n.startsWith('live.initializing-')), false);
        assert.deepEqual(hashes(source), before);
      };
      for (const branch of ['--force', '', 'bad..branch']) {
        const result = run('bash', [script, 'start', source], { env: { ...env, LEDGER_LIVE_BRANCH: branch } });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /valid branch name/);
        unchanged();
      }
      const missing = 'ledger-test-nonexistent-branch-64';
      let result = run('bash', [script, 'start', source], { env: { ...env, LEDGER_LIVE_BRANCH: missing } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(missing));
      unchanged();
      fs.mkdirSync(checkout);
      result = cli('start', source);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not a worktree of this repository/);
      unchanged();
      result = run('bash', [script, 'start', source], { env: { ...env, LEDGER_LIVE_BRANCH: missing } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(missing));
      unchanged();
      fs.rmdirSync(checkout);
      const bin = path.join(temp, 'failed-build-bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
      result = run('bash', [script, 'start', source], { env: { ...env, PATH: `${bin}:${env.PATH}` } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Checkout\/build failed/);
      assert.equal(good(run('git', ['-C', checkout, 'rev-parse', 'HEAD'])).trim(),
        good(run('git', ['-C', sandbox, 'rev-parse', 'origin/feature/platform-retheme'])).trim());
      unchanged();
      const originalHead = good(run('git', ['-C', checkout, 'rev-parse', 'HEAD'])).trim();
      const tree = good(run('git', ['-C', sandbox, 'rev-parse', 'HEAD^{tree}'])).trim();
      const outside = good(run('git', ['-C', sandbox, 'commit-tree', tree, '-p', originalHead, '-m', 'synthetic off-branch commit'], {
        env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
      })).trim();
      good(run('git', ['-C', checkout, 'checkout', '--detach', outside]));
      result = cli('start', source);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /HEAD is not on tracked branch/);
      unchanged();
      good(run('git', ['-C', checkout, 'checkout', '--detach', originalHead]));
      // Run the changed launcher from the target checkout, not the worker's folder.
      fs.copyFileSync(script, path.join(checkout, 'scripts/live.sh'));
      for (const name of ['main.mjs', 'network.mjs']) fs.copyFileSync(path.join(repo, 'scripts/live', name), path.join(checkout, 'scripts/live', name));
    });
    await t.test('first copy, WAL-inclusive backup, health and LAN address', async () => {
      const output = good(run('bash', ['scripts/live.sh', 'start', source], { cwd: checkout, env }));
      assert.match(output, /Pre-start backup saved/);
      const url = output.match(/http:\/\/[\w.]+:\d+/)[0];
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
      assert.deepEqual(hashes(source), before);
      assert.equal(fs.existsSync(path.join(live, 'do-not-copy.txt')), false);
      const backup = fs.readdirSync(path.join(temp, 'backups'))[0];
      const db = new Database(path.join(temp, 'backups', backup), { readonly: true });
      assert.equal(db.prepare('SELECT value FROM live_backup_test').get().value, 'WAL-only sample');
      db.close();
      assert.equal(output.includes(token), false);
      assert.equal(fs.readFileSync(path.join(live, 'server.log'), 'utf8').includes(token), false);
      assert.match(good(cli('status')), /is running/);
      assert.match(good(cli('start')), /already running/);
      assert.equal(fs.readdirSync(path.join(temp, 'backups')).filter(n => n.endsWith('.db')).length, 1);
    });
    await t.test('owned stop, repeat stop, overwrite refusal and busy port', async () => {
      assert.match(good(cli('stop')), /Ledger stopped/);
      assert.match(good(cli('stop')), /not running/);
      const snapshot = hashes(live);
      const refusal = cli('start', source);
      assert.equal(refusal.status, 1);
      assert.match(refusal.stderr, /already exists/);
      assert.deepEqual(hashes(live), snapshot);
      const busy = net.createServer();
      await new Promise(resolve => busy.listen(Number(env.LEDGER_LIVE_PORT), resolve));
      try { assert.match(cli('start').stderr, /busy or unavailable/); }
      finally { await new Promise(resolve => busy.close(resolve)); }
      assert.equal(fs.readdirSync(path.join(temp, 'backups')).filter(n => n.endsWith('.db')).length, 1);
    });
    await t.test('unrelated PID is never signalled; failed backup starts nothing', () => {
      unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const stat = fs.readFileSync(`/proc/${unrelated.pid}/stat`, 'utf8').split(') ').at(-1).split(' ');
      const identity = `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat[19]}`;
      fs.writeFileSync(path.join(live, 'live-process.json'), JSON.stringify({ pid: unrelated.pid, identity, execPath: process.execPath }));
      assert.match(good(cli('stop')), /no process was stopped/);
      process.kill(unrelated.pid, 0);
      fs.renameSync(path.join(live, 'ledger.db'), path.join(live, 'saved.db'));
      fs.writeFileSync(path.join(live, 'ledger.db'), 'not sqlite');
      assert.equal(cli('start').status, 1);
      assert.match(good(cli('status')), /not running/);
      fs.renameSync(path.join(live, 'saved.db'), path.join(live, 'ledger.db'));
    });
    await t.test('first-run failure leaves no partial working folder and rejects links', () => {
      const alternative = path.join(temp, 'failed-copy');
      fs.symlinkSync(path.join(source, 'ledger.db'), path.join(source, 'uploads/linked.db'));
      try {
        const result = run('bash', [script, 'start', source], { env: { ...env, LEDGER_LIVE_DIR: alternative } });
        assert.equal(result.status, 1);
        assert.equal(fs.existsSync(alternative), false);
        assert.equal(fs.readdirSync(temp).some(n => n.startsWith('failed-copy.initializing-')), false);
      } finally { fs.unlinkSync(path.join(source, 'uploads/linked.db')); }
    });
    await t.test('linked parent paths and a changed Node install retain process ownership', () => {
      const alias = path.join(temp, 'alias');
      fs.symlinkSync(temp, alias);
      const linkedEnv = { ...env, LEDGER_LIVE_DIR: path.join(alias, 'live') };
      good(run('bash', [script, 'start'], { env: linkedEnv }));
      assert.match(good(cli('status')), /is running/);
      const bin = path.join(temp, 'alternate-node');
      fs.mkdirSync(bin);
      fs.copyFileSync(process.execPath, path.join(bin, 'node'));
      fs.chmodSync(path.join(bin, 'node'), 0o700);
      linkedEnv.PATH = `${bin}:${env.PATH}`;
      assert.match(good(run('bash', [script, 'status'], { env: linkedEnv })), /is running/);
      assert.match(good(run('bash', [script, 'stop'], { env: linkedEnv })), /Ledger stopped/);
      assert.match(good(cli('status')), /not running/);
    });
    await t.test('safe updates, refusal, rollback and serialization', async () => {
      const head = () => good(run('git', ['-C', checkout, 'rev-parse', 'HEAD'])).trim();
      const advance = () => {
        const parent = good(run('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/platform-retheme'])).trim();
        const tree = good(run('git', ['--git-dir', remote, 'rev-parse', `${parent}^{tree}`])).trim();
        const next = good(run('git', ['--git-dir', remote, 'commit-tree', tree, '-p', parent, '-m', 'synthetic update'], { env: testIdentity })).trim();
        good(run('git', ['--git-dir', remote, 'update-ref', 'refs/heads/feature/platform-retheme', next]));
        return next;
      };
      const backupFiles = () => fs.readdirSync(path.join(temp, 'backups')).filter(n => n.endsWith('.db'));
      const healthy = async (label = 'after update/rollback') => {
        try {
          // Synchronous lifecycle commands prevent pooled sockets from noticing a restart.
          // Use a fresh connection, not retries that could hide an actual failed restart.
          const response = await fetch(`http://127.0.0.1:${env.LEDGER_LIVE_PORT}/api/health`, {
            headers: { Connection: 'close' }, signal: AbortSignal.timeout(2000),
          });
          await response.arrayBuffer();
          assert.equal(response.status, 200);
        } catch (error) {
          const diagnostic = path.join(os.tmpdir(), `ledger-live-health-${process.pid}-${Date.now()}.log`);
          fs.writeFileSync(diagnostic, `${label}\n${fs.readFileSync(path.join(live, 'server.log'), 'utf8')}`, { mode: 0o600, flag: 'wx' });
          throw new Error(`Health probe failed ${label}; synthetic server log: ${diagnostic}`, { cause: error });
        }
      };
      const bin = path.join(temp, 'update-bin');
      fs.mkdirSync(bin);
      const mockEnv = { ...env, PATH: `${bin}:${env.PATH}` };
      // Fault injection preserves real built outputs/dependencies in the private clone.
      const mock = mode => fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const root = process.cwd(); const parent = path.dirname(root);
const saved = path.join(parent, fs.readdirSync(parent).find(n => n.startsWith('.ledger-update-')));
const mode = ${JSON.stringify(mode)};
if (process.argv[2] === 'ci') {
  fs.mkdirSync(path.join(root, 'node_modules'), {recursive:true});
  fs.writeFileSync(path.join(root, 'node_modules/partial-install'), 'partial');
  if (mode === 'install') process.exit(1);
  fs.cpSync(path.join(saved, 'node_modules'), path.join(root, 'node_modules'), {recursive:true, verbatimSymlinks:true});
  for (const name of ['shared', 'server', 'client']) {
    const modules = path.join(saved, 'packages', name, 'node_modules');
    if (fs.existsSync(modules)) fs.cpSync(modules, path.join(root, 'packages', name, 'node_modules'), {recursive:true, verbatimSymlinks:true});
  }
  if (mode === 'lock') {
    fs.writeFileSync(${JSON.stringify(path.join(temp, 'updating'))}, 'ready');
    while (!fs.existsSync(${JSON.stringify(path.join(temp, 'release'))})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
} else {
  for (const name of ['shared', 'server', 'client']) fs.cpSync(path.join(saved, 'packages', name, 'dist'), path.join(root, 'packages', name, 'dist'), {recursive:true});
  if (mode === 'build') { fs.writeFileSync(path.join(root, 'packages/client/dist/index.html'), 'broken build'); process.exit(1); }
  if (mode === 'health' || mode === 'rollback') {
    fs.writeFileSync(path.join(root, 'packages/server/dist/index.js'), "import Database from 'better-sqlite3'; import http from 'node:http'; import fs from 'node:fs'; const db = new Database(process.env.DATABASE_PATH); db.exec(\\\"UPDATE live_backup_test SET value = 'changed by failed version'\\\"); db.close(); fs.writeFileSync(process.env.HOME + '/update-migration-ran', 'changed'); const server = http.createServer((req,res) => { res.statusCode=503; res.end(); }).listen(Number(process.env.PORT)); process.on('SIGTERM', () => server.close());");
    if (mode === 'rollback') fs.writeFileSync(path.join(saved, 'packages/server/dist/index.js'), 'process.exit(1);');
  }
}
`, { mode: 0o700 });
      good(cli('start'));
      let pid = JSON.parse(fs.readFileSync(path.join(live, 'live-process.json'))).pid;
      let count = backupFiles().length;
      assert.match(good(cli('update')), /already up to date/);
      assert.equal(backupFiles().length, count);
      assert.equal(JSON.parse(fs.readFileSync(path.join(live, 'live-process.json'))).pid, pid);
      const previous = head();
      fs.writeFileSync(path.join(checkout, 'untracked-work.txt'), 'local work');
      assert.match(cli('update').stderr, /local changes/);
      fs.unlinkSync(path.join(checkout, 'untracked-work.txt'));
      good(run('git', ['--git-dir', remote, 'update-ref', '-d', 'refs/heads/feature/platform-retheme']));
      assert.match(cli('update').stderr, /missing or unreachable/);
      good(run('git', ['--git-dir', remote, 'update-ref', 'refs/heads/feature/platform-retheme', previous]));
      const parent = good(run('git', ['-C', checkout, 'rev-parse', 'HEAD^'])).trim();
      good(run('git', ['--git-dir', remote, 'update-ref', 'refs/heads/feature/platform-retheme', parent]));
      assert.match(cli('update').stderr, /HEAD is not on tracked branch/);
      good(run('git', ['--git-dir', remote, 'update-ref', 'refs/heads/feature/platform-retheme', previous]));
      assert.equal(head(), previous);
      assert.equal(backupFiles().length, count);
      assert.equal(JSON.parse(fs.readFileSync(path.join(live, 'live-process.json'))).pid, pid);
      const next = advance();
      const record = fs.readFileSync(path.join(live, 'live-process.json'));
      fs.unlinkSync(path.join(live, 'live-process.json'));
      try {
        assert.match(cli('update').stderr, /busy or unavailable/);
        process.kill(JSON.parse(record).pid, 0); // Refusal did not stop the original server.
      } finally { fs.writeFileSync(path.join(live, 'live-process.json'), record); }
      assert.equal(head(), previous);
      assert.equal(backupFiles().length, count);
      await healthy('after missing-record refusal');
      fs.renameSync(path.join(temp, 'backups'), path.join(temp, 'saved-backups'));
      fs.symlinkSync(path.join(temp, 'saved-backups'), path.join(temp, 'backups'));
      try { assert.match(cli('update').stderr, /Backup failed/); }
      finally {
        fs.unlinkSync(path.join(temp, 'backups'));
        fs.renameSync(path.join(temp, 'saved-backups'), path.join(temp, 'backups'));
      }
      assert.equal(head(), previous);
      assert.equal(backupFiles().length, count);
      await healthy('after backup-failure restart');
      good(cli('stop'));
      fs.renameSync(path.join(live, 'ledger.db'), path.join(live, 'saved.db'));
      fs.mkdirSync(path.join(live, 'ledger.db'));
      assert.match(cli('update').stderr, /Backup failed/);
      assert.equal(head(), previous);
      assert.equal(backupFiles().length, count);
      fs.rmdirSync(path.join(live, 'ledger.db'));
      fs.renameSync(path.join(live, 'saved.db'), path.join(live, 'ledger.db'));
      const output = good(cli('update')); // Real npm ci/build, stopped -> started.
      assert.match(output, /Previously stopped instance was started/);
      assert.ok(output.includes(previous) && output.includes(next));
      assert.match(output, /http:\/\//);
      assert.equal(head(), next);
      await healthy();
      assert.equal(backupFiles().length, ++count);
      advance();
      const builds = ['shared', 'server', 'client'].map(n => hashes(path.join(checkout, 'packages', n, 'dist')));
      const modules = fs.statSync(path.join(checkout, 'node_modules')).ino;
      for (const mode of ['install', 'build', 'health']) {
        mock(mode);
        const result = run('bash', [script, 'update'], { env: mockEnv });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /rolled back/);
        assert.match(result.stderr, /is running again/);
        assert.match(result.stderr, new RegExp(mode === 'install' ? 'installing dependencies' : mode === 'build' ? 'building' : 'checking health'));
        if (mode === 'health') assert.equal(fs.readFileSync(path.join(live, 'update-migration-ran'), 'utf8'), 'changed');
        assert.equal(head(), next);
        assert.equal(fs.statSync(path.join(checkout, 'node_modules')).ino, modules);
        assert.equal(fs.existsSync(path.join(checkout, 'node_modules/partial-install')), false);
        assert.deepEqual(['shared', 'server', 'client'].map(n => hashes(path.join(checkout, 'packages', n, 'dist'))), builds);
        assert.equal(backupFiles().length, ++count);
        const db = new Database(path.join(live, 'ledger.db'), { readonly: true });
        try { assert.equal(db.prepare('SELECT value FROM live_backup_test').get().value, 'WAL-only sample'); } finally { db.close(); }
        await healthy();
      }
      for (const mode of ['install', 'health']) {
        good(cli('stop'));
        mock(mode);
        const result = run('bash', [script, 'update'], { env: mockEnv });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /rolled back/);
        assert.match(result.stderr, mode === 'health' ? /is running again/ : /remains stopped/);
        assert.equal(head(), next);
        assert.equal(backupFiles().length, ++count);
        if (mode === 'health') await healthy();
        else assert.match(good(cli('status')), /not running/);
      }
      mock('lock');
      const child = spawn('bash', [script, 'update'], { env: mockEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      let childOutput = '';
      child.stdout.on('data', data => { childOutput += data; });
      child.stderr.on('data', data => { childOutput += data; });
      const completed = new Promise(resolve => child.once('exit', resolve));
      try {
        for (let i = 0; i < 200 && !fs.existsSync(path.join(temp, 'updating')); i++) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(fs.existsSync(path.join(temp, 'updating')), true);
        const locked = cli('status');
        assert.equal(locked.status, 75);
        assert.match(locked.stdout, /Another live-instance command/);
      } finally { fs.writeFileSync(path.join(temp, 'release'), 'go'); }
      assert.equal(await completed, 0, childOutput);
      assert.match(childOutput, /Ledger updated/);
      await healthy();
      advance();
      const oldEntry = fs.readFileSync(path.join(checkout, 'packages/server/dist/index.js'));
      mock('rollback');
      const failed = run('bash', [script, 'update'], { env: mockEnv });
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /ROLLBACK FAILED/);
      assert.equal(failed.stderr.includes('Saved build/dependencies:'), false);
      const savedBackup = failed.stderr.match(/Database backup: (.+?\.db)\./)[1];
      assert.equal(fs.existsSync(savedBackup), true);
      assert.match(good(cli('status')), /not running/);
      // Repair only the deliberately damaged synthetic build, then continue legacy tests.
      fs.writeFileSync(path.join(checkout, 'packages/server/dist/index.js'), oldEntry);
      for (const name of fs.readdirSync(temp).filter(n => n.startsWith('.ledger-update-'))) fs.rmSync(path.join(temp, name), { recursive: true });
    });
    await t.test('retention keeps 30 and reuses build without npm', () => {
      for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(temp, 'backups', `ledger-2000-01-01T00-00-${String(i).padStart(2, '0')}.000Z-1.db`), 'old synthetic backup');
      const built = fs.statSync(path.join(checkout, 'packages/server/dist/index.js')).mtimeMs;
      const bin = path.join(temp, 'offline-bin');
      fs.mkdirSync(bin);
      const realGit = good(run('which', ['git'])).trim();
      fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nif [ "$1" = fetch ]; then exit 99; fi\nexec "${realGit}" "$@"\n`, { mode: 0o700 });
      good(run('bash', [script, 'start'], { env: { ...env, PATH: `${bin}:${env.PATH}`, LEDGER_LIVE_BRANCH: 'feature/platform-retheme' } }));
      assert.equal(fs.statSync(path.join(checkout, 'packages/server/dist/index.js')).mtimeMs, built);
      assert.equal(fs.readdirSync(path.join(temp, 'backups')).filter(n => n.endsWith('.db')).length, 30);
      good(cli('stop'));
      assert.deepEqual(hashes(source), before);
    });
  } finally {
    cli('stop');
    unrelated?.kill();
    wal?.close();
    run(process.execPath, [helper, 'cleanup', evidence]);
    run('git', ['-C', sandbox, 'worktree', 'remove', '--force', checkout]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
