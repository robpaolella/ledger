import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { capturePage } from './snapshot-browser.mjs';

// Explicit opt-in: a real, uniquely named Chrome session and synthetic HTTP fixture.
// No Ledger database, app server, credentials, browser storage or external assets.
test('real browser capture inlines CSS/images and preserves state without app scripts', {
  skip: process.env.LEDGER_SNAPSHOT_BROWSER_TEST !== '1', timeout: 120_000,
}, async () => {
  const server = createServer((req, res) => {
    if (req.url === '/asset.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>');
    } else if (req.url === '/style.css') {
      res.setHeader('Content-Type', 'text/css');
      res.end('@import "./nested.css"; body{background-image:url("./asset.svg")}');
    } else if (req.url === '/nested.css') {
      res.setHeader('Content-Type', 'text/css'); res.end('p{color:rgb(10,20,30)}');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html class="dark"><head><link rel="stylesheet" href="/style.css"></head><body>
        <p>Sample fixture</p><img src="/asset.svg" srcset="/asset.svg 1x" alt="sample">
        <input id="text" value="initial"><input id="secret" type="password" value="not-exported">
        <input id="check" type="checkbox"><textarea id="area">old</textarea>
        <select><option>one</option><option id="chosen">two</option></select>
        <a href="/remote" onclick="alert('never')">link</a><form action="/submit"><button>Submit</button></form>
        <script>window.fixtureScript = true;</script></body></html>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: `ledger-snapshot-test-${process.pid}` };
  const exec = promisify(execFile);
  const cli = async (...args) => (await exec('npx', ['-y', 'chrome-devtools-axi', ...args], { env, maxBuffer: 8 * 1024 * 1024 })).stdout;
  const evaluate = async expression => {
    const output = await cli('eval', expression);
    // eval is a human-oriented envelope; use a tagged JSON string and locate it.
    const line = output.split('\n').find(line => line.startsWith('result: '));
    return JSON.parse(JSON.parse(line.slice(8)));
  };
  const capture = () => evaluate(`async () => await (${capturePage.toString()})(${JSON.stringify(origin)})`);
  try {
    await cli('open', origin);
    await cli('resize', '390', '844');
    await cli('eval', `() => {
      document.querySelector('#text').value = 'edited';
      document.querySelector('#area').value = 'changed';
      document.querySelector('#check').checked = true;
      document.querySelector('#chosen').selected = true;
    }`);
    const result = await capture();
    assert.equal(result.theme, 'dark'); assert.equal(result.width, 390);
    assert.match(result.html, /data:image\/svg\+xml;base64/);
    assert.match(result.html, /rgb\(10,20,30\)/);
    assert.match(result.html, /value="edited"/);
    assert.match(result.html, /id="check"[^>]*checked/);
    assert.match(result.html, /id="chosen" selected/);
    assert.match(result.html, /<textarea id="area">changed<\/textarea>/);
    assert.doesNotMatch(result.html, /not-exported|<script|<link|srcset=|onclick=|action=|@import/);
    assert.match(result.html, /Content-Security-Policy/);
    const wrong = await evaluate(`async () => {
      try {await (${capturePage.toString()})('http://127.0.0.1:1'); return 'failed guard';}
      catch(error) {return error.message;}
    }`);
    assert.match(wrong, /Doctor URL/);
    await cli('eval', '() => document.body.append(document.createElement("canvas"))');
    const unsupported = await evaluate(`async () => {
      try {await (${capturePage.toString()})(${JSON.stringify(origin)}); return 'failed guard';}
      catch(error) {return error.message;}
    }`);
    assert.match(unsupported, /Unsupported embedded/);
  } finally {
    try { await cli('stop'); } finally { await new Promise(resolve => server.close(resolve)); }
  }
});
