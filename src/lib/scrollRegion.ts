import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element's content is wider (or taller) than its box, i.e.
 * while it actually scrolls. A scrolling box has to be reachable from the
 * keyboard (otherwise someone who can't use a mouse or touch can't see the
 * rest of a wide table or timeline), but a box that doesn't scroll should
 * not add a pointless tab stop, so callers add tabIndex only while this is
 * true.
 */
export function useIsScrollable(ref: RefObject<HTMLElement | null>, watch: unknown = null): boolean {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setScrollable(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
    // `watch` re-runs this when the element mounts later than the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, watch]);

  return scrollable;
}
