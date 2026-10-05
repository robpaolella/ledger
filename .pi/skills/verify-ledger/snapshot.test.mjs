import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assemble, main } from './snapshot.mjs';

function captures() {
  return ['light', 'dark'].flatMap(theme => [390, 1440].map(width => ({
    theme, width, height: width === 390 ? 844 : 900, route: '/transactions',
    html: '<!doctype html><html><body><p title="Sample & safe">Synthetic sample</p></body></html>',
  })));
}

test('one file contains all four escaped, sandboxed documents and responsive/theme selection', () => {
  const html = assemble(captures());
  assert.equal((html.match(/<iframe /g) || []).length, 4);
  assert.equal((html.match(/sandbox srcdoc=/g) || []).length, 4);
  assert.match(html, /&lt;p title=&quot;Sample &amp; safe&quot;&gt;/);
  assert.match(html, /max-width:767px/);
  assert.match(html, /min-width:768px/);
  assert.match(html, /get\('theme'\)/);
  assert.doesNotMatch(html, /<iframe[^>]*\ssrc=/);
});

test('assembly refuses missing, duplicate, mismatched route/theme/viewport and non-HTML inputs', () => {
  assert.throws(() => assemble(captures().slice(1)), /four|light\/dark/);
  for (const patch of [{ width: 800 }, { height: 800 }, { route: '/settings' }, { theme: 'system' }, { html: '' }]) {
    const items = captures(); Object.assign(items[0], patch);
    assert.throws(() => assemble(items), /Captures must/);
  }
  const duplicate = captures(); duplicate[0] = duplicate[1];
  assert.throws(() => assemble(duplicate), /Captures must/);
});

test('invalid arguments refuse before opening a path', () => {
  for (const args of [[], ['other', '/missing', 'page'], ['capture', 'relative', 'page'],
    ['capture', '/missing/data', 'page'], ['capture', '/missing', '../escape'],
    ['capture', '/missing', 'page', 'extra'], ['assemble', '/missing', 'page']]) {
    assert.throws(() => main(args), /Usage:/);
  }
});

test('inherited DATABASE_PATH is refused before any filesystem access, including empty', () => {
  for (const value of ['', '/do-not-open/live.db']) {
    const result = spawnSync(process.execPath, [new URL('./snapshot.mjs', import.meta.url).pathname, 'capture', '/missing', 'page'], {
      env: { ...process.env, DATABASE_PATH: value }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused: no supplied database path/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test('assembly uses edited HTML, preserves originals and refuses overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-snapshot-test-'));
  try {
    const names = captures().map((capture, i) => {
      const { html, ...metadata } = capture;
      writeFileSync(join(dir, `view-${i}.json`), JSON.stringify(metadata));
      writeFileSync(join(dir, `view-${i}.html`), html.replace('Synthetic sample', 'Edited design'));
      return `view-${i}`;
    });
    main(['assemble', dir, 'page', ...names]);
    const html = readFileSync(join(dir, 'page.html'), 'utf8');
    assert.match(html, /Edited design/);
    assert.throws(() => main(['assemble', dir, 'page', ...names]), /EEXIST/);
    assert.equal(readFileSync(join(dir, 'page.html'), 'utf8'), html);
    assert.throws(() => main(['assemble', dir, 'page-two', '../escape', ...names.slice(1)]), /capture names/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('evidence aliases into data folders are refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-snapshot-test-'));
  try {
    // A synthetic folder named data, not any checkout's financial folder.
    const fake = join(dir, 'data');
    const link = join(dir, 'alias');
    mkdirSync(fake);
    symlinkSync(fake, link);
    assert.throws(() => main(['assemble', link, 'page', 'a', 'b', 'c', 'd']), /outside the checkout and data/);
  } finally { rmSync(dir, { recursive: true }); }
});
