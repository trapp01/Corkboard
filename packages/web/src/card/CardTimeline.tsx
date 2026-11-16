/**
 * The card's timeline: a comment box on top (Cmd/Ctrl+Enter sends), then
 * comments and activity together, newest first, each with its actor and a
 * relative time (the full time on hover). Comments written under this
 * browser's name can be edited and deleted.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { MessageSquare } from 'lucide-react';
import { addComment, deleteComment, editComment, type Card, type Comment } from '@corkboard/model';
import { isMac, useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { describeTime, fullTime } from '../app/time.js';
import { useCurrentBoard } from '../board/board-context.js';
import { Markdown } from './Markdown.js';
import { cardTimeline, describeActivity } from './timeline.js';

/** Re-renders every half minute so relative times stay true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function CardTimeline({ card }: { card: Card }) {
  const { actor } = useServices();
  const { doc } = useCurrentBoard();
  const me = useStore(actor);
  const now = useNow();
  const [body, setBody] = useState('');
  const send = () => {
    if (body.trim() === '') return;
    addComment(doc, card.id, body.trim(), me);
    setBody('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    } else if (event.key === 'Escape' && body !== '') {
      // With a draft typed, Escape leaves the field and keeps the draft; it does not close the card.
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  return (
    <section className="card-section" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" className="section-heading">
        <MessageSquare size={16} aria-hidden="true" />
        Comments and activity
      </h3>
      <div className="comment-box">
        <textarea aria-label="Write a comment" placeholder="Write a comment" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKeyDown} rows={2} />
        {body.trim() !== '' && (
          <div className="form-actions start">
            <button type="button" className="button primary" onClick={send}>
              Comment
            </button>
            <span className="muted small">{isMac ? '⌘' : 'Ctrl'}+Enter sends</span>
          </div>
        )}
      </div>
      <ol className="timeline">
        {cardTimeline(card).map((entry) =>
          entry.kind === 'comment' ? (
            <CommentEntry key={entry.comment.id} card={card} comment={entry.comment} mine={entry.comment.by === me} now={now} />
          ) : (
            <li key={entry.key} className="timeline-activity">
              <span className="actor">{entry.activity.by || 'Someone'}</span> {describeActivity(entry.activity)}{' '}
              <time dateTime={new Date(entry.at).toISOString()} title={fullTime(entry.at)}>
                {describeTime(entry.at, now)}
              </time>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function CommentEntry({ card, comment, mine, now }: { card: Card; comment: Comment; mine: boolean; now: number }) {
  const { doc } = useCurrentBoard();
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const save = () => {
    if (draft !== null && draft.trim() !== '' && draft.trim() !== comment.body) editComment(doc, card.id, comment.id, draft.trim());
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
    }
  };
  return (
    <li className="timeline-comment">
      <div className="comment-head">
        <span className="actor">{comment.by || 'Someone'}</span>
        <time dateTime={new Date(comment.at).toISOString()} title={fullTime(comment.at)}>
          {describeTime(comment.at, now)}
        </time>
        {comment.editedAt !== null && (
          <span className="muted small" title={`Edited ${fullTime(comment.editedAt)}`}>
            (edited)
          </span>
        )}
      </div>
      {draft === null ? (
        <Markdown className="comment-body" text={comment.body} />
      ) : (
        <div className="stack">
          <textarea aria-label="Edit comment" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} autoFocus rows={3} />
          <div className="form-actions start">
            <button type="button" className="button primary" onClick={save}>
              Save
            </button>
            <button type="button" className="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {mine && draft === null && (
        <div className="comment-actions">
          {confirming ? (
            <>
              <span className="small">Delete this comment?</span>
              <button type="button" className="link-button danger" onClick={() => deleteComment(doc, card.id, comment.id)}>
                Delete
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" className="link-button" onClick={() => setDraft(comment.body)}>
                Edit
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
