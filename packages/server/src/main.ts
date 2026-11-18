/**
 * The server process: reads its settings from the environment (listed in
 * packages/server/README.md), starts the server and stops it cleanly on
 * SIGTERM or SIGINT.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_BLOB_BYTES, DEFAULT_PORT, SERVER_VERSION, portAnswers, startServer } from './server.js';
import { DEFAULT_SNAPSHOT_KEEP } from './snapshots.js';

function numberFromEnv(name: string, fallback: number, { min }: { min: number }): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min}, got "${raw}"`);
  }
  return value;
}

/** An address and its token from two variables; null when neither is set. Setting only one is a mistake worth stopping for. */
function accessFromEnv(urlName: string, tokenName: string): { url: string; token: string } | null {
  const url = process.env[urlName]?.trim() ?? '';
  const token = process.env[tokenName]?.trim() ?? '';
  if (url === '' && token === '') return null;
  if (url === '' || token === '') throw new Error(`${urlName} and ${tokenName} must be set together`);
  return { url, token };
}

/** The Looseleaf server to read linked pages from, with the address its pages open at when that is set apart. */
function looseleafFromEnv(): { url: string; token: string; linkUrl?: string } | null {
  const access = accessFromEnv('CORKBOARD_LOOSELEAF_URL', 'CORKBOARD_LOOSELEAF_TOKEN');
  const linkUrl = process.env.CORKBOARD_LOOSELEAF_LINK_URL?.trim() ?? '';
  return access !== null && linkUrl !== '' ? { ...access, linkUrl } : access;
}

/**
 * The built web client's folder: CORKBOARD_WEB_DIR when set, else the one
 * that sits beside this file in the image or in a checkout that has run the
 * web build. Null when there is none.
 */
function webDirFromEnv(): string | null {
  if (process.env.CORKBOARD_WEB_DIR) return resolve(process.env.CORKBOARD_WEB_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'web'), join(here, '..', '..', 'web', 'dist')];
  return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? null;
}

async function main(): Promise<void> {
  const dataDir = resolve(process.env.CORKBOARD_DATA ?? './data');
  const port = numberFromEnv('CORKBOARD_PORT', DEFAULT_PORT, { min: 0 });
  // Listening can succeed while another server (the desktop app, say) holds the port on 127.0.0.1; callers there would still reach that one.
  if (port !== 0 && (await portAnswers(port))) {
    throw new Error(`Port ${port} on this computer is already answered by another program, such as the Corkboard desktop app. Stop it, or set CORKBOARD_PORT to another port.`);
  }
  const server = await startServer({
    dataDir,
    port,
    host: process.env.CORKBOARD_HOST?.trim() || undefined,
    token: process.env.CORKBOARD_TOKEN,
    webDir: webDirFromEnv(),
    maxBlobBytes: numberFromEnv('CORKBOARD_MAX_BLOB_BYTES', DEFAULT_MAX_BLOB_BYTES, { min: 1 }),
    snapshotKeep: numberFromEnv('CORKBOARD_SNAPSHOT_KEEP', DEFAULT_SNAPSHOT_KEEP, { min: 1 }),
    upstream: accessFromEnv('CORKBOARD_UPSTREAM_URL', 'CORKBOARD_UPSTREAM_TOKEN'),
    looseleaf: looseleafFromEnv(),
  });
  const on = process.env.CORKBOARD_HOST?.trim() ? `${process.env.CORKBOARD_HOST.trim()} port` : 'port';
  console.log(`Corkboard server ${SERVER_VERSION} listening on ${on} ${server.port}, data in ${dataDir}`);
  console.log(`AI assistants connect to ${server.url}/mcp with the access token`);
  if (process.env.CORKBOARD_UPSTREAM_URL) console.log(`Keeping in step with the upstream server at ${process.env.CORKBOARD_UPSTREAM_URL}`);
  if (process.env.CORKBOARD_LOOSELEAF_URL) console.log(`Reading linked pages from Looseleaf at ${process.env.CORKBOARD_LOOSELEAF_URL}`);
  console.log(server.webDir === null ? 'No web client is served' : `Serving the web client from ${server.webDir}`);
  if (server.tokenGenerated) {
    console.log(`Generated an access token and saved it to ${server.tokenSource}:\n\n  ${server.token}\n`);
  } else {
    console.log(`Access token from ${server.tokenSource}`);
  }

  const stop = (signal: string) => {
    console.log(`${signal} received; storing pending updates and closing connections`);
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('Shutdown failed', error);
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
