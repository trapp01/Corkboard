/** A card's comments and activity as one list, newest first, and the sentence each activity entry reads as. */
import type { Activity, Card, Comment } from '@corkboard/model';

export type TimelineEntry = { kind: 'comment'; at: number; comment: Comment } | { kind: 'activity'; at: number; activity: Activity; key: string };

/** Comments and activity merged, newest first. At the same moment a comment sorts above the activity it came with. */
export function cardTimeline(card: Card): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...card.comments.map((comment): TimelineEntry => ({ kind: 'comment', at: comment.at, comment })),
    ...card.activity.map((activity, index): TimelineEntry => ({ kind: 'activity', at: activity.at, activity, key: `activity-${index}` })),
  ];
  return entries.sort((a, b) => b.at - a.at || (a.kind === b.kind ? 0 : a.kind === 'comment' ? -1 : 1));
}

/** What happened, without the actor: "moved this card from Backlog to Done". */
export function describeActivity(activity: Activity): string {
  switch (activity.type) {
    case 'created':
      return activity.status ? `added this card to ${activity.status}` : 'added this card';
    case 'moved':
      return activity.from ? `moved this card from ${activity.from} to ${activity.to}` : `moved this card to ${activity.to}`;
    case 'archived':
      return 'archived this card';
    case 'restored':
      return 'restored this card';
  }
}
