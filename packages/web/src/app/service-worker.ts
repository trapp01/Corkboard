import { shell } from '../shell-bridge.js';

/**
 * Registers the app-shell service worker where the browser allows one (secure
 * contexts only, so not on http://nas:8422). Never in the desktop app: its
 * files come from this computer, and a worker would serve a stale client
 * after an update.
 */
export function registerServiceWorker(): void {
  if (shell() || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
