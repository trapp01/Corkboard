/**
 * The desktop app's sections of Settings: the server to sync with (connect,
 * change, disconnect) and the Looseleaf server linked pages are read from.
 * Each change is checked here, saved through the bridge, and applied by the
 * app restarting its server; this window reconnects to it by itself.
 */
import { useState } from 'react';
import { checkLooseleaf } from '../app/connection.js';
import { ServerForm, saveUpstream } from '../app/FirstRun.js';
import { useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { bridgeErrorMessage, shell, type AppServerState, type ServerLink } from '../shell-bridge.js';

export function AppServerSettings() {
  const app = useStore(useServices().appServer);
  if (!app) return null;
  return (
    <>
      <UpstreamSection app={app} />
      <LooseleafSection app={app} />
    </>
  );
}

function UpstreamSection({ app }: { app: AppServerState }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upstream = app.upstream;

  const disconnect = async () => {
    setError(null);
    try {
      await bridge().setUpstream(null);
      setConfirming(false);
    } catch (e) {
      setError(bridgeErrorMessage(e));
    }
  };

  return (
    <section className="settings-section">
      <h3>Sync</h3>
      {editing ? (
        <ServerForm
          initialAddress={upstream?.url ?? ''}
          submitLabel={upstream ? 'Change server' : 'Connect'}
          save={saveUpstream}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="muted">
            {upstream
              ? `Syncing with ${upstream.url}. ${linkState(upstream)}`
              : 'Boards are kept on this computer only. Connecting uploads everything already on this computer.'}
          </p>
          <div className="form-actions start">
            <button type="button" className="button primary" onClick={() => setEditing(true)}>
              {upstream ? 'Change server or token' : 'Connect to a server'}
            </button>
            {upstream &&
              (confirming ? (
                <>
                  <span className="muted">Stop syncing? Boards stay on this computer.</span>
                  <button type="button" className="button danger" onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                </>
              ) : (
                <button type="button" className="button" onClick={() => setConfirming(true)}>
                  Disconnect
                </button>
              ))}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function linkState(upstream: NonNullable<AppServerState['upstream']>): string {
  if (upstream.tokenRefused) return 'It refused the access token; enter the current one.';
  if (upstream.connected) return 'Connected.';
  return 'It can’t be reached right now; changes sync when it’s back.';
}

function LooseleafSection({ app }: { app: AppServerState }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const looseleaf = app.looseleaf;

  const disconnect = async () => {
    setError(null);
    try {
      await bridge().setLooseleaf(null);
    } catch (e) {
      setError(bridgeErrorMessage(e));
    }
  };

  return (
    <section className="settings-section">
      <h3>Looseleaf</h3>
      {editing ? (
        <ServerForm
          initialAddress={looseleaf?.url ?? ''}
          submitLabel={looseleaf ? 'Change server' : 'Connect'}
          placeholder="http://nas:8421"
          check={checkLooseleaf}
          save={saveLooseleaf}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="muted">
            {looseleaf
              ? `Reading linked pages from ${looseleaf.url}.`
              : 'Cards show the text of linked Looseleaf pages once this app can read them from your Looseleaf server.'}
          </p>
          <div className="form-actions start">
            <button type="button" className={`button ${looseleaf ? '' : 'primary'}`} onClick={() => setEditing(true)}>
              {looseleaf ? 'Change server or token' : 'Connect to Looseleaf'}
            </button>
            {looseleaf && (
              <button type="button" className="button" onClick={() => void disconnect()}>
                Disconnect
              </button>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

async function saveLooseleaf(link: ServerLink): Promise<void> {
  try {
    await bridge().setLooseleaf(link);
  } catch (error) {
    throw new Error(bridgeErrorMessage(error));
  }
}

function bridge() {
  const found = shell();
  if (!found) throw new Error('These settings exist only in the desktop app.');
  return found;
}
