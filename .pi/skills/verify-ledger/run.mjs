#!/usr/bin/env node
import { fork, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { closeSync, cpSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hydrateLogos } from './logos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Pure string guard: deliberately NO stat, realpath, readdir or database open.
// No caller-supplied database is ever accepted, including symlink aliases.
export function refuseDatabase(env = process.env, extra = []) {
  if (Object.hasOwn(env, 'DATABASE_PATH') || extra.length) {
    throw new Error('Refused: no supplied database path or extra arguments are accepted. Only a new launcher-created /tmp folder is allowed.');
  }
}

// The app is intentionally reachable on the LAN; never advertise container or virtual links.
export function selectLanIPv4(interfaces) {
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (/^(?:docker\d*|br-|veth|cni|flannel|virbr|podman|vmnet|vboxnet|tailscale|wg\d*|tun\d*|tap\d*)/i.test(name)) continue;
    for (const address of addresses ?? []) {
      if ((address.family === 'IPv4' || address.family === 4) && !address.internal
        && !address.address.startsWith('169.254.')) return address.address;
    }
  }
  return null;
}
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from local verification instance`);
  return response.json();
}
async function login(url, username, role) {
  const result = await request(`${url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password1' }),
  });
  if (result.data?.user?.role !== role || !result.data.token) throw new Error(`Wrong demo role: ${username}`);
  return result.data.token;
}
function runNode(file, env, cwd, log) {
  const result = spawnSync(process.execPath, [file], { cwd, env, stdio: ['ignore', log, log] });
  if (result.error || result.status !== 0) throw new Error(`Seed failed: ${file}; inspect server.log`);
}

async function serve(evidence) {
  // These values stay in memory. Cleanup NEVER takes a deletion path from run.json.
  const log = openSync(resolve(evidence, 'server.log'), 'ax', 0o600);
  const scratch = mkdtempSync('/tmp/ledger-verify-');
  const database = resolve(scratch, 'ledger.db');
  const token = randomUUID();
  const env = { PATH: process.env.PATH, HOME: scratch, NODE_ENV: 'production', DATABASE_PATH: database, PORT: '0' };
  let child;
  let control;
  let stopping = false;
  let cleaning;
  function cleanup() {
    return cleaning ??= (async () => {
      stopping = true;
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((done) => child.once('exit', done));
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await exited; clearTimeout(timer);
      }
      rmSync(scratch, { recursive: true });
      json(resolve(evidence, 'cleaned.json'), { scratch, childPid: child?.pid, cleaned: true });
      closeSync(log);
      control?.close();
    })();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void cleanup().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
  });
  try {
    // Snapshot built assets so another rebuild cannot replace those assets.
    for (const pkg of ['server', 'client']) cpSync(resolve(repo, `packages/${pkg}/dist`), resolve(scratch, `packages/${pkg}/dist`), { recursive: true });
    writeFileSync(resolve(scratch, 'package.json'), '{"type":"module"}');
    symlinkSync(resolve(repo, 'node_modules'), resolve(scratch, 'node_modules'));
    const serverModules = resolve(repo, 'packages/server/node_modules');
    if (existsSync(serverModules)) symlinkSync(serverModules, resolve(scratch, 'packages/server/node_modules'));
    runNode(resolve(scratch, 'packages/server/dist/db/seed.js'), env, scratch, log);
    runNode(resolve(scratch, 'packages/server/dist/db/demo-seed.js'), env, scratch, log);
    const logos = hydrateLogos(scratch, env);
    child = fork(resolve(scratch, 'packages/server/dist/index.js'), [], {
      cwd: scratch, env, execArgv: ['--import', resolve(here, 'listen.mjs')],
      stdio: ['ignore', log, log, 'ipc'],
    });
    const port = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Server readiness timed out')), 30_000);
      child.once('message', (message) => { clearTimeout(timer); done(message.port); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before readiness')); });
    });
    const url = `http://127.0.0.1:${port}`;
    const lanAddress = selectLanIPv4(networkInterfaces());
    const lanUrl = lanAddress ? `http://${lanAddress}:${port}` : null;
    const ownerToken = await login(url, 'john', 'owner');
    const member = await request(`${url}/api/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ username: 'member', password: 'password1', displayName: 'Sample Member', role: 'member' }),
    });
    // Default member grants are intentionally retained (create/edit, not delete/admin).
    const memberId = member.data.id;
    if (!memberId) throw new Error('Member fixture was not created');
    const tokens = { john: ownerToken, jane: await login(url, 'jane', 'admin'), member: await login(url, 'member', 'member') };
    async function doctor() {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned app process exited');
      const actual = readFileSync(`/proc/${child.pid}/environ`, 'utf8').split('\0');
      if (actual.some((value) => value.startsWith('LOGODEV_TOKEN=')) || !actual.includes(`DATABASE_PATH=${database}`) || !actual.includes('NODE_ENV=production') || realpathSync(`/proc/${child.pid}/cwd`) !== scratch) {
        throw new Error('Owned app environment does not match the throwaway database');
      }
      if ((await request(`${url}/api/health`)).status !== 'ok') throw new Error('Local health failed');
      if (lanUrl && (await request(`${lanUrl}/api/health`)).status !== 'ok') throw new Error(`LAN health failed: ${lanUrl}`);
      for (const [username, role] of [['john', 'owner'], ['jane', 'admin'], ['member', 'member']]) {
        const me = await request(`${url}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens[username]}` } });
        if (me.data.role !== role) throw new Error(`Role check failed: ${role}`);
        if (role === 'member' && (me.data.permissions['transactions.delete'] || !me.data.permissions['transactions.create'])) throw new Error('Member is not limited as expected');
      }
      const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!page.ok || !(await page.text()).includes('<div id="root">')) throw new Error('Production client missing');
      return {
        status: 'PASS', url, lanUrl, database, logos, roles: ['owner', 'admin', 'limited member'], childPid: child.pid,
        ...(lanUrl ? {} : { note: 'No LAN IPv4 address found; the app is reachable locally only.' }),
      };
    }
    await doctor();
    control = createServer(async (req, res) => {
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
      try {
        if (req.method === 'POST' && req.url === '/cleanup') {
          await cleanup(); res.end(JSON.stringify({ status: 'PASS', cleaned: true }));
        } else if (req.method === 'GET' && req.url === '/doctor') {
          res.end(JSON.stringify(await doctor()));
        } else res.writeHead(404).end();
      } catch (error) { res.writeHead(500).end(JSON.stringify({ error: error.message })); }
    });
    await new Promise((done) => control.listen(0, '127.0.0.1', done));
    json(resolve(evidence, 'run.json'), { url, lanUrl, database, scratch, childPid: child.pid, supervisorPid: process.pid, control: `http://127.0.0.1:${control.address().port}`, token });
    child.once('exit', () => { if (!stopping) void cleanup().catch((error) => { console.error(error.message); process.exitCode = 1; }); });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function main(action, evidenceArg, extra = []) {
  refuseDatabase(process.env, extra); // before ANY filesystem access, build, or spawn
  if (!['launch', 'doctor', 'cleanup', '_serve'].includes(action) || !evidenceArg) throw new Error('Usage: node .pi/skills/verify-ledger/run.mjs launch|doctor|cleanup /absolute/evidence-folder');
  const candidate = resolve(evidenceArg);
  if (!evidenceArg.startsWith('/') || candidate.split('/').includes('data')) throw new Error('Use an absolute evidence folder outside data folders');
  const evidence = realpathSync(candidate);
  if (evidence === repo || evidence.startsWith(`${repo}/`) || evidence.split('/').includes('data')) throw new Error('Use an evidence folder outside the checkout and data folders');
  if (action === '_serve') return serve(evidence);
  const file = resolve(evidence, 'run.json');
  if (action === 'launch') {
    // Exclusive claim: cannot overwrite another run or its ownership record.
    const claim = openSync(resolve(evidence, 'launch.lock'), 'wx', 0o600); closeSync(claim);
    const build = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' });
    if (build.error || build.status !== 0) throw new Error('Build failed; no database started. Use a fresh evidence folder to retry.');
    const log = openSync(resolve(evidence, 'launcher.log'), 'wx', 0o600);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '_serve', evidence], { detached: true, stdio: ['ignore', log, log] });
    closeSync(log);
    await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    child.unref();
    for (let i = 0; i < 210; i++) {
      if (existsSync(file)) return main('doctor', evidence);
      if (existsSync(resolve(evidence, 'cleaned.json'))) throw new Error('Launch failed and cleaned up; inspect launcher.log and server.log');
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Supervisor exited; inspect launcher.log and cleanup marker');
      await sleep(500);
    }
    // The supervisor handles SIGTERM and removes only its in-memory scratch path.
    child.kill('SIGTERM');
    throw new Error('Launch timed out; inspect launcher.log and cleanup marker');
  }
  if (action === 'cleanup' && existsSync(resolve(evidence, 'cleaned.json'))) {
    console.log('Cleanup PASS (already cleaned); evidence retained'); return;
  }
  const state = JSON.parse(readFileSync(file, 'utf8'));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.control)) throw new Error('Invalid local control address');
  const result = await request(`${state.control}/${action}`, { method: action === 'cleanup' ? 'POST' : 'GET', headers: { Authorization: `Bearer ${state.token}` } });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2], process.argv[3], process.argv.slice(4)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
