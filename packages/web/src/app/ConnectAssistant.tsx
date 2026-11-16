/**
 * Connect an assistant: the server's MCP address, the access token behind
 * Reveal, and the Claude Code command that adds this board server, each with
 * Copy. The token is read from this device's sync settings.
 */
import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { copyText } from './clipboard.js';
import { Dialog } from './controls.js';
import { useServices } from './services.js';
import { useSyncStatus } from '../sync-ui/use-sync-status.js';

const HIDDEN = '••••••••••••••••';

export function ConnectAssistant({ onClose }: { onClose: () => void }) {
  const { client, toasts } = useServices();
  const status = useSyncStatus(client);
  const token = client.server?.token ?? null;
  const [revealed, setRevealed] = useState(false);

  const origin = status.server ?? location.origin;
  const address = `${origin}/mcp`;
  const command = (secret: string) => `claude mcp add --transport http corkboard ${address} --header "Authorization: Bearer ${secret}"`;
  const copy = async (text: string, what: string) => toasts.show((await copyText(text)) ? `Copied ${what}` : `Couldn’t copy the ${what}. Select it and copy it instead.`);

  return (
    <Dialog title="Connect an assistant" onClose={onClose} wide>
      <p className="muted">
        Assistants read and change these boards through the server’s MCP endpoint. Their changes show here as they happen.
      </p>
      <CopyRow label="MCP address" value={address} onCopy={() => void copy(address, 'address')} />
      <div className="field">
        <span>Access token</span>
        <div className="copy-row">
          <code className="copy-value">{token === null ? 'No token on this device' : revealed ? token : HIDDEN}</code>
          {token !== null && (
            <>
              <button type="button" className="button" onClick={() => setRevealed((r) => !r)} aria-pressed={revealed}>
                {revealed ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                {revealed ? 'Hide' : 'Reveal'}
              </button>
              <button type="button" className="button" onClick={() => void copy(token, 'token')}>
                <Copy size={16} aria-hidden="true" />
                Copy
              </button>
            </>
          )}
        </div>
      </div>
      {token !== null && (
        <CopyRow label="Claude Code" value={command(revealed ? token : HIDDEN)} onCopy={() => void copy(command(token), 'command')} wrap />
      )}
      <p className="muted small">Any MCP client works: give it the address above and an Authorization header of Bearer and the token.</p>
    </Dialog>
  );
}

function CopyRow({ label, value, onCopy, wrap = false }: { label: string; value: string; onCopy: () => void; wrap?: boolean }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="copy-row">
        <code className={`copy-value ${wrap ? 'is-wrapping' : ''}`}>{value}</code>
        <button type="button" className="button" onClick={onCopy}>
          <Copy size={16} aria-hidden="true" />
          Copy
        </button>
      </div>
    </div>
  );
}
