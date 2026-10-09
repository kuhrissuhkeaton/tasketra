import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// Phone and portrait-tablet helper for the register entry forms. Once the add form has
// scrolled completely out of view, a small "jump to the form" button appears at the
// bottom right. It only scrolls back and focuses the first field of the quick row: it
// never submits, clears or expands anything.
//
// It stays out of the way. It is not shown:
//   - above 860px wide (the same breakpoint where the sidebar becomes "Project tools"),
//   - on short screens (landscape phones),
//   - while the person scrolls down (it comes back 500ms after scrolling stops),
//   - while a text field, textarea or select has focus (on-screen keyboard),
//   - while any dialog, alert dialog, menu, drawer, notification panel or the open
//     "Project tools" menu is on screen.
// It never sits on top of a control, and it never moves: it always sits at the bottom
// right. Each time scrolling stops it checks whether that spot would cover a link,
// button, select or field in the page (for example a row's Details / "..." / status
// select when a table is scrolled sideways). If it would, the button stays hidden until
// scrolling next stops somewhere clear.
//
// It is a real button with its own accessible name, rendered next to the form, so it
// never traps focus. Reduced-motion users get no fade, and the jump itself is instant.

const NARROW = "(max-width: 860px)";
const MIN_HEIGHT = 480;
const SETTLE_MS = 500;
const OVERLAYS = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], .sidebar-open';

type Box = { left: number; right: number; top: number; bottom: number };
const EDGE = 16;
const CONTROLS = 'main a[href], main button, main select, main input, main textarea, main [role="button"], main [role="menuitem"]';

// Pure: would a button of this size, at the bottom right, cover any of these controls?
export function wouldCover(pill: { width: number; height: number; top: number }, viewportWidth: number, controls: Box[]): boolean {
  const left = viewportWidth - EDGE - pill.width;
  const box = { left, right: left + pill.width, top: pill.top, bottom: pill.top + pill.height };
  return controls.some((c) => !(c.right <= box.left || c.left >= box.right || c.bottom <= box.top || c.top >= box.bottom));
}

// The part of each control that is really on screen: its box cut down to the viewport,
// to the area below the sticky tab strip, and to any scrolling container that clips it
// (a table scrolled sideways shows only part of a row). A half-visible control counts.
function visibleControls(skip: HTMLElement): Box[] {
  const stripBottom = document.querySelector<HTMLElement>(".project-tabs")?.getBoundingClientRect().bottom ?? 0;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const out: Box[] = [];
  document.querySelectorAll<HTMLElement>(CONTROLS).forEach((el) => {
    if (el === skip || skip.contains(el)) return;
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0), right = Math.min(r.right, vw), top = Math.max(r.top, stripBottom), bottom = Math.min(r.bottom, vh);
    for (let a = el.parentElement; a && a !== document.body && left < right && top < bottom; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const ar = a.getBoundingClientRect();
      if (cs.overflowX !== "visible") { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
      if (cs.overflowY !== "visible") { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
    }
    if (r.width < 1 || r.height < 1 || left >= right || top >= bottom) return;
    out.push({ left, right, top, bottom });
  });
  return out;
}

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(el.type);
  }
  return el.isContentEditable;
}

function useMatch(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return m;
}

export function QuickAddJump({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const narrow = useMatch(NARROW);
  const [tall, setTall] = useState(() => window.innerHeight >= MIN_HEIGHT);
  const [pastForm, setPastForm] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [fieldActive, setFieldActive] = useState(false);
  const [scrollingDown, setScrollingDown] = useState(false);
  const [text, setText] = useState("");
  const [clear, setClear] = useState(true);
  const [tick, setTick] = useState(0);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Short screens (landscape phones).
  useEffect(() => {
    const on = () => setTall(window.innerHeight >= MIN_HEIGHT);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // The form counts as out of view only when none of it is visible below the sticky
  // tab strip, and it is above the viewport (scrolled past), not below it.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !narrow || typeof IntersectionObserver === "undefined") { setPastForm(false); return; }
    const strip = document.querySelector<HTMLElement>(".project-tabs");
    const stripH = strip ? Math.round(strip.getBoundingClientRect().height) : 0;
    const io = new IntersectionObserver(
      ([entry]) => setPastForm(!entry.isIntersecting && entry.boundingClientRect.bottom <= stripH + 1),
      { rootMargin: `-${stripH}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, [formRef, narrow]);

  // The label follows the form's own button ("Log risk" becomes "+ Log risk").
  useEffect(() => {
    const btn = formRef.current?.querySelector<HTMLElement>(".quick-add-row > button.btn-primary");
    setText((btn?.textContent ?? "").trim() || "Add");
  }, [formRef]);

  // Dialogs, menus and drawers.
  useEffect(() => {
    if (!narrow) return;
    let raf = 0;
    const check = () => { raf = 0; setOverlay(!!document.querySelector(OVERLAYS)); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal", "class"] });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [narrow]);

  // Text entry (on-screen keyboard).
  useEffect(() => {
    if (!narrow) return;
    const check = () => setFieldActive(isTextField(document.activeElement));
    const onIn = (e: FocusEvent) => setFieldActive(isTextField(e.target));
    const onOut = () => setFieldActive(false);
    check();
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, [narrow]);

  // Hide while scrolling down; return once scrolling has stopped.
  useEffect(() => {
    if (!narrow) return;
    let last = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 1) {
        setScrollingDown(true);
        clearTimeout(timer);
        timer = setTimeout(() => setScrollingDown(false), SETTLE_MS);
      }
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, [narrow]);

  const candidate = narrow && tall && pastForm && !overlay && !fieldActive && !scrollingDown;

  // Check the one spot, before the button is painted. Covered means: stay hidden for now.
  useLayoutEffect(() => {
    if (!candidate) return;
    const el = pillRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const bottomPx = parseFloat(getComputedStyle(el).bottom) || EDGE;
    setClear(!wouldCover({ width: w, height: h, top: window.innerHeight - bottomPx - h }, document.documentElement.clientWidth || window.innerWidth, visibleControls(el)));
  }, [candidate, tick]);

  // A resize or rotation re-checks.
  useEffect(() => {
    if (!candidate) return;
    const on = () => setTick((t) => t + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [candidate]);

  if (!candidate) return null;

  function jump() {
    const form = formRef.current;
    if (!form) return;
    form.scrollIntoView({ block: "start" });
    const first = Array.from(form.querySelectorAll<HTMLElement>(".quick-add-row input, .quick-add-row select, .quick-add-row textarea"))
      .find((el) => !(el as HTMLInputElement).disabled && (el as HTMLInputElement).type !== "hidden");
    first?.focus({ preventScroll: true });
  }

  return (
    <button
      ref={pillRef}
      type="button"
      className="quick-add-jump"
      data-clear={clear ? "true" : "false"}
      aria-hidden={clear ? undefined : true}
      tabIndex={clear ? undefined : -1}
      title={`+ ${text}`}
      aria-label={`Jump to the form to ${text.charAt(0).toLowerCase()}${text.slice(1)}`}
      onClick={jump}
    >
      <span aria-hidden="true">+ {text}</span>
    </button>
  );
}
