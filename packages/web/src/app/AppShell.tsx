/**
 * The app once first run is done: the top bar, the board the address names
 * (with its card open over it at /c/<ref>), the dialogs and the notices. It
 * resolves the route to a board, opens that board's doc, keeps `/` pointing
 * at a real board, and asks before the tab closes while changes are not yet
 * stored.
 */
import { useEffect } from 'react';
import { boardDocId, boardPath } from '@corkboard/model';
import { BoardContext, type CurrentBoard } from '../board/board-context.js';
import { BoardView } from '../board/BoardView.js';
import { useBoard } from '../board/use-board.js';
import { CardBack, MissingCard } from '../card/CardBack.js';
import { EmptyWorkspace, MissingBoard } from '../workspace/EmptyWorkspace.js';
import { homeBoard, rememberBoard, useBoardEntries } from '../workspace/use-workspace.js';
import { Dialogs } from './Dialogs.js';
import { guardLeaving } from './leave-guard.js';
import { useServices } from './services.js';
import { useShortcuts } from './shortcuts.js';
import { useMenuCommands } from '../desktop/menu-commands.js';
import { UpdateBar } from '../desktop/UpdateBar.js';
import { useStore } from './store.js';
import { Toaster } from './toasts.js';
import { TopBar } from './TopBar.js';
import { useOpenDoc } from './yjs-hooks.js';
import { patchUi, NO_FILTER } from './ui-state.js';

export function AppShell({ persistent }: { persistent: boolean }) {
  const services = useServices();
  const { client, workspace, router, ui, toasts } = services;
  const entries = useBoardEntries(workspace);
  const route = useStore(router.route);

  const key = route.kind === 'board' || route.kind === 'card' ? route.key : null;
  const entry = key === null ? null : (entries.find((candidate) => candidate.key === key) ?? null);
  const doc = useOpenDoc(client, entry ? boardDocId(entry.id) : null);
  const { board, flashing } = useBoard(doc);
  const current: CurrentBoard | null = entry && doc && board ? { entry, doc, board, flashing } : null;

  useEffect(() => {
    if (route.kind !== 'home' && route.kind !== 'unknown') return;
    const home = homeBoard(entries);
    if (home) router.navigate(boardPath(home.key), { replace: true });
    else if (route.kind === 'unknown') router.navigate('/', { replace: true });
  }, [route, entries, router]);

  const entryId = entry?.id ?? null;
  useEffect(() => {
    client.setPriorityDoc(entryId ? boardDocId(entryId) : null);
    if (entryId) rememberBoard(entryId);
    // Filters belong to one board; another board starts unfiltered.
    patchUi(ui, { filter: NO_FILTER, composer: null });
  }, [client, ui, entryId]);

  useEffect(() => guardLeaving(() => client.status.unstoredDocs > 0), [client]);
  useShortcuts(services, current);
  useMenuCommands(services, current);

  const liveBoards = entries.filter((candidate) => candidate.archivedAt === null);
  let main;
  if (current) main = <BoardView current={current} />;
  else if (key !== null && entry === null) main = <MissingBoard boardKey={key} />;
  else if (key === null && liveBoards.length === 0) main = <EmptyWorkspace hasArchived={entries.length > 0} />;
  else main = <div className="board-loading" aria-busy="true" />;

  return (
    <BoardContext.Provider value={current}>
      <div className="app" data-board-color={entry?.color}>
        <TopBar entries={entries} current={current} />
        <UpdateBar />
        {!persistent && <div className="banner">This browser isn’t keeping data for this site, so changes last until the tab closes.</div>}
        <main className="main-area">{main}</main>
        {route.kind === 'card' &&
          current &&
          (() => {
            const card = current.board.cards.find((candidate) => candidate.number === route.number);
            return card ? <CardBack key={card.id} card={card} /> : <MissingCard boardKey={current.entry.key} number={route.number} />;
          })()}
        <Dialogs />
        <Toaster toasts={toasts} />
      </div>
    </BoardContext.Provider>
  );
}
