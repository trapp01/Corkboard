/**
 * IPC channel names shared by the preload script and the main process. Each
 * bridge method in `ShellBridge` has one channel, except `onUpdateReady`,
 * which asks over `updateReady` and then listens on `updateReadyEvent`.
 * `serverStateChanged`, `menuCommand` and `updateReadyEvent` run main → page.
 */
export const CHANNELS = {
  serverAccess: 'corkboard:server-access',
  serverState: 'corkboard:server-state',
  setUpstream: 'corkboard:set-upstream',
  setLooseleaf: 'corkboard:set-looseleaf',
  openLooseleafPage: 'corkboard:open-looseleaf-page',
  updateReady: 'corkboard:update-ready',
  restartToUpdate: 'corkboard:restart-to-update',
  serverStateChanged: 'corkboard:server-state-changed',
  menuCommand: 'corkboard:menu-command',
  updateReadyEvent: 'corkboard:update-ready-event',
} as const;

export type InvokeChannel = Exclude<
  (typeof CHANNELS)[keyof typeof CHANNELS],
  typeof CHANNELS.serverStateChanged | typeof CHANNELS.menuCommand | typeof CHANNELS.updateReadyEvent
>;
