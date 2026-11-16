/**
 * The shared building blocks of the chrome: icon buttons, a modal (focus
 * kept inside, returned on close), a titled dialog built on it, an anchored
 * popover and a menu. Each closes on Escape through `useEscape`, so only the
 * topmost one closes.
 */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscape } from './escape.js';

export const IconButton = forwardRef<HTMLButtonElement, { label: string; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ label, children, active, className = '', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`icon-button ${active ? 'is-active' : ''} ${className}`}
        aria-label={label}
        title={label}
        aria-pressed={active === undefined ? undefined : active}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal layer over the page: a backdrop that closes it on press, focus moved
 * in on open (to `[autofocus]` or the first field), kept inside with Tab, and
 * returned to where it was on close.
 */
export function Modal({
  label,
  onClose,
  children,
  className = '',
  backdropClassName = '',
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first =
      ref.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ??
      ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog-close)');
    (first ?? ref.current)?.focus();
    return () => previous?.focus?.();
  }, []);
  const trapTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div
      className={`modal-backdrop ${backdropClassName}`}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // A field that saves on blur gets its blur before the dialog is taken away.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
    >
      <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={trapTab}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <Modal label={title} onClose={onClose} className={`dialog ${wide ? 'is-wide' : ''} ${className}`}>
      <header className="dialog-header">
        <h2>{title}</h2>
        <IconButton label="Close" className="dialog-close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="dialog-body">{children}</div>
    </Modal>
  );
}

/** A panel anchored under (or above, when there is no room) an element; closes on an outside press or Escape. */
export function Popover({
  anchor,
  onClose,
  children,
  align = 'start',
  className = '',
  label,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEscape(onClose);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'end' ? a.right - p.width : a.left;
    left = Math.max(8, Math.min(left, vw - p.width - 8));
    let top = a.bottom + 4;
    if (top + p.height > vh - 8 && a.top - p.height - 4 > 8) top = a.top - p.height - 4;
    setPos({ left, top: Math.max(8, Math.min(top, vh - p.height - 8)) });
  }, [anchor, align]);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose]);
  useEffect(() => {
    // Return focus to the button that opened the popover when it closes.
    return () => {
      if (ref.current?.contains(document.activeElement) || document.activeElement === document.body) anchor?.focus();
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      role={label ? 'dialog' : undefined}
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Marks the current choice in a set, such as a status's kind. */
  checked?: boolean;
}

/** A list of actions in a popover. Arrow keys move between items; choosing one closes the menu. */
export function Menu({
  anchor,
  onClose,
  items,
  label,
  align = 'end',
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  items: Array<MenuItem | 'separator'>;
  label: string;
  align?: 'start' | 'end';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} align={align} className="menu-popover">
      <div ref={ref} role="menu" aria-label={label} className="menu" onKeyDown={onKeyDown}>
        {items.map((item, index) =>
          item === 'separator' ? (
            <div key={`sep-${index}`} className="menu-separator" role="separator" />
          ) : (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              className={`menu-item ${item.danger ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span className="menu-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}
