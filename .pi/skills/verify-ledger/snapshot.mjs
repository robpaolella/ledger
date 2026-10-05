#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { refuseDatabase } from './run.mjs';
import { capturePage } from './snapshot-browser.mjs';

const escapeAttribute = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function assemble(captures) {
  if (captures.length !== 4) throw new Error('Supply light/dark × 390/1440 captures');
  const keys = new Set();
  for (const capture of captures) {
    const { theme, width, height, route, html } = capture;
    const key = `${theme}-${width}`;
    if (!['light', 'dark'].includes(theme) || ![390, 1440].includes(width) ||
        height !== (width === 390 ? 844 : 900) || keys.has(key) ||
        route !== captures[0].route || !html?.startsWith('<!doctype html>')) {
      throw new Error('Captures must have the same route and unique light/dark × 390×844/1440×900 entries');
    }
    keys.add(key);
  }
  // Separate documents preserve JS-selected responsive DOM, SVG IDs and portal styles.
  // srcdoc is ordinary editable HTML with attribute escaping; no app JS is retained.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ledger — offline page snapshot</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:none;border:0;width:100%;height:100dvh}
@media(max-width:767px){html[data-theme=light] .light-390,html[data-theme=dark] .dark-390{display:block}}
@media(min-width:768px){html[data-theme=light] .light-1440,html[data-theme=dark] .dark-1440{display:block}}
</style></head><body>
${captures.map(c => `<iframe title="${c.theme} ${c.width} snapshot" class="${c.theme}-${c.width}" sandbox srcdoc="${escapeAttribute(c.html)}"></iframe>`).join('\n')}
<script>document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';</script>
</body></html>\n`;
}

function command(args, input) {
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', ...args], {
    input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}

export function main(args) {
  refuseDatabase();
  const [action, evidence, name, ...inputs] = args;
  if (!['capture', 'assemble'].includes(action) || !evidence?.startsWith('/') ||
      !/^[a-z0-9][a-z0-9-]*$/.test(name || '') ||
      (action === 'capture' ? inputs.length !== 0 : inputs.length !== 4) ||
      resolve(evidence).split('/').includes('data')) {
    throw new Error('Usage: snapshot.mjs capture /absolute/evidence name | assemble /absolute/evidence name <four capture names>');
  }
  const folder = realpathSync(evidence);
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  if (folder.split('/').includes('data') || folder === repo.slice(0, -1) || folder.startsWith(repo)) {
    throw new Error('Use an evidence folder outside the checkout and data folders');
  }
  if (action === 'capture') {
    if (!process.env.CHROME_DEVTOOLS_AXI_SESSION) throw new Error('Set your owned CHROME_DEVTOOLS_AXI_SESSION');
    const doctor = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url)), 'doctor', evidence], { encoding: 'utf8' });
    if (doctor.status !== 0) throw new Error(`Doctor failed: ${doctor.stderr}`);
    const { url, status } = JSON.parse(doctor.stdout);
    if (status !== 'PASS') throw new Error('Doctor did not pass');
    const script = `console.log(JSON.stringify(await page.eval(${JSON.stringify(`() => (${capturePage.toString()})(${JSON.stringify(url)})`)})));`;
    const capture = JSON.parse(command(['run'], script));
    if (![390, 1440].includes(capture.width) || capture.height !== (capture.width === 390 ? 844 : 900)) throw new Error('Resize to 390×844 or 1440×900 first');
    const { html, ...metadata } = capture;
    writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 });
    writeFileSync(resolve(evidence, `${name}.html`), html, { flag: 'wx', mode: 0o600 });
    console.log(`Saved ${name}: ${capture.route} ${capture.theme} ${capture.width}×${capture.height}`);
  } else {
    if (inputs.some(input => !/^[a-z0-9][a-z0-9-]*$/.test(input))) throw new Error('Use capture names, not paths');
    const captures = inputs.map(input => ({
      ...JSON.parse(readFileSync(resolve(evidence, `${input}.json`), 'utf8')),
      html: readFileSync(resolve(evidence, `${input}.html`), 'utf8'),
    }));
    writeFileSync(resolve(evidence, `${name}.html`), assemble(captures), { flag: 'wx', mode: 0o600 });
    console.log(`Saved ${name}.html; open with ?theme=light or ?theme=dark`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
