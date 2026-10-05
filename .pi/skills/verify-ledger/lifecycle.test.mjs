import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('./run.mjs', import.meta.url));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check) {
  for (let i = 0; i < 120; i++) { if (check()) return; await sleep(250); }
  throw new Error('Timed out waiting for owned run');
}
function start() {
  const evidence = mkdtempSync('/tmp/ledger-lifecycle-');
  const process = spawn(globalThis.process.execPath, [helper, '_serve', evidence], { env: { PATH: globalThis.process.env.PATH }, stdio: 'ignore' });
  return { evidence, process };
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
    assert.equal((await call(a, 'doctor')).status, 'PASS');
    assert.equal((await call(b, 'doctor')).status, 'PASS');
    assert.equal((await fetch(`${a.control}/cleanup`, { method: 'POST' })).status, 403);
    // Fake deletion paths in disk state must have no authority in the supervisor.
    writeFileSync(`${runs[0].evidence}/run.json`, JSON.stringify({ ...a, scratch: sentinel, database: `${sentinel}/keep` }));
    assert.equal((await call(a, 'cleanup')).cleaned, true);
    await until(() => runs[0].process.exitCode !== null);
    assert.equal(existsSync(a.scratch), false);
    assert.equal(existsSync(`/proc/${a.childPid}`), false);
    assert.equal(readFileSync(`${sentinel}/keep`, 'utf8'), 'keep');
    assert.equal((await call(b, 'doctor')).status, 'PASS');
    runs[1].process.kill('SIGTERM');
    await until(() => runs[1].process.exitCode !== null);
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
