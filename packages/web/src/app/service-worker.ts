/** Registers the app-shell service worker where the browser allows one (secure contexts only, so not on http://nas:8422). */
export function registerServiceWorker(): void {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
