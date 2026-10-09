import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

// "..." menu for the less-used row actions on the registers (Delete, + Sub-task,
// This became an issue). It only changes where the actions live: each item calls
// the same handler the old inline link called.
//
// Keyboard: Enter, Space or Arrow Down on the button opens the menu and focuses the
// first item. Arrow Up/Down, Home and End move between items. Escape closes it and
// returns focus to the button. Tab closes it. A click outside closes it.
// The menu is position: fixed so a table's scroll area never clips it.

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

export function RowActionsMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const menuWidth = 200;
      const menuHeight = items.length * 36 + 8;
      const left = Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8));
      const below = r.bottom + 4;
      const top = below + menuHeight > window.innerHeight ? Math.max(8, r.top - menuHeight - 4) : below;
      setPos({ top, left });
    }
    setOpen(true);
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Close on outside click, scroll or resize.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === "Tab") { setOpen(false); }
  }

  return (
    <span className="row-menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className="btn-link row-menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onButtonKey}
      >
        <span aria-hidden="true">&middot;&middot;&middot;</span>
      </button>
      {open && pos && (
        <div
          id={menuId}
          ref={menuRef}
          className="row-menu"
          role="menu"
          aria-label={label}
          style={{ top: pos.top, left: pos.left }}
          onKeyDown={onMenuKey}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? "row-menu-item row-menu-item-danger" : "row-menu-item"}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
