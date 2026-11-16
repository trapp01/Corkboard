/** A status kind as a small icon with its name for screen readers and on hover, so colour never carries it alone. */
import { Circle, CircleCheck, CircleDot } from 'lucide-react';
import type { StatusKind } from '@corkboard/model';

export const KIND_NAMES: Record<StatusKind, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };

const ICONS = { todo: Circle, doing: CircleDot, done: CircleCheck } as const;

export function KindMarker({ kind, size = 16 }: { kind: StatusKind; size?: number }) {
  const Icon = ICONS[kind];
  return (
    <span className={`kind-marker kind-${kind}`} title={KIND_NAMES[kind]} role="img" aria-label={KIND_NAMES[kind]}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
