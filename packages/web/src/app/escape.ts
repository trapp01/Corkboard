/**
 * Escape closes the topmost open thing only: a popover over a dialog closes
 * before the dialog, a dialog before the card under it. Each open layer
 * registers with `useEscape`; the last registered runs. A text field that
 * uses Escape itself (cancel an edit) calls preventDefault and no layer runs.
 */
import { useEffect, useRef } from 'react';

const layers: Array<{ current: () => void }> = [];

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  event.preventDefault();
  top.current();
}

export function useEscape(handler: () => void, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const layer = { current: () => ref.current() };
    if (layers.length === 0) window.addEventListener('keydown', onKeyDown);
    layers.push(layer);
    return () => {
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      if (layers.length === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}

/** True while any layer (dialog, card, popover, menu) is open, so board shortcuts stay quiet. */
export function anyLayerOpen(): boolean {
  return layers.length > 0;
}
