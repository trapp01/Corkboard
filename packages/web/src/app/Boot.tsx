/**
 * Decides between first run and the app. A device that has a server and a
 * name for its changes goes straight to the app; otherwise first run asks
 * for whichever is missing.
 */
import { useEffect, useState } from 'react';
import { AppShell } from './AppShell.js';
import { detectHostServer } from './connection.js';
import { FirstRun } from './FirstRun.js';
import { useServices } from './services.js';
import { useStore } from './store.js';
import { useSyncStatus } from '../sync-ui/use-sync-status.js';

export function Boot({ persistent }: { persistent: boolean }) {
  const { client, actor } = useServices();
  const status = useSyncStatus(client);
  const name = useStore(actor);
  const configured = status.server !== null && name.trim() !== '';
  const [phase, setPhase] = useState<'checking' | 'first-run' | 'app'>(configured ? 'app' : 'checking');
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    void detectHostServer().then((address) => {
      if (cancelled) return;
      setHost(address);
      setPhase('first-run');
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (phase === 'checking') return <div className="boot-blank" aria-busy="true" />;
  if (phase === 'first-run') return <FirstRun host={host} needsServer={status.server === null} onDone={() => setPhase('app')} />;
  return <AppShell persistent={persistent} />;
}
