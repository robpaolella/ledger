import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { refuseDatabase } from './run.mjs';
import { hydrateLogos } from './logos.mjs';

const helper = fileURLToPath(new URL('./run.mjs', import.meta.url));
for (const database of [
  '/git/ledger/data/ledger.db', '/git/ledger/data/other.db',
  '/git/ledger-worktrees/feat-48-verify-ledger/data/ledger.db',
  '/git/ledger-worktrees/another/data/anything', './data/ledger.db',
  '/tmp/not-created-by-launcher.db', '', '/tmp/alias-to-real-data',
]) {
  test(`refuses supplied database without filesystem lookup: ${database || '(empty)'}`, () => {
    assert.throws(() => refuseDatabase({ DATABASE_PATH: database }), /Refused/);
    const result = spawnSync(process.execPath, [helper, 'launch', '/does-not-exist'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_PATH: database },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refused/); // guard precedes even evidence realpath
    assert.doesNotMatch(result.stderr, /ENOENT/);
  });
}
test('no database override is accepted via extra arguments', () => {
  assert.doesNotThrow(() => refuseDatabase({}));
  assert.throws(() => refuseDatabase({}, ['--database', '/tmp/foo']), /Refused/);
});
test('a supplied existing file and symlink remain untouched', () => {
  const dir = mkdtempSync('/tmp/ledger-guard-test-');
  try {
    const target = `${dir}/sentinel`;
    writeFileSync(target, 'not a database');
    symlinkSync(target, `${dir}/alias`);
    for (const path of [target, `${dir}/alias`]) assert.throws(() => refuseDatabase({ DATABASE_PATH: path }), /Refused/);
    assert.equal(readFileSync(target, 'utf8'), 'not a database');
  } finally { rmSync(dir, { recursive: true }); }
});
test('Doctor maps the logo job rejection exit code without exposing the key', () => {
  const dir = mkdtempSync('/tmp/ledger-logo-doctor-test-');
  const key = 'pk_test_secret_do_not_print';
  try {
    const tokenFile = `${dir}/token.txt`;
    const script = `${dir}/reject.mjs`;
    writeFileSync(tokenFile, `${key}\n`);
    writeFileSync(script, 'process.exit(2);\n');
    const result = hydrateLogos(dir, { PATH: process.env.PATH }, { tokenFile, script });
    assert.deepEqual(result, { status: 'key rejected', loaded: 0 });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(key));
  } finally { rmSync(dir, { recursive: true }); }
});
test('data folder as evidence is rejected before resolving it', () => {
  const result = spawnSync(process.execPath, [helper, 'launch', '/never-exists/data/ledger.db'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside data folders/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
