import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, type SearchResults } from "../lib/api";
import { flattenSearchResults, moveSearchIndex, type SearchItem } from "../lib/search";

const EMPTY: SearchResults = { projects: [], tasks: [], decisions: [], risks: [] };
const GROUP_ORDER: SearchItem["group"][] = ["Projects", "Tasks", "Decisions", "Risks"];

/**
 * Global search (v159, F-18): a search box in the sidebar bar and a
 * command palette behind Cmd/Ctrl-K. Results come from /api/search,
 * grouped by type; arrow keys move, Enter opens, Escape closes. Picking a
 * result lands on the project tab where the thing lives (tasks, decisions
 * and risks each have their own tab; a project lands on its Overview).
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestSeq = useRef(0);

  // Cmd/Ctrl-K opens the palette from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  // Debounced fetch; a sequence number keeps a slow earlier response from
  // overwriting a newer query's results.
  useEffect(() => {
    const q = query.trim();
    if (!open) return;
    if (q.length < 2) {
      setResults(EMPTY);
      setActive(-1);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    const t = setTimeout(() => {
      api
        .search(q)
        .then((r) => {
          if (requestSeq.current !== seq) return;
          setResults(r);
          setActive(-1);
          setLoading(false);
        })
        .catch(() => {
          if (requestSeq.current !== seq) return;
          setResults(EMPTY);
          setLoading(false);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const items = useMemo(() => flattenSearchResults(results), [results]);
  const grouped = useMemo(
    () => GROUP_ORDER.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length > 0),
    [items],
  );

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setActive(-1);
    triggerRef.current?.focus();
  }

  function go(item: SearchItem) {
    close();
    navigate(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => moveSearchIndex(a, 1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => moveSearchIndex(a, -1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active]);
    }
  }

  // Index of an item within the flat list (for aria + highlight), computed
  // once per render rather than per row.
  const flatIndex = new Map(items.map((item, i) => [item.key, i]));

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="sidebar-search-btn"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sidebar-search-label">Search</span>
        <kbd className="sidebar-search-kbd" aria-hidden="true">⌘K</kbd>
      </button>
      {open &&
        createPortal(
          <div className="search-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className="search-panel" role="dialog" aria-modal="true" aria-label="Search">
              <input
                ref={inputRef}
                className="search-input"
                type="search"
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls="search-results"
                aria-activedescendant={active >= 0 && items[active] ? `search-item-${items[active].key}` : undefined}
                placeholder="Search projects, tasks, decisions, risks…"
                aria-label="Search projects, tasks, decisions, risks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
              />
              <div className="search-results" id="search-results" role="listbox" aria-label="Search results">
                {query.trim().length < 2 ? (
                  <p className="search-hint muted">Type at least two characters to search across your projects.</p>
                ) : loading ? (
                  <p className="search-hint muted">Searching…</p>
                ) : items.length === 0 ? (
                  <p className="search-hint muted">Nothing matches “{query.trim()}”.</p>
                ) : (
                  grouped.map(({ group, items: groupItems }) => (
                    <div key={group} className="search-group">
                      <div className="search-group-title">{group}</div>
                      {groupItems.map((item) => {
                        const idx = flatIndex.get(item.key)!;
                        return (
                          <button
                            key={item.key}
                            id={`search-item-${item.key}`}
                            type="button"
                            role="option"
                            aria-selected={idx === active}
                            className={`search-item${idx === active ? " search-item-active" : ""}`}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => go(item)}
                          >
                            <span className="search-item-title">{item.title}</span>
                            {item.group !== "Projects" && <span className="search-item-project muted">{item.projectName}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
