"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AddLecture } from "./AddLecture";
import { Chapter } from "./Chapter";
import { Contents } from "./Contents";
import { InsideCover } from "./InsideCover";
import { PagedSheet, type SheetHandle } from "./PagedSheet";
import { SubjectPage } from "./SubjectPage";
import { chaptersOf, useLibrary, type Library } from "./useLibrary";

export type Route =
  | { page: "contents" }
  | { page: "subject"; id: string }
  | { page: "chapter"; id: string }
  | { page: "add"; id?: string }
  | { page: "settings" };

export type Go = (r: Route) => void;

function parse(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  switch (page) {
    case "settings":
      return { page };
    case "add":
      return { page, id: id || undefined };
    case "subject":
    case "chapter":
      return id ? { page, id } : { page: "contents" };
    default:
      return { page: "contents" };
  }
}

export const toHash = (r: Route) => "#/" + [r.page, "id" in r ? r.id : undefined].filter(Boolean).map((s) => encodeURIComponent(s!)).join("/");

/** Where a page sits in the book, so it turns forward or back like it would on paper. */
function order(lib: Library, r: Route) {
  const subjectIndex = (id?: string) => Math.max(0, lib.subjects.findIndex((s) => s.id === id));
  switch (r.page) {
    case "contents":
      return 0;
    case "subject":
      return 10 + subjectIndex(r.id) * 100;
    case "chapter": {
      const l = lib.lectures.find((x) => x.id === r.id);
      return l ? 10 + subjectIndex(l.subjectId) * 100 + 1 + chaptersOf(lib, l.subjectId).indexOf(l) : 50;
    }
    case "add":
      return 9000;
    case "settings":
      return 9500;
  }
}

const TABS = [
  { key: "contents", label: "Contents", color: "tab-yellow", pages: ["contents"] },
  { key: "add", label: "Add a lecture", color: "tab-mint", pages: ["add"] },
  { key: "settings", label: "Inside cover", color: "tab-lilac", pages: ["settings"] },
] as const;

type CoverState = "unknown" | "closed" | "opening" | "open";

export default function Notebook() {
  const lib = useLibrary();
  const [route, setRoute] = useState<Route>({ page: "contents" });
  const [cover, setCover] = useState<CoverState>("unknown");
  const [turn, setTurn] = useState(0);
  const sheetRef = useRef<SheetHandle>(null);
  const routeRef = useRef<Route>(route);
  const coverRef = useRef<CoverState>(cover);
  const libRef = useRef(lib);

  useEffect(() => {
    coverRef.current = cover;
    libRef.current = lib;
  });

  useEffect(() => {
    const show = (next: Route) => {
      routeRef.current = next;
      setRoute(next);
      setTurn((t) => t + 1);
    };

    const onHash = () => {
      const next = parse(location.hash);
      const prev = routeRef.current;
      const swap = () => flushSync(() => show(next));
      if (coverRef.current !== "open") {
        // A tab clicked on the closed book opens it at that page.
        swap();
        if (coverRef.current === "closed") setCover("opening");
        return;
      }
      if (!sheetRef.current) return swap();
      sheetRef.current.turn(order(libRef.current, next) >= order(libRef.current, prev) ? "fwd" : "back", swap);
    };

    show(parse(location.hash));
    // Opening the cover is a once-per-visit ritual; deep links skip it.
    let seen = false;
    try {
      seen = sessionStorage.getItem("studyink:open") === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read after hydration
    setCover(seen || location.hash.length > 2 ? "open" : "closed");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go: Go = (r) => {
    const h = toHash(r);
    if (location.hash !== h) location.hash = h;
  };

  const opened = () => {
    setCover("open");
    try {
      sessionStorage.setItem("studyink:open", "1");
    } catch {}
  };

  if (cover === "unknown" || !lib.ready) return <div className="desk" />;

  const closed = cover !== "open";
  const busy = Object.keys(lib.live).length;
  const currentSubject =
    route.page === "subject" ? route.id : route.page === "chapter" ? lib.lectures.find((l) => l.id === route.id)?.subjectId : undefined;

  return (
    <div className="desk">
      <div className={`book ${closed ? "book-closed" : ""}`}>
        <div className="spiral" aria-hidden />
        <nav className="subject-tabs" aria-label="Subjects">
          {lib.subjects.map((s) => {
            const n = chaptersOf(lib, s.id).length;
            return (
              <a
                key={s.id}
                href={toHash({ page: "subject", id: s.id })}
                className={`subject-tab ${!closed && currentSubject === s.id ? "subject-tab-on" : ""} ${n ? "" : "subject-tab-empty"}`}
                style={{ background: s.color }}
                title={s.name ? `${s.code} · ${s.name}` : s.code}
                aria-current={currentSubject === s.id ? "page" : undefined}
              >
                {s.code}
                {n ? <b>{n}</b> : null}
              </a>
            );
          })}
        </nav>
        <nav className="tabs" aria-label="Notebook sections">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={toHash({ page: t.key } as Route)}
              className={`tab ${t.color} ${!closed && (t.pages as readonly string[]).includes(route.page) ? "tab-on" : ""}`}
              aria-current={(t.pages as readonly string[]).includes(route.page) ? "page" : undefined}
            >
              {t.label}
              {t.key === "add" && busy ? <b>{busy}</b> : null}
            </a>
          ))}
        </nav>
        <PagedSheet ref={sheetRef} pageKey={turn} inert={cover === "closed"}>
          {route.page === "contents" && <Contents lib={lib} go={go} />}
          {route.page === "subject" && <SubjectPage lib={lib} go={go} id={route.id} />}
          {route.page === "chapter" && <Chapter lib={lib} go={go} id={route.id} />}
          {route.page === "add" && <AddLecture lib={lib} go={go} subjectId={route.id} />}
          {route.page === "settings" && <InsideCover lib={lib} go={go} />}
        </PagedSheet>
        <div className="page-stack" aria-hidden />
        {closed && (
          <Cover
            name={lib.settings.name}
            opening={cover === "opening"}
            onOpen={() => setCover("opening")}
            onOpened={opened}
            onName={(name) => lib.saveSettings({ name })}
          />
        )}
      </div>
      <p className="desk-note">
        Your slides never leave this laptop. LibreOffice and PyMuPDF read them, and an open-weight model, Gemma, writes the notes through Ollama.
      </p>
    </div>
  );
}

/**
 * The hard cover sits on top of the real first page. Opening it swings the board around the
 * spiral (it's stiff, so it doesn't bend like a page) and shows the endpaper on its back.
 */
function Cover({
  name,
  opening,
  onOpen,
  onOpened,
  onName,
}: {
  name: string;
  opening: boolean;
  onOpen: () => void;
  onOpened: () => void;
  onName: (n: string) => void;
}) {
  const [value, setValue] = useState(name);

  const open = () => {
    if (value.trim() !== name) onName(value.trim());
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onOpened();
    onOpen();
  };

  return (
    <>
      {opening && <div className="cover-shadow" aria-hidden />}
      <div className={`cover ${opening ? "cover-opening" : ""}`} onAnimationEnd={(e) => e.target === e.currentTarget && onOpened()}>
        <div className="cover-front" inert={opening}>
          <div className="cover-band" aria-hidden />
          <div className="cover-label">
            <h1>StudyInk</h1>
            <p className="cover-sub">the study book your slides were trying to be</p>
            <label className="cover-owner">
              <span>this book belongs to</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="your name" maxLength={40} onKeyDown={(e) => e.key === "Enter" && open()} />
            </label>
          </div>
          <svg className="cover-emboss" viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M30 30 L110 22 L114 84 L34 92 Z" />
            <path d="M44 42 L92 38 M44 54 L100 50 M44 66 L80 63" />
            <path d="M126 22 C150 18, 178 18, 206 24 L206 96 C178 90, 150 90, 126 94 Z" />
            <path d="M138 36 C158 33, 178 33, 196 36 M138 50 C158 47, 178 47, 196 50 M138 64 C152 62, 166 62, 180 63" />
            <path d="M112 54 C116 50, 120 50, 124 54 M118 48 L124 54 L118 60" />
          </svg>
          <button className="cover-open" onClick={open}>
            open the book →
          </button>
          <p className="cover-foot">
            lecture slides in, a study book out
            <br />
            written by an open model, kept on your own laptop
          </p>
        </div>
        <div className="cover-back" aria-hidden>
          <p className="endpaper-note">
            if found, please return to
            <span>{value || "someone with an exam soon"}</span>
          </p>
        </div>
      </div>
    </>
  );
}
