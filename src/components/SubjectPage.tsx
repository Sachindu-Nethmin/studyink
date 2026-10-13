"use client";

import { useState } from "react";
import { chapterTitle, statusLine } from "./Contents";
import { Plus } from "./doodles";
import type { Go } from "./Notebook";
import { chaptersOf, type Library } from "./useLibrary";

/** A subject's divider page: its name (written in by hand), and its chapters. */
export function SubjectPage({ lib, go, id }: { lib: Library; go: Go; id: string }) {
  const s = lib.subjects.find((x) => x.id === id);
  const [name, setName] = useState(s?.name ?? "");
  if (!s) {
    return (
      <section>
        <p className="pencil">That subject isn&apos;t in this book.</p>
        <button className="link" onClick={() => go({ page: "contents" })}>
          ← contents
        </button>
      </section>
    );
  }
  const chapters = chaptersOf(lib, s.id);
  const saveName = () => name.trim() !== s.name && lib.saveSubject({ ...s, name: name.trim() });

  return (
    <section className="divider">
      <a className="link back" href="#/contents">
        ← contents
      </a>
      <div className="divider-band" style={{ background: s.color }} aria-hidden />
      <p className="typed">
        {s.year ? `${s.year} · ` : ""}
        {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
        {s.link && (
          <>
            {" · "}
            <a href={s.link} target="_blank" rel="noreferrer" className="typed-link">
              course page on the LMS ↗
            </a>
          </>
        )}
      </p>
      <h2 className="divider-code">{s.code}</h2>
      <label className="divider-name">
        <span className="sr-only">Subject name</span>
        <input
          className="line-input big"
          value={name}
          placeholder="write the subject's name here"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          maxLength={60}
        />
      </label>

      <h3 className="section-title">Chapters</h3>
      {chapters.length ? (
        <ol className="toc-chapters toc-chapters-big">
          {chapters.map((l, i) => (
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
      ) : (
        <p className="pencil">No lectures taped in yet.</p>
      )}
      <div className="actions">
        <button className="ink-btn ink-red" onClick={() => go({ page: "add", id: s.id })}>
          <Plus /> add a lecture to {s.code}
        </button>
      </div>
    </section>
  );
}
