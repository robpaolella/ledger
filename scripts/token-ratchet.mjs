#!/usr/bin/env node
/**
 * Old-token ratchet for the Retheme v2 migration (Wave 0 alias layer).
 *
 * The alias layer in packages/client/src/index.css lets legacy token names keep
 * working while components migrate to the new semantic tokens per-area. This
 * guard prevents BACKSLIDING: it counts references to old (aliased) design
 * tokens in client component/page source and fails if the count rises above the
 * committed baseline. When you migrate an area off old tokens, lower BASELINE.
 *
 * "New" tokens are allow-listed; any other `var(--x)` in .ts/.tsx is treated as
 * an old token to be migrated. index.css itself (which DEFINES the aliases) is
 * excluded from the scan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'packages/client/src';
const NEW_TOKENS = new Set([
  'bg', 'surface', 'surface-2', 'elevated', 'line', 'line-strong',
  'text', 'text-2', 'text-3',
  'primary', 'primary-hover', 'on-primary', 'ring',
  'positive', 'negative', 'warning',
  'content', 'content-2', 'content-3',
  'c-teal', 'c-green', 'c-blue', 'c-indigo', 'c-violet', 'c-fuchsia', 'c-rose', 'c-orange', 'c-amber',
  'own-robert', 'own-kathleen', 'own-shared',
  'radius-sm', 'radius-md', 'radius-card', 'radius-lg', 'radius-full',
  'shadow-sm', 'shadow-md', 'font-sans', 'font-mono',
]);

// Ratchet baseline — the count of old-token refs at the end of Wave 0.
// LOWER this as areas migrate; CI fails if the live count exceeds it.
const BASELINE = Number(process.env.TOKEN_BASELINE ?? 99);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const re = /var\(--([a-z0-9-]+)\)/g;
let total = 0;
const perFile = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  let m, count = 0;
  while ((m = re.exec(text))) {
    if (!NEW_TOKENS.has(m[1])) count++;
  }
  if (count) { total += count; perFile.push([file, count]); }
}

perFile.sort((a, b) => b[1] - a[1]);
console.log(`Old-token refs: ${total} (baseline ${BASELINE})`);
for (const [f, c] of perFile.slice(0, 10)) console.log(`  ${c.toString().padStart(4)}  ${f}`);
if (perFile.length > 10) console.log(`  ... and ${perFile.length - 10} more files`);

if (total > BASELINE) {
  console.error(`\n✖ Old-token refs (${total}) exceed baseline (${BASELINE}). Use new semantic tokens (see index.css). If a migration legitimately lowers this, update BASELINE.`);
  process.exit(1);
}
console.log('✓ within baseline');
