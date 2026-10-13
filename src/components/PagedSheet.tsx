"use client";

/**
 * One sheet of the notebook, sized to the screen. Content never scrolls: it flows into
 * page-sized CSS columns, and only one column (one notebook page) shows at a time. "next page",
 * the dog-eared corner, the arrow keys or a swipe turn to the next one with the paper turn.
 */
import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { flushSync } from "react-dom";
import { turnPage } from "./pageTurn";

export type SheetHandle = {
  /** Turn to whatever `swap` renders (a different tab or diary entry). */
  turn: (dir: "fwd" | "back", swap: () => void) => void;
  next: () => boolean;
  prev: () => boolean;
};

type Pager = { show: (el: Element | null) => void };
const PagerContext = createContext<Pager>({ show: () => {} });
/** Lets a page keep something in view as it grows, e.g. the interview's answer box. */
export const usePager = () => useContext(PagerContext);

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function PagedSheet({
  pageKey,
  className = "page",
  keys = true,
  inert,
  edges,
  onEdge,
  children,
  ref,
}: {
  pageKey: string | number;
  className?: string;
  keys?: boolean;
  inert?: boolean;
  /** Whether there's something before/after this sheet (e.g. other diary entries)... */
  edges?: { prev: boolean; next: boolean };
  /** ...and what to do when you turn past this sheet's first or last page. */
  onEdge?: (dir: "fwd" | "back") => void;
  children: ReactNode;
  ref?: Ref<SheetHandle>;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ key: pageKey, index: 0 });
  const [count, setCount] = useState(1);
  // A new tab or entry always opens on its first page, in the same render that shows it.
  const index = Math.min(state.key === pageKey ? state.index : 0, count - 1);
  const live = useRef({ index, count, pageKey });

  useLayoutEffect(() => {
    live.current = { index, count, pageKey };
  });

  /** Which page an element sits on, from how far right its column is. */
  const pageOf = useCallback((el: Element) => {
    const flow = flowRef.current;
    if (!flow) return 0;
    const gap = parseFloat(getComputedStyle(flow).columnGap) || 0;
    const dx = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
    return Math.max(0, Math.floor((dx + 4) / (flow.clientWidth + gap)));
  }, []);

  const measure = useCallback(() => {
    if (endRef.current) setCount(pageOf(endRef.current) + 1);
  }, [pageOf]);

  // Re-count pages whenever the content or the screen changes size.
  useLayoutEffect(() => {
    measure();
    const flow = flowRef.current!;
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(later);
    ro.observe(flow);
    const mo = new MutationObserver(later);
    mo.observe(flow, { childList: true, subtree: true, characterData: true });
    document.fonts?.ready.then(later);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  const setIndex = useCallback((i: number) => setState({ key: live.current.pageKey, index: i }), []);

  const turn = useCallback((dir: "fwd" | "back", swap: () => void) => {
    if (!pageRef.current || !layerRef.current) return swap();
    turnPage({ page: pageRef.current, layer: layerRef.current, dir, swap });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const { index: at, count: n } = live.current;
      const to = Math.max(0, Math.min(n - 1, i));
      if (to === at) return false;
      turn(to > at ? "fwd" : "back", () => flushSync(() => setIndex(to)));
      return true;
    },
    [turn, setIndex],
  );
  const edgeRef = useRef({ edges, onEdge });
  useLayoutEffect(() => {
    edgeRef.current = { edges, onEdge };
  });
  const next = useCallback(() => {
    if (goTo(live.current.index + 1)) return true;
    const { edges: e, onEdge: go } = edgeRef.current;
    if (!e?.next || !go) return false;
    go("fwd");
    return true;
  }, [goTo]);
  const prev = useCallback(() => {
    if (goTo(live.current.index - 1)) return true;
    const { edges: e, onEdge: go } = edgeRef.current;
    if (!e?.prev || !go) return false;
    go("back");
    return true;
  }, [goTo]);

  useImperativeHandle(ref, () => ({ turn, next, prev }), [turn, next, prev]);

  // Keep an element on screen without an animation (used while the interview grows). Stable, so
  // turning back a page to reread doesn't make a page that uses it jump forward again.
  const pager: Pager = useMemo(
    () => ({
      show: (el) => {
        if (!el) return;
        const p = pageOf(el);
        if (p !== live.current.index) setIndex(p);
      },
    }),
    [pageOf, setIndex],
  );

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const moved = e.key === "ArrowRight" || e.key === "PageDown" ? next() : e.key === "ArrowLeft" || e.key === "PageUp" ? prev() : false;
      if (moved) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, next, prev]);

  // Swipe left / right on touch screens.
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <PagerContext.Provider value={pager}>
      <main
        className={className}
        ref={pageRef}
        inert={inert}
        onPointerDown={(e) => {
          touch.current = e.pointerType === "mouse" || typing(e.target) ? null : { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.clientX - t.x;
          if (Math.abs(dx) > 60 && Math.abs(e.clientY - t.y) < 50) (dx < 0 ? next : prev)();
        }}
      >
        <div className="page-inner">
          <div
            className="page-flow"
            ref={flowRef}
            style={{ "--i": index } as React.CSSProperties}
            onFocus={(e) => {
              // Tabbing to something on another page turns straight to it.
              const p = pageOf(e.target);
              if (p !== live.current.index) setIndex(p);
            }}
          >
            {children}
            <div className="flow-end" ref={endRef} aria-hidden />
          </div>
        </div>
        {(count > 1 || edges) && (
          <nav className="pager" aria-label="Pages">
            <button className="link pager-prev" onClick={prev} disabled={index === 0 && !edges?.prev} aria-label="Previous page">
              ← <span className="pager-long">back a page</span>
              <span className="pager-short">back</span>
            </button>
            <span className="pager-num" aria-live="polite">
              {count > 1 && (
                <>
                  <span className="pager-long">page </span>
                  {index + 1}
                  <span className="pager-long"> of </span>
                  <span className="pager-short"> / </span>
                  {count}
                </>
              )}
            </span>
            <button className="link pager-next" onClick={next} disabled={index >= count - 1 && !edges?.next} aria-label="Next page">
              <span className="pager-long">next page</span>
              <span className="pager-short">next</span> →
            </button>
          </nav>
        )}
        {index < count - 1 || edges?.next ? (
          <button className="page-curl page-curl-live" onClick={next} aria-label="Turn to the next page" />
        ) : (
          <div className="page-curl" aria-hidden />
        )}
        <div className="turn-layer" ref={layerRef} aria-hidden />
      </main>
    </PagerContext.Provider>
  );
}
