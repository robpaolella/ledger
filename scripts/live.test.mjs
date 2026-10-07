import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

const repo = process.cwd();
const script = path.join(repo, 'scripts/live.sh');
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

test('live lifecycle uses only isolated synthetic data', { timeout: 300000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-live-test-'));
  const evidence = path.join(temp, 'evidence');
  fs.mkdirSync(evidence);
  const checkout = path.join(temp, 'checkout');
  const source = path.join(temp, 'source');
  const live = path.join(temp, 'live');
  const env = { PATH: process.env.PATH, HOME: temp, LEDGER_LIVE_DIR: live,
    LEDGER_LIVE_CHECKOUT: checkout, LEDGER_LIVE_PORT: String(await freePort()) };
  const cli = (...args) => run('bash', [script, ...args], { env });
  let wal;
  let unrelated;
  try {
    good(run(process.execPath, [helper, 'launch', evidence]));
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
    await t.test('first copy, WAL-inclusive backup, health and LAN address', async () => {
      const output = good(cli('start', source));
      assert.match(output, /Pre-start backup saved/);
      const url = output.match(/http:\/\/[\d.]+:\d+/)[0];
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
    await t.test('retention keeps 30 and reuses build without npm', () => {
      for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(temp, 'backups', `ledger-2000-01-01T00-00-${String(i).padStart(2, '0')}.000Z-1.db`), 'old synthetic backup');
      const built = fs.statSync(path.join(checkout, 'packages/server/dist/index.js')).mtimeMs;
      good(cli('start'));
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
    run('git', ['worktree', 'remove', '--force', checkout]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
