import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server's own port (packages/server/dev.env), so a real server on 8422 is never proxied to.
const server = 'http://localhost:8423';

/**
 * Writes the built file names into the copied public/sw.js so the service
 * worker precaches the whole app on install, under a cache named for this
 * build. Source maps, HTML, text files and the .woff fallbacks of .woff2 fonts
 * are left out.
 */
function precacheServiceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'corkboard-precache',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    writeBundle(options, bundle) {
      const outDir = options.dir!;
      const publicFiles = readdirSync(publicDir).filter((name) => name !== 'sw.js');
      const assets = [...Object.keys(bundle), ...publicFiles].filter((name) => !/\.(html|map|txt|woff)$/.test(name)).sort();
      const build = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      const file = join(outDir, 'sw.js');
      const source = readFileSync(file, 'utf8');
      const filled = source.replace("const BUILD = 'dev';", `const BUILD = '${build}';`).replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(assets)};`);
      if (!filled.includes(build) || filled.includes('const ASSETS = [];')) throw new Error(`The precache plugin could not find BUILD and ASSETS in ${file}`);
      writeFileSync(file, filled);
    },
  };
}

// Absolute asset paths, because the app answers deep paths such as /c/WEB-12 with the same index.html.
export default defineConfig({
  base: '/',
  plugins: [react(), precacheServiceWorker()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: {
    proxy: {
      '/api': server,
      '/mcp': server,
      '/sync': { target: server, ws: true },
    },
  },
});
