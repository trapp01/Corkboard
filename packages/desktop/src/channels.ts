/**
 * IPC channel names shared by the preload script and the main process. Each
 * bridge method in `ShellBridge` has one channel; `serverStateChanged` and
 * `menuCommand` run main → page.
 */
export const CHANNELS = {
  serverAccess: 'corkboard:server-access',
  serverState: 'corkboard:server-state',
  setUpstream: 'corkboard:set-upstream',
  setLooseleaf: 'corkboard:set-looseleaf',
  openLooseleafPage: 'corkboard:open-looseleaf-page',
  serverStateChanged: 'corkboard:server-state-changed',
  menuCommand: 'corkboard:menu-command',
} as const;

export type InvokeChannel = Exclude<
  (typeof CHANNELS)[keyof typeof CHANNELS],
  typeof CHANNELS.serverStateChanged | typeof CHANNELS.menuCommand
>;
