/**
 * The Electron main process. It runs a Corkboard server in this process on
 * 127.0.0.1 (`embedded-server.ts`), so agents on this computer can reach the
 * boards at its MCP endpoint, and opens one window on that server's web
 * client, which syncs with it as a browser would. It also owns the native
 * menu, the bridge's IPC handlers, and closing the server cleanly on quit.
 * It knows nothing about boards.
 *
 * Unpackaged runs read three environment variables: CORKBOARD_WEB_DIR serves
 * another folder of built files, CORKBOARD_USER_DATA_DIR keeps the profile and
 * data folder elsewhere, and CORKBOARD_PORT replaces 8422 (0 for any free
 * port). Packaged builds ignore all three.
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, session, shell, type WebContents } from 'electron';
import { join, resolve } from 'node:path';
import { CHANNELS } from './channels.js';
import { DEFAULT_PORT, EmbeddedServer } from './embedded-server.js';
import { createHandlers, isSameOrigin } from './ipc.js';
import { menuTemplate } from './menu.js';
import { loadSettings, saveSettings } from './settings-file.js';
import { loadWindowState, MIN_HEIGHT, MIN_WIDTH, saveWindowState } from './window-state.js';

const dev = !app.isPackaged;
const webDir = app.isPackaged
  ? join(process.resourcesPath, 'web')
  : resolve(process.env.CORKBOARD_WEB_DIR || join(app.getAppPath(), '../web/dist'));
const preferredPort = dev && process.env.CORKBOARD_PORT ? Number(process.env.CORKBOARD_PORT) : DEFAULT_PORT;
/** How often the window is told whether the link to the server to sync with is up. */
const SERVER_STATE_POLL_MS = 1000;
/** How long quitting waits for the server to store pending writes before the app exits anyway. */
const QUIT_TIMEOUT_MS = 8000;

if (dev && process.env.CORKBOARD_USER_DATA_DIR) app.setPath('userData', resolve(process.env.CORKBOARD_USER_DATA_DIR));
app.enableSandbox();

const dataDir = join(app.getPath('userData'), 'data');
const settingsFile = join(app.getPath('userData'), 'settings.json');
const server = new EmbeddedServer({ dataDir, webDir, preferredPort: Number.isInteger(preferredPort) ? preferredPort : DEFAULT_PORT });
let mainWindow: BrowserWindow | null = null;
/** A window can open once the server has an address for it to load. */
let serverStarted = false;
let serverClosed = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!serverStarted || serverClosed) return;
    if (!mainWindow) return createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  // On macOS the app and its server keep running with no window, so agents keep working.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (serverStarted && !serverClosed && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', (event) => {
    if (serverClosed) return;
    event.preventDefault();
    serverClosed = true;
    // A close that never finishes (a stuck disk) must not keep the app from quitting.
    const timeout = setTimeout(() => app.exit(1), QUIT_TIMEOUT_MS);
    server.close().then(
      () => {
        clearTimeout(timeout);
        app.quit();
      },
      (error: unknown) => {
        console.error("Could not close the app's server cleanly", error);
        app.exit(1);
      },
    );
  });
  app.on('web-contents-created', (_event, contents) => guardNavigation(contents));
  app.whenReady().then(start).catch((error: unknown) => {
    console.error(error);
    dialog.showErrorBox('Corkboard could not start', error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
}

async function start(): Promise<void> {
  app.setAboutPanelOptions({ applicationName: 'Corkboard', applicationVersion: app.getVersion() });
  allowOnlyClipboardWrite();
  await server.start(loadSettings(settingsFile));
  serverStarted = true;
  rememberFallbackPort();
  registerIpc();
  buildMenu();
  setInterval(pushServerState, SERVER_STATE_POLL_MS);
  const openedAtLogin = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  if (!openedAtLogin) createWindow();
  if (server.onOtherPort) void showPortNotice();
}

/** Saves the port used while 8422 is taken, so the next start tries it first. */
function rememberFallbackPort(): void {
  if (!server.onOtherPort) return;
  const settings = loadSettings(settingsFile);
  if (settings.fallbackPort !== server.port) saveSettings(settingsFile, { ...settings, fallbackPort: server.port });
}

async function showPortNotice(): Promise<void> {
  await dialog.showMessageBox({
    type: 'warning',
    message: `Port ${preferredPort} is in use by another program`,
    detail:
      `Assistants set up for http://127.0.0.1:${preferredPort}/mcp can’t reach this app until that port is free. ` +
      `This time Corkboard uses port ${server.port}; Connect an Assistant shows the address to use.`,
    buttons: ['OK'],
  });
}

function allowOnlyClipboardWrite(): void {
  const allowed = new Set(['clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const allow = allowed.has(permission) && isSameOrigin(details.requestingUrl, server.url);
    if (!allow) console.warn(`Denied the "${permission}" permission to ${details.requestingUrl}`);
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) => allowed.has(permission) && isSameOrigin(requestingOrigin, server.url),
  );
}

function registerIpc(): void {
  const handlers = createHandlers({
    settingsFile,
    hasAppFor: (address) => app.getApplicationNameForProtocol(address) !== '',
    openExternal: (address) => shell.openExternal(address),
    server: {
      access: () => server.access(),
      state: () => server.state(),
      apply: async (settings) => {
        const before = server.url;
        try {
          await server.apply(settings);
        } catch (error) {
          if (!server.isRunning) {
            dialog.showErrorBox("Corkboard's server stopped", `It could not be started again: ${(error as Error).message}\n\nQuit and reopen Corkboard.`);
          }
          pushServerState();
          throw error;
        }
        rememberFallbackPort();
        // The port could only change if another program took it during the restart; the page must follow.
        if (server.url !== before) mainWindow?.loadURL(`${server.url}/`).catch((error: unknown) => console.error(error));
        pushServerState();
      },
    },
  });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url ?? '';
      if (!isSameOrigin(senderUrl, server.url)) {
        throw new Error(`Refused ${channel} from ${senderUrl || 'a frame that has gone away'}`);
      }
      return handler(args);
    });
  }
}

let lastServerState = '';
function pushServerState(): void {
  if (serverClosed) return;
  let state;
  try {
    state = server.state();
  } catch {
    // Between a restart's close and its start there is no state to report.
    return;
  }
  const text = JSON.stringify(state);
  if (text === lastServerState) return;
  lastServerState = text;
  mainWindow?.webContents.send(CHANNELS.serverStateChanged, state);
}

function buildMenu(): void {
  const template = menuTemplate(
    process.platform,
    {
      send: (command) => {
        // With no window open (macOS), the item opens the window and the command is dropped.
        if (!mainWindow) return createWindow();
        mainWindow.webContents.send(CHANNELS.menuCommand, command);
      },
      copyMcpAddress: () => clipboard.writeText(`${server.url}/mcp`),
      showDataFolder: () => shell.showItemInFolder(dataDir),
      setOpenAtLogin: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
    },
    { openAtLogin: app.getLoginItemSettings().openAtLogin },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const stateFile = join(app.getPath('userData'), 'window-state.json');
  const state = loadWindowState(stateFile, screen.getAllDisplays().map((d) => d.workArea));
  const mac = process.platform === 'darwin';
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'Corkboard',
    // On macOS the web client's top bar is the title bar; the traffic lights sit centred in its first 52 px.
    titleBarStyle: mac ? 'hidden' : 'default',
    trafficLightPosition: mac ? { x: 14, y: 19 } : undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow = window;
  if (state.maximized) window.maximize();

  window.on('close', () => saveWindowState(stateFile, window.getNormalBounds(), window.isMaximized()));
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.once('ready-to-show', () => window.show());
  // A new page asks for the state itself; the next change is pushed whatever it is.
  window.webContents.on('did-start-loading', () => (lastServerState = ''));

  window.loadURL(`${server.url}/`).catch((error: unknown) => console.error(`Could not load ${server.url}:`, error));
}

/**
 * Keeps every page on the app server's origin, in the one window. http(s) and
 * mailto links open in the system browser, an attachment the page opens in a
 * new window is saved with a save dialog, and everything else is dropped.
 */
function guardNavigation(contents: WebContents): void {
  const openOutside = (url: string) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url).catch((error: unknown) => console.error(error));
  };
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`blob:${server.url}/`)) contents.downloadURL(url);
    else if (isSameOrigin(url, server.url)) {
      // A link in card text to a board or a card opens here; any other address of the app's server would replace the app with a bare page.
      if (/^\/(?:$|[bc]\/)/.test(new URL(url).pathname)) contents.loadURL(url).catch((error: unknown) => console.error(error));
    } else openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isSameOrigin(url, server.url)) return;
    event.preventDefault();
    openOutside(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (!isSameOrigin(url, server.url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
