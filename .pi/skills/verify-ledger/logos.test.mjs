import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hydrateLogos } from './logos.mjs';

function fixture(run) {
  const scratch = mkdtempSync('/tmp/ledger-logo-test-');
  const tokenFile = `${scratch}/key.txt`;
  const script = `${scratch}/hydrate.cjs`;
  const key = 'pk_synthetic-do-not-log';
  const env = { PATH: process.env.PATH, HOME: scratch, DATABASE_PATH: `${scratch}/ledger.db` };
  try { run({ scratch, tokenFile, script, key, env }); }
  finally { rmSync(scratch, { recursive: true }); }
}

test('missing, empty, oversized and non-regular key files skip hydration', () => fixture(({ scratch, tokenFile, script, env }) => {
  const check = (file = tokenFile) => assert.deepEqual(hydrateLogos(scratch, env, { tokenFile: file, script }), { status: 'not configured', loaded: 0 });
  check();
  writeFileSync(tokenFile, ' \n'); check();
  writeFileSync(tokenFile, 'x'.repeat(4097)); check();
  check(scratch);
  execFileSync('mkfifo', [`${scratch}/pipe`]); check(`${scratch}/pipe`);
}));

test('key reaches only hydration environment; output and errors cannot expose it', () => fixture(({ scratch, tokenFile, script, key, env }) => {
  writeFileSync(tokenFile, ` PUBLISHABLE_KEY = ${key}\n`);
  writeFileSync(script, `
    const fs = require('node:fs');
    const assert = require('node:assert/strict');
    assert.equal(process.env.LOGODEV_TOKEN, ${JSON.stringify(key)});
    assert.equal(process.env.DATABASE_PATH, ${JSON.stringify(env.DATABASE_PATH)});
    assert.equal(process.cwd(), process.env.HOME);
    assert.equal(process.argv.join(' ').includes(process.env.LOGODEV_TOKEN), false);
    console.log(process.env.LOGODEV_TOKEN);
    console.error(encodeURIComponent(process.env.LOGODEV_TOKEN));
    fs.mkdirSync('uploads');
    fs.writeFileSync('uploads/institution-1.webp', 'synthetic');
    fs.writeFileSync('uploads/vendor-2.png', 'synthetic');
    fs.writeFileSync('uploads/unrelated.png', 'synthetic');
  `);
  // An outer process captures every byte the helper could print, just like launcher.log.
  const helper = new URL('./logos.mjs', import.meta.url).href;
  const code = `import { hydrateLogos } from ${JSON.stringify(helper)}; console.log(JSON.stringify(hydrateLogos(${JSON.stringify(scratch)}, ${JSON.stringify(env)}, ${JSON.stringify({ tokenFile, script })})));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.deepEqual(JSON.parse(output), { status: 'complete', loaded: 2 });
  assert.equal(output.includes(key), false);
  assert.equal(Object.hasOwn(env, 'LOGODEV_TOKEN'), false);
  writeFileSync(script, 'throw new Error(process.env.LOGODEV_TOKEN)');
  const result = hydrateLogos(scratch, env, { tokenFile, script });
  assert.deepEqual(result, { status: 'failed', loaded: 2 });
  assert.equal(JSON.stringify(result).includes(key), false);
}));

test('timeout kills and reaps hydration without failing verification', () => fixture(({ scratch, tokenFile, script, key, env }) => {
  writeFileSync(tokenFile, key);
  writeFileSync(script, `require('node:fs').writeFileSync('child.pid', String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 100);`);
  const start = Date.now();
  assert.deepEqual(hydrateLogos(scratch, env, { tokenFile, script, timeout: 500 }), { status: 'timed out', loaded: 0 });
  assert.ok(Date.now() - start < 3000);
  const pid = Number(readFileSync(`${scratch}/child.pid`, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}));
