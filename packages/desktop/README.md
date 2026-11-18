# @corkboard/desktop

The Corkboard desktop app: a Corkboard server on this computer with a window
onto it. Agents reach boards only through a running server, so the app runs
one (`startServer` from `@corkboard/server`) inside its own process, on
`127.0.0.1:8422`, with its data folder in the app's user data. The window
loads the built web client (`packages/web`) from that server and syncs with
it exactly as a browser does. The app owns the server's lifecycle and
settings, the window, and the native menu bar; it knows nothing about
boards. The web client talks to it only through `window.corkboardShell`,
declared in `packages/web/src/shell-bridge.ts`.

## Layout

| File | Owns |
| --- | --- |
| `src/main.ts` | App lifecycle, the window, permissions, navigation guards, IPC registration, the port notice, closing the server on quit. |
| `src/embedded-server.ts` | The app's server: choosing its port, starting it with the saved settings, restarting it when they change, its state for the page. No Electron imports. |
| `src/preload.ts` | Sets `window.corkboardShell` in the sandboxed page. |
| `src/ipc.ts` | What each bridge call does: argument checks, refusing the app's own address, saving settings, restarting the server. No Electron imports. |
| `src/settings-file.ts` | The server to sync with, the Looseleaf server and the fallback port, in `settings.json` in user data (mode 0600), and what a valid server link is. |
| `src/menu.ts` | The menu bar template. |
| `src/window-state.ts` | Remembered window size and position. |
| `src/updater.ts` | In-app updates for the Mac build: reading the release's manifest, downloading and checking a newer build, and the script that swaps it in after the app exits. No Electron imports. |
| `src/channels.ts` | IPC channel names shared by main and preload. |
| `scripts/smoke.ts` | Launches the built app and drives the real web client in its window. |
| `build/` | The app icon: `icon.svg` is the source, `icon.png` and `icon.icns` are generated from it (below). |

## The app's server

- It listens on `127.0.0.1` only, so the boards are reachable from this
  computer and nowhere else. Agents on this computer connect to
  `http://127.0.0.1:8422/mcp` with the token in `<user data>/data/token`;
  **Connect an assistant** in the app shows both, and File → Copy MCP Address
  copies the address.
- When another program answers on 8422, the app starts on the port it used the
  last time that happened, or on any free port, and says so in a message at each
  start while 8422 stays taken.
  Agents set up for 8422 cannot reach it until 8422 is free again.
- Its data folder is `<user data>/data`, laid out as in
  [packages/server/README.md](../server/README.md). File → Show Data Folder
  reveals it. User data is `~/Library/Application Support/Corkboard` on macOS,
  `%APPDATA%\Corkboard` on Windows and `~/.config/Corkboard` on Linux.
- On macOS closing the window leaves the app and its server running, so agents
  keep working; the dock icon opens the window again. On Windows and Linux
  closing the window quits. Quitting stores pending writes and closes every
  connection before the process exits.
- **Open at Login** (in the app menu on macOS, in File on Windows) starts the
  app when you log in. On macOS it then starts without a window.

## Server to sync with and Looseleaf

First run asks whether to connect to a server or keep boards on this computer
only, then for your name. Settings → **Sync** connects, changes or disconnects
the server to sync with: another Corkboard server that the app's server keeps
in step with as its upstream (see "Upstream" in
[docs/architecture.md](../../docs/architecture.md)). Settings → **Looseleaf**
does the same for the Looseleaf server that linked pages are read from.

The page checks an address and token before saving them (the same check as a
browser's first run), the main process checks the arguments again and refuses
the app's own address, and saving restarts the app's server on the same port.
The window's sync client reconnects by itself within a second or two; the
sync status shows **Connecting…** meanwhile. Both links are kept in
`settings.json` in user data, readable by this user only.

## Run

```sh
pnpm --filter @corkboard/web build      # the app's server serves packages/web/dist
pnpm --filter @corkboard/desktop dev     # builds main + preload, starts Electron
```

Environment variables, read only when the app is not packaged:

| Variable | Effect |
| --- | --- |
| `CORKBOARD_WEB_DIR` | Serve built files from this folder instead of `../web/dist`. Also read by `package`. |
| `CORKBOARD_USER_DATA_DIR` | Keep the profile (the window's replica, window state, settings) and the data folder in this folder. |
| `CORKBOARD_PORT` | Try this port first instead of 8422; `0` takes any free port. |

A development run with the default profile uses port 8422 and the same user
data as an installed app, so quit the installed app first, or give the run its
own `CORKBOARD_USER_DATA_DIR` and `CORKBOARD_PORT=0`.

## Build, test, smoke

```sh
pnpm --filter @corkboard/desktop build      # esbuild → dist/main.cjs, dist/preload.cjs
pnpm --filter @corkboard/desktop test       # vitest, Node only
pnpm --filter @corkboard/desktop typecheck
pnpm --filter @corkboard/desktop smoke      # needs a desktop session and a built web client
```

`smoke` launches the app with a temporary profile on a free port and drives the
real web client: the bridge is there and Node globals are not, first run asks
only where boards sync and for the name, the window reaches "synced" with the
app's server, a card an agent makes through the app's MCP endpoint appears,
Connect an assistant shows the run's address, the app refuses its own address
and a wrong token, and saving a second server started by the script restarts
the app's server, after which the window reconnects and the two servers end
with the same cards. It also checks the token is in neither the window's
address nor the app's output, and that the app quits with exit code 0.

## Package

```sh
pnpm --filter @corkboard/web build
pnpm --filter @corkboard/desktop package
```

Output goes to `packages/desktop/out/`. On a Mac this makes
`Corkboard-<version>-arm64.dmg` and a `.zip` for the Mac's own architecture;
add `--x64` or `--universal` to the command for others. Windows (NSIS installer
and zip) and Linux (AppImage and deb) targets are configured in
`electron-builder.config.cjs`; build each on its own platform or in CI.

electron-builder runs through `npx` at a pinned version and is not in the
lockfile. Adding it as a workspace dependency needs `electron-winstaller: false`
under `allowBuilds` in `pnpm-workspace.yaml`; without it pnpm refuses to run
scripts.

### The icon

`build/icon.svg` is Corkboard's mark from `packages/web/public/icon.svg`,
placed on the 824 px tile of a 1024 px canvas the way macOS app icons are
drawn. After changing it, regenerate the other two on a Mac with
`rsvg-convert` (Homebrew `librsvg`):

```sh
cd packages/desktop/build
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
mkdir icon.iconset
for s in 16 32 128 256 512; do
  rsvg-convert -w $s -h $s icon.svg -o icon.iconset/icon_${s}x${s}.png
  rsvg-convert -w $((s*2)) -h $((s*2)) icon.svg -o icon.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns && rm -r icon.iconset
```

### Unsigned builds

The build is signed ad hoc, not with an Apple Developer ID, and is not
notarised. An app built on your own Mac opens normally. One that was downloaded
is quarantined, and macOS says "Corkboard" Not Opened: Apple could not verify it
is free of malware. To open it:

- macOS 15 and later: open System Settings → Privacy & Security, find the
  message that Corkboard was blocked, choose **Open Anyway** and confirm.
- macOS 14 and earlier: Control-click the app in Finder, choose **Open**, then
  **Open** in the dialog.
- Or clear the quarantine flag: `xattr -dr com.apple.quarantine /Applications/Corkboard.app`

On Windows, SmartScreen shows "Windows protected your PC" for an unsigned
installer: choose **More info**, then **Run anyway**.

### Signing and notarising

- **macOS**: an Apple Developer Program membership and a "Developer ID
  Application" certificate, in the keychain or given as `CSC_LINK` and
  `CSC_KEY_PASSWORD`. In `electron-builder.config.cjs` remove `identity: '-'` and
  set `hardenedRuntime: true`. For notarisation set either `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or an App Store Connect API
  key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`); electron-builder
  then notarises and staples the app and dmg.
- **Windows**: a code-signing certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`) or
  Azure Trusted Signing (`win.azureSignOptions`).

## Updates

Every push to `main` that passes CI builds the Apple silicon Mac app as version
`0.1.<CI run number>` and replaces the
[release tagged `latest`](https://github.com/trapp01/Corkboard/releases/tag/latest)
with two files: `Corkboard-arm64-mac.zip` and `latest.json`, which gives the
zip's version, name, sha256 and size.

The packaged Mac app reads `latest.json` at launch and every 4 hours. For a
later version it downloads the zip into `updates/` in its user data folder,
checks the length and sha256 against the manifest, unpacks it, and checks that
the app inside has Corkboard's bundle identifier, the manifest's version and a
signature that matches its files. The web client then shows "Version 0.1.57 is
ready." with **Restart to update**. When the app quits, by that button or
later, a shell script waits for it to exit and moves the new app to where the
old one was, after the app's server has closed; with the button it reopens the app. Anything that fails is logged
and leaves the running app as it is.

- An app built on your own computer has version 0.1.0, so it updates to the
  latest published build. Run it with `pnpm --filter @corkboard/desktop dev` to
  stay on your own code; unpackaged runs never update.
- Updates are off, with a line in the log, when the app's folder is not
  writable by the user or macOS is running the app from a quarantined download
  that was never moved in Finder.
- The build has no Apple Developer ID, so there is no publisher signature to
  check. An update is trusted because it came from this repository's release
  over HTTPS and matches the manifest's sha256: whoever can push to `main` or
  edit the release can ship code to every installed app.
- Installing an update closes the app's server and starts it again with the
  new app, on the same port, so an assistant's requests fail for those seconds.
- Windows and Linux builds do not update themselves.

## Security model

- The page runs sandboxed with context isolation and no Node integration;
  `webSecurity` is on. `window.corkboardShell` is the only thing the preload adds.
- Every IPC handler checks that the calling frame is on the app's server's
  origin and checks each argument's shape; a server link must be an http(s)
  address and a token, and the server to sync with cannot be the app itself.
- The access token reaches the page only through `serverAccess`, which answers
  only the app's origin. It is never put in a URL, on a command line, in the
  environment or in a log line, and the settings file that holds the other
  servers' tokens is mode 0600.
- The app's server listens on `127.0.0.1` only. A port is checked by
  connecting to it before listening, because listening on `127.0.0.1` can
  succeed while another program holds the same port on every interface.
- Every permission request is denied except writing to the clipboard.
- The window never leaves the app's origin: links and `window.open` with
  http(s) or mailto open in the system browser, an attachment the page opens
  in a new window is saved through a save dialog, everything else is dropped,
  and `<webview>` is refused.
- Packaged builds flip Electron's fuses so the binary cannot run as plain Node,
  read `NODE_OPTIONS` or take inspector flags, and loads its code only from the
  app archive.

## Notes for the web client

- On macOS the window has no native title bar. The top bar is the title bar:
  `data-shell="darwin"` on `<html>` gives it 80 px of room at the left for the
  window buttons and makes it the drag region, with `no-drag` on its controls
  and on anything that can cover it. Windows and Linux keep the native frame
  and menu bar.
- Menu items arrive through `onMenuCommand` and run the same action as the
  page's own control (`packages/web/src/desktop/menu-commands.ts`). Undo, redo,
  cut, copy, paste, select all and zoom are native roles.
- Service workers are not registered in the app; the files are already local.
- The window's origin includes the port, so its replica and the name given at
  first run belong to that port. That is why a fallback port is remembered.
