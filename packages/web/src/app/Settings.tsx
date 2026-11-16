/** Settings: your name (the actor on your changes), the theme, and the server this browser syncs with. */
import { useEffect, useState, type FormEvent } from 'react';
import { fetchServerInfo } from '@corkboard/sync';
import { Dialog } from './controls.js';
import { NameField, ServerForm } from './FirstRun.js';
import { useServices, type ThemeChoice } from './services.js';
import { useStore } from './store.js';
import { SyncDetails } from '../sync-ui/SyncStatusControl.js';
import { useSyncStatus } from '../sync-ui/use-sync-status.js';

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'Match the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Settings({ onClose }: { onClose: () => void }) {
  const { client, actor, theme } = useServices();
  const status = useSyncStatus(client);
  const currentTheme = useStore(theme);
  const [name, setName] = useState(actor.get());
  const [saved, setSaved] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const version = useServerVersion(status.server);

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    actor.set(name.trim());
    setSaved(true);
  };

  return (
    <Dialog title="Settings" onClose={onClose}>
      <form className="settings-section stack" onSubmit={saveName}>
        <NameField
          value={name}
          onChange={(value) => {
            setName(value);
            setSaved(false);
          }}
        />
        <div className="form-actions start">
          <button type="submit" className="button primary" disabled={name.trim() === '' || name.trim() === actor.get()}>
            Save name
          </button>
          {saved && <span className="muted small">Saved</span>}
        </div>
      </form>
      <fieldset className="settings-section field">
        <legend>Theme</legend>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((option) => (
            <label key={option.value} className={`segment ${currentTheme === option.value ? 'is-selected' : ''}`}>
              <input type="radio" name="theme" value={option.value} checked={currentTheme === option.value} onChange={() => theme.set(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <section className="settings-section">
        <h3>Server</h3>
        {editingServer ? (
          <ServerForm
            initialAddress={status.server ?? ''}
            fixedAddress={status.server ?? undefined}
            submitLabel="Save token"
            onDone={() => setEditingServer(false)}
            onCancel={() => setEditingServer(false)}
          />
        ) : (
          <>
            <SyncDetails status={status} />
            {version && <p className="muted small">Corkboard server {version}</p>}
            <div className="form-actions start">
              <button type="button" className="button" onClick={() => setEditingServer(true)}>
                Change access token
              </button>
            </div>
          </>
        )}
      </section>
    </Dialog>
  );
}

function useServerVersion(server: string | null): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    fetchServerInfo(server).then(
      (info) => !cancelled && setVersion(info.version),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [server]);
  return version;
}
