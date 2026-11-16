import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addComment, archiveCard, createCard, createDefaultStatuses, moveCard, readBoard } from '@corkboard/model';
import { dueState } from '../src/card/due.js';
import { cardTimeline, describeActivity } from '../src/card/timeline.js';
import { parseRoute, routePath } from '../src/app/router.js';
import { todayDay } from '../src/app/time.js';

describe('dueState', () => {
  it('is overdue only when past and not in a done status', () => {
    expect(dueState(null, '2026-11-16', 'todo')).toBe('none');
    expect(dueState('2026-11-15', '2026-11-16', 'doing')).toBe('overdue');
    expect(dueState('2026-11-15', '2026-11-16', 'done')).toBe('finished');
    expect(dueState('2026-11-16', '2026-11-16', 'todo')).toBe('today');
    expect(dueState('2026-12-01', '2026-11-16', null)).toBe('upcoming');
  });

  it('writes today as a calendar day', () => {
    expect(todayDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('cardTimeline', () => {
  it('merges comments and activity, newest first', () => {
    const doc = new Y.Doc();
    createDefaultStatuses(doc);
    const statuses = readBoard(doc).statuses;
    let now = 1_000;
    const realNow = Date.now;
    Date.now = () => (now += 1_000);
    try {
      const card = createCard(doc, { title: 'Ship it', by: 'Ana' });
      addComment(doc, card.id, 'Starting', 'Ana');
      moveCard(doc, card.id, { statusId: statuses[2]!.id }, 'agent');
      archiveCard(doc, card.id, 'Ana');
    } finally {
      Date.now = realNow;
    }
    const entries = cardTimeline(readBoard(doc).cards[0]!);
    expect(entries.map((entry) => (entry.kind === 'comment' ? `comment:${entry.comment.body}` : entry.activity.type))).toEqual([
      'archived',
      'moved',
      'comment:Starting',
      'created',
    ]);
    const moved = entries[1]!;
    expect(moved.kind === 'activity' && describeActivity(moved.activity)).toBe('moved this card from Backlog to In progress');
  });
});

describe('routes', () => {
  it('reads board and card addresses', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' });
    expect(parseRoute('/b/web')).toEqual({ kind: 'board', key: 'WEB' });
    expect(parseRoute('/c/WEB-12')).toEqual({ kind: 'card', key: 'WEB', number: 12 });
    expect(parseRoute('/c/nonsense').kind).toBe('unknown');
    expect(routePath({ kind: 'card', key: 'WEB', number: 12 })).toBe('/c/WEB-12');
    expect(routePath({ kind: 'board', key: 'WEB' })).toBe('/b/WEB');
  });
});
