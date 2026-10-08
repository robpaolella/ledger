import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('./run.mjs', import.meta.url));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check) {
  for (let i = 0; i < 120; i++) { if (check()) return; await sleep(250); }
  throw new Error('Timed out waiting for owned run');
}
function start(hydration) {
  const evidence = mkdtempSync('/tmp/ledger-lifecycle-');
  const args = [];
  if (hydration) {
    writeFileSync(`${evidence}/key`, 'pk_synthetic-lifecycle-key');
    writeFileSync(`${evidence}/hydrate.cjs`, hydration);
    // Test-only preload substitutes the network script, not launcher behaviour.
    writeFileSync(`${evidence}/preload.cjs`, `
      const cp = require('node:child_process');
      const original = cp.spawnSync;
      cp.spawnSync = (exe, args, opts) => original(exe,
        args[0]?.endsWith('/hydrate-institution-logos.js') ? [${JSON.stringify(`${evidence}/hydrate.cjs`)}] : args, opts);
      require('node:module').syncBuiltinESMExports();
    `);
    args.push('--require', `${evidence}/preload.cjs`);
  }
  const child = spawn(process.execPath, [...args, helper, '_serve', evidence], { env: { PATH: process.env.PATH, LEDGER_LOGODEV_TOKEN_FILE: `${evidence}/${hydration ? 'key' : 'missing-key'}` }, stdio: 'ignore' });
  return { evidence, process: child };
}
async function state(run) {
  await until(() => existsSync(`${run.evidence}/run.json`) || run.process.exitCode !== null);
  return JSON.parse(readFileSync(`${run.evidence}/run.json`, 'utf8'));
}
async function call(s, action) {
  const response = await fetch(`${s.control}/${action}`, { method: action === 'cleanup' ? 'POST' : 'GET', headers: { Authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  return response.json();
}
// Run after npm run build; no live-data paths, shell seeds, or inherited DB settings.
test('two owned instances, authenticated Doctor, tamper-safe cleanup, signal cleanup', { timeout: 90_000 }, async () => {
  const runs = [start(), start()];
  const sentinel = mkdtempSync('/tmp/ledger-retain-');
  writeFileSync(`${sentinel}/keep`, 'keep');
  try {
    const [a, b] = await Promise.all(runs.map(state));
    assert.notEqual(a.url, b.url);
    assert.notEqual(a.database, b.database);
    const aDoctor = await call(a, 'doctor');
    const bDoctor = await call(b, 'doctor');
    assert.equal(aDoctor.status, 'PASS');
    assert.equal(bDoctor.status, 'PASS');
    assert.deepEqual(aDoctor.logos, { status: 'not configured', loaded: 0 });
    assert.equal(readFileSync(`/proc/${a.childPid}/environ`, 'utf8').includes('LOGODEV_TOKEN='), false);
    for (const [run, doctor] of [[a, aDoctor], [b, bDoctor]]) {
      assert.equal((await fetch(`${run.url}/api/health`)).status, 200);
      if (doctor.lanUrl) {
        assert.equal((await fetch(`${doctor.lanUrl}/api/health`)).status, 200);
        assert.equal(doctor.lanUrl, run.lanUrl);
      } else assert.match(doctor.note, /reachable locally only/);
    }
    assert.equal((await fetch(`${a.control}/cleanup`, { method: 'POST' })).status, 403);
    // Fake deletion paths in disk state must have no authority in the supervisor.
    writeFileSync(`${runs[0].evidence}/run.json`, JSON.stringify({ ...a, scratch: sentinel, database: `${sentinel}/keep` }));
    assert.equal((await call(a, 'cleanup')).cleaned, true);
    await until(() => runs[0].process.exitCode !== null);
    assert.equal(existsSync(a.scratch), false);
    assert.equal(existsSync(`/proc/${a.childPid}`), false);
    assert.equal(readFileSync(`${sentinel}/keep`, 'utf8'), 'keep');
    assert.equal((await call(b, 'doctor')).status, 'PASS');
    // Delay the app's exit so HTTP cleanup and SIGTERM overlap deterministically.
    process.kill(b.childPid, 'SIGSTOP');
    const cleaning = call(b, 'cleanup').catch(() => null); // supervisor may close the response on signal
    await sleep(250);
    runs[1].process.kill('SIGTERM');
    await until(() => runs[1].process.exitCode !== null);
    await cleaning;
    assert.equal(existsSync(b.scratch), false);
    assert.equal(existsSync(`/proc/${b.childPid}`), false);
    for (const run of runs) assert.equal(existsSync(`${run.evidence}/server.log`), true);
  } finally {
    for (const run of runs) {
      if (run.process.exitCode === null) run.process.kill('SIGTERM');
      await until(() => run.process.exitCode !== null || run.process.signalCode !== null);
      rmSync(run.evidence, { recursive: true });
    }
    rmSync(sentinel, { recursive: true });
  }
});

test('configured and failed hydration both launch PASS without leaking the key', { timeout: 90_000 }, async () => {
  for (const fails of [false, true]) {
    const run = start(`
      const assert = require('node:assert/strict');
      assert.equal(process.env.LOGODEV_TOKEN, 'pk_synthetic-lifecycle-key');
      console.log(process.env.LOGODEV_TOKEN); console.error(process.env.LOGODEV_TOKEN);
      ${fails ? 'process.exit(1);' : `require('node:fs').mkdirSync('uploads'); require('node:fs').writeFileSync('uploads/vendor-999.webp', 'synthetic');`}
    `);
    try {
      const s = await state(run);
      const result = await call(s, 'doctor');
      assert.equal(result.status, 'PASS');
      assert.deepEqual(result.logos, { status: fails ? 'failed' : 'complete', loaded: fails ? 0 : 1 });
      assert.equal(readFileSync(`/proc/${s.childPid}/environ`, 'utf8').includes('LOGODEV_TOKEN='), false);
      assert.equal(JSON.stringify(result).includes('pk_synthetic-lifecycle-key'), false);
      for (const file of ['server.log', 'run.json']) {
        assert.equal(readFileSync(`${run.evidence}/${file}`, 'utf8').includes('pk_synthetic-lifecycle-key'), false);
      }
      await call(s, 'cleanup');
      await until(() => run.process.exitCode !== null);
      assert.equal(existsSync(s.scratch), false);
      assert.equal(readFileSync(`${run.evidence}/cleaned.json`, 'utf8').includes('pk_synthetic-lifecycle-key'), false);
    } finally {
      if (run.process.exitCode === null) run.process.kill('SIGTERM');
      await until(() => run.process.exitCode !== null || run.process.signalCode !== null);
      rmSync(run.evidence, { recursive: true });
    }
  }
});

test('public launch, doctor, cleanup and repeat cleanup commands', { timeout: 180_000 }, async () => {
  const evidence = mkdtempSync('/tmp/ledger-cli-test-');
  const cli = (action) => promisify(execFile)(process.execPath, [helper, action, evidence], {
    env: { PATH: process.env.PATH, HOME: evidence, LEDGER_LOGODEV_TOKEN_FILE: `${evidence}/missing-key` }, timeout: 150_000, maxBuffer: 2_000_000,
  });
  let s;
  try {
    assert.match((await cli('launch')).stdout, /"status": "PASS"/);
    s = JSON.parse(readFileSync(`${evidence}/run.json`, 'utf8'));
    const doctor = JSON.parse((await cli('doctor')).stdout);
    assert.equal(doctor.status, 'PASS');
    assert.ok(Object.hasOwn(doctor, 'lanUrl'));
    assert.match(JSON.stringify(doctor), /limited member/);
    assert.match((await cli('cleanup')).stdout, /"cleaned": true/);
    assert.match((await cli('cleanup')).stdout, /already cleaned/);
    await until(() => !existsSync(`/proc/${s.supervisorPid}`));
    assert.equal(existsSync(`/proc/${s.childPid}`), false);
    assert.equal(existsSync(s.scratch), false);
    assert.equal(existsSync(`${evidence}/server.log`), true);
  } finally {
    if (s && existsSync(s.scratch)) await cli('cleanup');
    rmSync(evidence, { recursive: true });
  }
});
