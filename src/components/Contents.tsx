"use client";

import { Arrow, Plus, Scribble } from "./doodles";
import type { Go } from "./Notebook";
import { chaptersOf, kept, type Library } from "./useLibrary";
import type { Lecture } from "@/lib/types";

export const chapterTitle = (l: Lecture) => l.overview?.title || l.title;

export function statusLine(lib: Library, l: Lecture) {
  const live = lib.live[l.id];
  if (live) return live.detail;
  if (l.status === "error") return l.error ?? "something went wrong";
  if (l.status !== "done") return "waiting its turn";
  return `${l.pages} slides · ${l.figures.filter(kept).length} figures`;
}

/** The table of contents: every subject, and the chapters each one has so far. */
export function Contents({ lib, go }: { lib: Library; go: Go }) {
  const total = lib.lectures.length;
  const figs = lib.lectures.reduce((n, l) => n + l.figures.filter(kept).length, 0);
  const withChapters = lib.subjects.filter((s) => chaptersOf(lib, s.id).length);
  const without = lib.subjects.filter((s) => !chaptersOf(lib, s.id).length);

  return (
    <section>
      <header className="page-head">
        <h2>
          Contents
          <Scribble className="scribble" />
        </h2>
      </header>
      <p className="pencil">
        {lib.settings.name ? `${lib.settings.name}'s study book. ` : ""}
        {total
          ? `${total} ${total === 1 ? "chapter" : "chapters"} and ${figs} figures so far, every one written from your own slides.`
          : "Nothing in here yet. Tape a lecture in and Gemma will turn it into chapter one."}
      </p>

      {!total && (
        <div className="empty">
          <button className="ink-btn ink-red" onClick={() => go({ page: "add" })}>
            <Plus /> add your first lecture
          </button>
          <Arrow className="empty-arrow" />
        </div>
      )}

      {withChapters.map((s) => (
        <div key={s.id} className="toc-subject">
          <a className="toc-row toc-subject-row" href={`#/subject/${encodeURIComponent(s.id)}`}>
            <span className="toc-dot" style={{ background: s.color }} aria-hidden />
            <span className="toc-name">
              {s.code}
              {s.name && <span className="toc-sub"> · {s.name}</span>}
            </span>
            <span className="toc-leader" aria-hidden />
            <span className="toc-num">{chaptersOf(lib, s.id).length}</span>
          </a>
          <ol className="toc-chapters">
            {chaptersOf(lib, s.id).map((l, i) => (
              <li key={l.id}>
                <a className="toc-row" href={`#/chapter/${l.id}`}>
                  <span className="toc-ch">{i + 1}</span>
                  <span className="toc-name toc-chapter">{chapterTitle(l)}</span>
                  <span className="toc-leader" aria-hidden />
                  <span className={`toc-meta ${lib.live[l.id] ? "toc-live" : ""} ${l.status === "error" ? "error" : ""}`}>{statusLine(lib, l)}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {without.length > 0 && (
        <>
          <h3 className="section-title">{withChapters.length ? "Still empty" : "Your subjects"}</h3>
          <p className="toc-empty">
            {without.map((s, i) => (
              <span key={s.id}>
                <a className="link" href={`#/subject/${encodeURIComponent(s.id)}`}>
                  {s.code}
                </a>
                {s.name ? <span className="pencil small"> {s.name}</span> : null}
                {i < without.length - 1 ? <span className="pencil"> · </span> : null}
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
