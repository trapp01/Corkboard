/**
 * The card's attachments: image thumbnails and file rows that open or
 * download the file, each removable. `useAttachFiles` stores picked, pasted
 * or dropped files as blobs (which sync on their own) and records them.
 */
import { useCallback, useRef } from 'react';
import { File as FileIcon, Paperclip, Trash2 } from 'lucide-react';
import { addAttachment, removeAttachment, type Attachment, type Card } from '@corkboard/model';
import { IconButton } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useCurrentBoard } from '../board/board-context.js';
import { useBlobUrl } from './blob-urls.js';

/** Stores each file as a blob and adds it to the card; tells the person when a file could not be read. */
export function useAttachFiles(card: Card): (files: File[]) => Promise<void> {
  const { client, toasts } = useServices();
  const { doc } = useCurrentBoard();
  return useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const blob = await client.putBlob(bytes);
          addAttachment(doc, card.id, { blob, name: file.name || 'Pasted file', mime: file.type || 'application/octet-stream', size: file.size });
        } catch (error) {
          toasts.show(`Couldn’t attach ${file.name || 'the file'}: ${(error as Error).message}. Try again.`);
        }
      }
    },
    [client, toasts, doc, card.id],
  );
}

export function CardAttachments({ card, onPick }: { card: Card; onPick: (files: File[]) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="card-section" aria-labelledby="attachments-heading">
      <h3 id="attachments-heading" className="section-heading">
        <Paperclip size={16} aria-hidden="true" />
        Attachments
      </h3>
      {card.attachments.length > 0 && (
        <ul className="attachment-list">
          {card.attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} card={card} attachment={attachment} />
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Choose files to attach"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void onPick(files);
        }}
      />
      <button type="button" className="placeholder-button" onClick={() => input.current?.click()}>
        Add a file
        <span className="muted small"> or paste or drop one here</span>
      </button>
    </section>
  );
}

function AttachmentRow({ card, attachment }: { card: Card; attachment: Attachment }) {
  const { blobs } = useServices();
  const { doc } = useCurrentBoard();
  const state = useBlobUrl(blobs, attachment.blob, attachment.mime);
  // Only pictures that cannot carry a script open in a tab. An SVG opened from a blob URL runs as this page.
  const image = /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(attachment.mime);
  const url = state.status === 'ready' ? state.url : undefined;
  return (
    <li className={`attachment ${image ? 'is-image' : ''}`}>
      <a
        className="attachment-open"
        href={url}
        {...(image ? { target: '_blank', rel: 'noopener noreferrer' } : { download: attachment.name })}
        aria-disabled={url === undefined}
        onClick={(e) => url === undefined && e.preventDefault()}
      >
        <span className="attachment-thumb">
          {image && url ? <img src={url} alt="" /> : <FileIcon size={22} aria-hidden="true" />}
        </span>
        <span className="attachment-text">
          <span className="attachment-name">{attachment.name}</span>
          <span className="muted small">
            {state.status === 'missing' ? 'Not on this device yet' : state.status === 'loading' ? 'Loading…' : formatSize(attachment.size)}
          </span>
        </span>
      </a>
      <IconButton label={`Remove ${attachment.name}`} className="row-action" onClick={() => removeAttachment(doc, card.id, attachment.id)}>
        <Trash2 size={15} />
      </IconButton>
    </li>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
