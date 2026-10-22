// Compare the pre-refactor seed with the built seed on fresh, private databases.
// Run after npm run build: node packages/server/test/demo-seed-equivalence.mjs <base-ref>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import Database from 'better-sqlite3';
import ts from 'typescript';

if (Object.hasOwn(process.env, 'DATABASE_PATH')) {
  throw new Error('Refusing inherited DATABASE_PATH; this test only creates throwaway databases');
}
const [baseRef, ...extra] = process.argv.slice(2);
if (!baseRef || extra.length) throw new Error('Supply exactly one pre-refactor Git base ref');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const beforeSource = execFileSync('git', ['show', `${baseRef}:packages/server/src/db/demo-seed.ts`], {
  cwd: root, encoding: 'utf8',
});
const beforeCode = ts.transpileModule(beforeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext },
}).outputText;
const scratch = mkdtempSync(path.join(tmpdir(), 'ledger-seed-equivalence-'));
const quote = name => '"' + name.replaceAll('"', '""') + '"';

function dump(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    return Object.fromEntries(tables.map(({ name }) => [name,
      db.prepare(`SELECT * FROM ${quote(name)}`).all().map(row => {
        for (const key of ['password_hash', 'created_at', 'updated_at']) delete row[key];
        return row;
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]));
  } finally {
    db.close();
  }
}

function seed(label, useBefore) {
  const cwd = path.join(scratch, label);
  mkdirSync(cwd);
  cpSync(path.join(root, 'packages/server/dist'), path.join(cwd, 'dist'), { recursive: true });
  symlinkSync(path.join(root, 'node_modules'), path.join(cwd, 'node_modules'), 'dir');
  symlinkSync(path.join(root, 'packages/server/node_modules'), path.join(cwd, 'dist/node_modules'), 'dir');
  writeFileSync(path.join(cwd, 'package.json'), '{"type":"module"}\n');
  if (useBefore) writeFileSync(path.join(cwd, 'dist/db/demo-seed.js'), beforeCode);
  const database = path.join(cwd, 'ledger.db');
  const env = { ...process.env, HOME: cwd, DATABASE_PATH: database };
  for (const script of ['seed.js', 'demo-seed.js']) {
    execFileSync(process.execPath, [path.join(cwd, 'dist/db', script)], {
      cwd, env, stdio: 'pipe', timeout: 60_000,
    });
  }
  return dump(database);
}

try {
  const started = new Date();
  const before = seed('before', true);
  const after = seed('after', false);
  assert.equal(new Date().toDateString(), started.toDateString(), 'Retry: comparison crossed midnight');
  assert.deepEqual(after, before);
  const tables = Object.keys(before).length;
  const rows = Object.values(before).reduce((sum, entries) => sum + entries.length, 0);
  console.log(`PASS: all ${tables} tables / ${rows} rows identical (including sqlite_sequence).`);
  console.log('Ignored only password_hash, created_at, updated_at; both seeds ran on the same day.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
