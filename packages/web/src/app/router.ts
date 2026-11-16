/**
 * The app's addresses: `/` (the last board opened, or the first), `/b/<KEY>`
 * for a board and `/c/<KEY>-<n>` for a card open over its board. The current
 * route is a Store kept in step with the History API; `navigate` is the only
 * way the app changes the address.
 */
import { boardPath, cardPath, parseCardRef } from '@corkboard/model';
import { Store } from './store.js';

export type Route =
  | { kind: 'home' }
  | { kind: 'board'; key: string }
  | { kind: 'card'; key: string; number: number }
  | { kind: 'unknown'; path: string };

/** What a path names. Keys are matched in upper case, so `/b/web` opens WEB. */
export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  const board = /^\/b\/([A-Za-z][A-Za-z0-9]*)$/.exec(path);
  if (board) return { kind: 'board', key: board[1]!.toUpperCase() };
  if (path.startsWith('/c/')) {
    const ref = parseCardRef(path);
    if (ref) return { kind: 'card', key: ref.key, number: ref.number };
  }
  return { kind: 'unknown', path };
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'board':
      return boardPath(route.key);
    case 'card':
      return cardPath(`${route.key}-${route.number}`);
    case 'unknown':
      return route.path;
  }
}

export class Router {
  readonly route = new Store<Route>(parseRoute(location.pathname));

  constructor() {
    window.addEventListener('popstate', () => this.route.set(parseRoute(location.pathname)));
  }

  /** Changes the address. `replace` swaps the current history entry instead of adding one. */
  navigate(path: string, { replace = false }: { replace?: boolean } = {}): void {
    if (path !== location.pathname) {
      if (replace) history.replaceState(null, '', path);
      else history.pushState(null, '', path);
    }
    const next = parseRoute(path);
    const current = this.route.get();
    if (routePath(current) !== routePath(next)) this.route.set(next);
  }
}
