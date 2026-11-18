// electron-builder settings for `pnpm --filter @corkboard/desktop package`.
// The built web client is copied into the app's resources as `web/`; the app's own server serves it from there.
// CORKBOARD_WEB_DIR packages another folder of built files instead of ../web/dist.
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const webDir = resolve(process.env.CORKBOARD_WEB_DIR || join(__dirname, '../web/dist'));
if (!existsSync(join(webDir, 'index.html'))) {
  throw new Error(`No index.html in ${webDir}. Build the web client first: pnpm --filter @corkboard/web build`);
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'org.corkboard.desktop',
  productName: 'Corkboard',
  copyright: 'Corkboard contributors',
  directories: { output: 'out', buildResources: 'build' },
  files: ['dist/**', 'package.json'],
  extraResources: [{ from: webDir, to: 'web' }],
  npmRebuild: false,
  // electron-builder uploads nothing and writes no update file of its own; CI publishes the build and updater.ts reads it.
  publish: null,
  // The packaged binary cannot be turned into a plain Node runtime or debugger by flags or environment.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
    // "-" signs ad hoc: no Apple identity, but Apple silicon refuses to run a binary with no signature at all.
    identity: '-',
    // Hardened runtime is for notarised builds; with an ad hoc signature it blocks Electron's own frameworks.
    hardenedRuntime: false,
  },
  dmg: { title: 'Corkboard' },
  win: { target: ['nsis', 'zip'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  linux: { target: ['AppImage', 'deb'], category: 'Office', maintainer: 'Corkboard contributors' },
};
