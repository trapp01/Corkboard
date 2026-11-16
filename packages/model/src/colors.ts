/** The colour names a board or a label can take. The web client owns the hex values. */
export const COLOR_NAMES = ['green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'gray'] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

export const DEFAULT_COLOR: ColorName = 'blue';

export function isColorName(value: unknown): value is ColorName {
  return typeof value === 'string' && (COLOR_NAMES as readonly string[]).includes(value);
}

/** The stored colour, or the default when a newer or damaged replica wrote a name this build does not know. */
export function colorOr(value: unknown, fallback: ColorName = DEFAULT_COLOR): ColorName {
  return isColorName(value) ? value : fallback;
}

/** The colour used least among `taken`, so new boards and labels spread across the palette. */
export function leastUsedColor(taken: readonly ColorName[]): ColorName {
  let best: ColorName = COLOR_NAMES[0];
  let bestCount = Infinity;
  for (const name of COLOR_NAMES) {
    const count = taken.filter((color) => color === name).length;
    if (count < bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
