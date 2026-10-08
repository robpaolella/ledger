import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// Read only a small regular file. No errors, paths, child output or key material
// may escape this helper: even an upstream error could contain a request URL.
export function hydrateLogos(scratch, env, {
  tokenFile = process.env.LEDGER_LOGODEV_TOKEN_FILE ?? resolve(homedir(), 'ledger-live/logodev-token/token.txt'),
  script = resolve(scratch, 'packages/server/dist/db/hydrate-institution-logos.js'),
  timeout = 60_000,
} = {}) {
  let key;
  let fd;
  try {
    fd = openSync(tokenFile, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096) return { status: 'not configured', loaded: 0 };
    key = readFileSync(fd, 'utf8').trim();
  } catch {
    return { status: 'not configured', loaded: 0 };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  // Reject multiple values rather than accidentally sending a second credential.
  if (!key || /[\r\n]/.test(key)) return { status: 'not configured', loaded: 0 };
  key = key.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, '').trim();
  if (!key) return { status: 'not configured', loaded: 0 };
  const result = spawnSync(process.execPath, [script], {
    cwd: scratch, env: { ...env, LOGODEV_TOKEN: key }, stdio: 'ignore',
    timeout, killSignal: 'SIGKILL',
  });
  let loaded = 0;
  try {
    loaded = readdirSync(resolve(scratch, 'uploads'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^(institution|vendor)-\d+\.(webp|png|jpg|jpeg|gif)$/.test(entry.name)).length;
  } catch { /* No downloads is a valid outcome. */ }
  return {
    status: result.error?.code === 'ETIMEDOUT' ? 'timed out' : result.status === 2 ? 'key rejected' : result.error || result.status !== 0 ? 'failed' : 'complete',
    loaded,
  };
}
