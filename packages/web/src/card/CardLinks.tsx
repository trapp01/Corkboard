/**
 * The card's links: web addresses open in a new tab; a `looseleaf:<pageId>`
 * link shows as a Looseleaf note whose text can be expanded under it when the
 * server can read it from Looseleaf. Adding a link takes a target and a title.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Link2, NotebookText, Trash2 } from 'lucide-react';
import { addLink, parseLinkTarget, removeLink, type Card, type CardLink } from '@corkboard/model';
import { IconButton } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useCurrentBoard } from '../board/board-context.js';
import { Markdown } from './Markdown.js';

export function CardLinks({ card }: { card: Card }) {
  const { doc } = useCurrentBoard();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseLinkTarget(target);
    if (parsed === null) {
      setError('Enter an address starting with http:// or https://, or a Looseleaf page as looseleaf:<page id>.');
      return;
    }
    addLink(doc, card.id, { target: target.trim(), title: title.trim() || (parsed.kind === 'url' ? parsed.url : 'Looseleaf note') });
    setTarget('');
    setTitle('');
    setError(null);
    setAdding(false);
  };

  return (
    <section className="card-section" aria-labelledby="links-heading">
      <h3 id="links-heading" className="section-heading">
        <Link2 size={16} aria-hidden="true" />
        Links
      </h3>
      {card.links.length > 0 && (
        <ul className="link-list">
          {card.links.map((link) => (
            <LinkRow key={link.id} card={card} link={link} />
          ))}
        </ul>
      )}
      {adding ? (
        <form className="stack link-form" onSubmit={add}>
          <label className="field">
            <span>Address</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://… or looseleaf:<page id>"
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Such as Pull request 42" maxLength={200} />
          </label>
          <p className="form-error" role="alert">
            {error ?? ''}
          </p>
          <div className="form-actions start">
            <button type="submit" className="button primary" disabled={target.trim() === ''}>
              Add link
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="placeholder-button" onClick={() => setAdding(true)}>
          Add a link
        </button>
      )}
    </section>
  );
}

function LinkRow({ card, link }: { card: Card; link: CardLink }) {
  const { doc } = useCurrentBoard();
  const parsed = parseLinkTarget(link.target);
  const remove = (
    <IconButton label={`Remove link ${link.title}`} className="row-action" onClick={() => removeLink(doc, card.id, link.id)}>
      <Trash2 size={15} />
    </IconButton>
  );
  if (parsed?.kind === 'looseleaf') {
    return (
      <li className="link-row is-looseleaf">
        <LooseleafLink pageId={parsed.pageId} title={link.title} />
        {remove}
      </li>
    );
  }
  return (
    <li className="link-row">
      {parsed ? (
        <a className="link-target" href={parsed.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" />
          <span className="link-title">{link.title || parsed.url}</span>
          <span className="link-host">{hostOf(parsed.url)}</span>
        </a>
      ) : (
        <span className="link-target">
          <span className="link-title">{link.title}</span>
          <span className="link-host">{link.target}</span>
        </span>
      )}
      {remove}
    </li>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** A Looseleaf page: its title, and its text under a disclosure once the server has returned it. Nothing extra shows when it cannot. */
function LooseleafLink({ pageId, title }: { pageId: string; title: string }) {
  const markdown = useLooseleafPage(pageId);
  const [open, setOpen] = useState(false);
  return (
    <div className="looseleaf-link">
      <div className="link-target">
        <NotebookText size={15} aria-hidden="true" />
        <span className="link-title">{title}</span>
        <span className="link-host">Looseleaf note</span>
        {markdown !== null && (
          <button type="button" className="button subtle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            {open ? 'Hide text' : 'Show text'}
          </button>
        )}
      </div>
      {open && markdown !== null && <Markdown className="looseleaf-preview" text={markdown} />}
    </div>
  );
}

/** The page's Markdown from the server's Looseleaf route, or null while loading and whenever the server has none to give. */
function useLooseleafPage(pageId: string): string | null {
  const { client } = useServices();
  const [markdown, setMarkdown] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const access = client.server;
    if (access === null) return;
    void (async () => {
      try {
        const response = await fetch(`${access.address}/api/looseleaf/pages/${encodeURIComponent(pageId)}`, { headers: { Authorization: `Bearer ${access.token}` } });
        if (!response.ok) return;
        const body = (await response.json()) as { markdown?: unknown };
        if (!cancelled && typeof body.markdown === 'string') setMarkdown(body.markdown);
      } catch {
        // Offline, or no Looseleaf behind this server: the link shows without its text.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, client]);
  return markdown;
}
