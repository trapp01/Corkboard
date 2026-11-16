/**
 * First run: the access token (and the server's address when this page was
 * not served by a Corkboard server) plus "Your name", the actor recorded on
 * every change made in this browser. A device that already syncs but has no
 * name is asked for the name only.
 */
import { useId, useState, type FormEvent } from 'react';
import { checkServer } from './connection.js';
import { LogoMark } from './LogoMark.js';
import { useServices } from './services.js';

export function FirstRun({ host, needsServer, onDone }: { host: string | null; needsServer: boolean; onDone: () => void }) {
  return (
    <div className="first-run">
      <div className="first-run-card">
        <LogoMark size={44} />
        <h1>Welcome to Corkboard</h1>
        {needsServer ? (
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

function NameForm({ onDone }: { onDone: () => void }) {
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
      <p className="first-run-lead">Changes you make in this browser are recorded under your name.</p>
      <NameField value={name} onChange={setName} autoFocus />
      <div className="form-actions">
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
        Shown on the cards, comments and moves you make from this browser.
      </small>
    </div>
  );
}

/** Address (unless fixed), token and optionally the name, checked against the server before the client connects. */
export function ServerForm({
  fixedAddress,
  initialAddress = '',
  askName = false,
  submitLabel,
  onDone,
  onCancel,
}: {
  fixedAddress?: string;
  initialAddress?: string;
  askName?: boolean;
  submitLabel: string;
  onDone: () => void;
  onCancel?: () => void;
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
      const url = await checkServer(address, token);
      await client.connect({ url, token });
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
            placeholder="http://nas:8422"
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
            Cancel
          </button>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Checking…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
