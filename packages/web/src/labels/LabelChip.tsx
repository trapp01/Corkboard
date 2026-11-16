/**
 * A label as a chip: its colour and its name, since labels name things such
 * as apps and the colour alone would not say which. Colours come from
 * styles/colors.css through the `color-<name>` class.
 */
import type { ColorName, Label } from '@corkboard/model';

export function LabelChip({ label, small = false }: { label: Pick<Label, 'name' | 'color'>; small?: boolean }) {
  return <span className={`label-chip color-${label.color} ${small ? 'is-small' : ''}`}>{label.name || 'Unnamed'}</span>;
}

/** The colour's name for screen readers and tooltips: "Green". */
export function colorLabel(color: ColorName): string {
  return color[0]!.toUpperCase() + color.slice(1);
}
