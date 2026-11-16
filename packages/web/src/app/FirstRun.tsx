/**
 * First run. In a browser: the access token (and the server's address when
 * this page was not served by a Corkboard server) plus "Your name", the actor
 * recorded on every change made here; a device that already syncs but has no
 * name is asked for the name only. In the desktop app, which runs its own
 * server, the person chooses between connecting that server to another one
 * and keeping boards on this computer only, then gives their name; both can
 * be changed in Settings.
 */
import { useId, useState, type FormEvent } from 'react';
import { checkServer } from './connection.js';
import { LogoMark } from './LogoMark.js';
import { useServices } from './services.js';
import { bridgeErrorMessage, shell, type ServerLink } from '../shell-bridge.js';

export function FirstRun({ host, needsServer, onDone }: { host: string | null; needsServer: boolean; onDone: () => void }) {
  return (
    <div className="first-run">
      <div className="first-run-card">
        <LogoMark size={44} />
        <h1>Welcome to Corkboard</h1>
        {shell() ? (
          <ChooseSync onDone={onDone} />
        ) : needsServer ? (
          <>
            <p className="first-run-lead">{host ? 'Enter the access token for this server.' : 'Connect to your Corkboard server.'}</p>
            <ServerForm fixedAddress={host ?? undefined} askName submitLabel="Open the boards" onDone={onDone} />
            <p className="first-run-hint">
              The token is in the file named <code>token</code> in the server’s data folder, or in its <code>CORKBOARD_TOKEN</code> setting.
            </p>
          </>
        ) : (
          <NameForm onDone={onDone} />
        )}
      </div>
    </div>
  );
}

/** The desktop app's choice: a server to sync with, or this computer only. Either way the name comes next. */
function ChooseSync({ onDone }: { onDone: () => void }) {
  const [choice, setChoice] = useState<'connect' | 'local' | null>(null);
  const back = () => setChoice(null);
  if (choice === 'connect') {
    return (
      <>
        <p className="first-run-lead">Connect to your Corkboard server.</p>
        <ServerForm askName submitLabel="Connect" save={saveUpstream} onDone={onDone} onCancel={back} cancelLabel="Back" />
      </>
    );
  }
  if (choice === 'local') return <NameForm onDone={onDone} onBack={back} />;
  return (
    <>
      <p className="first-run-lead">Where should your boards sync?</p>
      <div className="first-run-choices">
        <button type="button" className="choice" onClick={() => setChoice('connect')} autoFocus>
          <strong>Connect to a server</strong>
          <span>Sync with the other devices that use your server.</span>
        </button>
        <button type="button" className="choice" onClick={() => setChoice('local')}>
          <strong>Keep boards on this computer only</strong>
          <span>You can connect to a server later in Settings.</span>
        </button>
      </div>
    </>
  );
}

/** Makes a checked server the desktop app's server to sync with. */
export async function saveUpstream(link: ServerLink): Promise<void> {
  const bridge = shell();
  if (!bridge) throw new Error('Only the desktop app has a server to sync with.');
  try {
    await bridge.setUpstream(link);
  } catch (error) {
    throw new Error(bridgeErrorMessage(error));
  }
}

/** Where this device's changes come from, in the name field's copy. */
function here(): string {
  return shell() ? 'this computer' : 'this browser';
}

function NameForm({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const { actor } = useServices();
  const [name, setName] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    actor.set(name.trim());
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="first-run-lead">Changes you make {shell() ? 'on' : 'in'} {here()} are recorded under your name.</p>
      <NameField value={name} onChange={setName} autoFocus />
      <div className="form-actions">
        {onBack && (
          <button type="button" className="button" onClick={onBack}>
            Back
          </button>
        )}
        <button type="submit" className="button primary" disabled={name.trim() === ''}>
          Continue
        </button>
      </div>
    </form>
  );
}

export function NameField({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Your name</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        autoComplete="name"
        maxLength={60}
        aria-describedby={`${id}-hint`}
      />
      <small id={`${id}-hint`} className="field-hint">
        Shown on the cards, comments and moves you make from {here()}.
      </small>
    </div>
  );
}

/**
 * Address (unless fixed), token and optionally the name, checked with `check`
 * before `save` runs. By default the address must be a Corkboard server and
 * saving connects this device's sync client to it.
 */
export function ServerForm({
  fixedAddress,
  initialAddress = '',
  askName = false,
  submitLabel,
  placeholder = 'http://nas:8422',
  check = checkServer,
  save,
  onDone,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  fixedAddress?: string;
  initialAddress?: string;
  askName?: boolean;
  submitLabel: string;
  placeholder?: string;
  check?: (address: string, token: string) => Promise<string>;
  save?: (link: ServerLink) => Promise<void>;
  onDone: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const { client, actor } = useServices();
  const [address, setAddress] = useState(fixedAddress ?? initialAddress);
  const [token, setToken] = useState('');
  const [name, setName] = useState(actor.get());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (askName && name.trim() === '') {
      setError('Enter your name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await check(address, token);
      await (save ?? ((link: ServerLink) => client.connect(link)))({ url, token: token.trim() });
      if (askName) actor.set(name.trim());
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      {fixedAddress === undefined && (
        <label className="field">
          <span>Server address</span>
          <input
            type="url"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={placeholder}
            autoFocus
            required
            spellCheck={false}
            autoCapitalize="off"
          />
        </label>
      )}
      <label className="field">
        <span>Access token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoFocus={fixedAddress !== undefined}
          required
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
      </label>
      {askName && <NameField value={name} onChange={setName} />}
      <p className="form-error" role="alert">
        {error ?? ''}
      </p>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Checking…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
