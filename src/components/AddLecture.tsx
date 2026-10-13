"use client";

import { useState } from "react";
import { chapterTitle } from "./Contents";
import { Check, Cross, Deck, Scribble, Writing } from "./doodles";
import type { Go } from "./Notebook";
import { useImages } from "./useImages";
import { kept, type Library } from "./useLibrary";
import { stripCites } from "@/lib/notes";
import type { Lecture } from "@/lib/types";

const ACCEPT = ".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";

const STEPS = [
  { key: "reading", label: "Read the slides", hint: "LibreOffice and PyMuPDF, on this laptop" },
  { key: "looking", label: "Look at every figure", hint: "Gemma keeps the diagrams, tables and charts, and sets the decoration aside" },
  { key: "naming", label: "Name the chapter", hint: "from the cover and outline slides" },
  { key: "writing", label: "Write the notes", hint: "a few slides at a time, with a footnote back to every slide" },
] as const;

/** Tape a lecture in: pick the subject, drop the deck, and watch the chapter get written. */
export function AddLecture({ lib, go, subjectId }: { lib: Library; go: Go; subjectId?: string }) {
  const [subject, setSubject] = useState(subjectId ?? lib.subjects.find((s) => s.id === lastSubject())?.id ?? lib.subjects[0]?.id);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const take = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])];
    if (!files.length || !subject) return;
    const bad = files.find((f) => !/\.(pptx|pdf)$/i.test(f.name));
    if (bad) return setProblem(`${bad.name} isn't a .pptx or .pdf. Save it as one of those first (Keynote and Google Slides can export both).`);
    setProblem(null);
    try {
      localStorage.setItem("studyink:subject", subject);
    } catch {}
    for (const f of files) await lib.addLecture(f, subject);
  };

  // everything still being written, then the last few that were finished
  const newest = [...lib.lectures].sort((a, b) => b.addedAt - a.addedAt);
  const active = newest.filter((l) => l.status !== "done");
  const finished = newest.filter((l) => l.status === "done").slice(0, active.length ? 1 : 2);

  return (
    <section className="add">
      <header className="page-head">
        <h2>
          Add a lecture
          <Scribble className="scribble" />
        </h2>
      </header>

      {/* what's being written comes first, so it's on the page you're looking at */}
      {active.map((l) => (
        <Job key={l.id} lib={lib} l={l} go={go} />
      ))}

      <p className="hand-label">{active.length ? "Add another? Which subject is it for?" : "Which subject is it for?"}</p>
      <div className="chips" role="radiogroup" aria-label="Subject">
        {lib.subjects.map((s) => (
          <button key={s.id} role="radio" aria-checked={subject === s.id} className={`chip ${subject === s.id ? "chip-on" : ""}`} onClick={() => setSubject(s.id)} title={s.name || undefined}>
            {s.code}
          </button>
        ))}
      </div>

      <label
        className={`dropzone ${over ? "dropzone-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <span className="tape tape-1" aria-hidden />
        <Deck size={44} />
        <span className="dropzone-big">drop the slides here</span>
        <span className="pencil">or click to pick a .pptx or .pdf: lecture decks, tutorial slides, anything with slides</span>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {problem && <p className="pencil error">{problem}</p>}

      {finished.map((l) => (
        <Job key={l.id} lib={lib} l={l} go={go} />
      ))}
    </section>
  );
}

/** The last couple of lines Gemma wrote, without the markup, as a glimpse of the pen moving. */
function lastLines(draft: string) {
  return draft
    .split("\n")
    .map((l) => stripCites(l.replace(/^\s*(?:[-*•]|#+|[A-Z]{2,6}:)\s*/, "").replace(/\s*\|\s*/g, " · ")))
    .filter(Boolean)
    .slice(-2)
    .join("\n");
}

function lastSubject() {
  try {
    return localStorage.getItem("studyink:subject");
  } catch {
    return null;
  }
}

function Job({ lib, l, go }: { lib: Library; l: Lecture; go: Go }) {
  const live = lib.live[l.id];
  const judged = l.figures.filter((f) => f.verdict).length;
  const images = useImages(l.figures.length ? `${l.id}:fig:` : null, l.figures.length);
  const subject = lib.subjects.find((s) => s.id === l.subjectId);
  const at = l.status === "done" ? 4 : l.status === "error" ? -1 : live ? STEPS.findIndex((s) => s.key === live.step) : STEPS.findIndex((s) => s.key === l.status);
  const written = l.sections.filter((s) => s.text).length;

  return (
    <article className="job">
      <header className="job-head">
        <span className="job-subject" style={{ background: subject?.color }}>
          {subject?.code}
        </span>
        <h3 className="job-title">{chapterTitle(l)}</h3>
        <span className="typed">{l.fileName}</span>
      </header>
      <ol className="job-steps">
        {STEPS.map((s, i) => {
          const state = l.status === "error" ? (i === 0 && !l.slides.length ? "failed" : "todo") : i < at ? "done" : i === at ? "now" : "todo";
          return (
            <li key={s.key} className={`job-step job-${state}`}>
              <span className={`box ${state === "done" ? "box-ticked" : ""}`} aria-hidden>
                {state === "done" ? <Check size={26} /> : state === "failed" ? <Cross size={18} /> : null}
              </span>
              <span>
                <span className="job-label">{s.label}</span>
                {state === "now" && live ? (
                  <span className="job-detail">
                    {live.detail}
                    {live.n ? <progress max={live.n} value={live.i ?? 0} /> : null}
                  </span>
                ) : state === "now" ? (
                  <span className="job-detail">waiting for the chapter ahead of it to finish</span>
                ) : (
                  <span className="job-hint">
                    {s.key === "reading" && l.pages ? `${l.pages} slides, ${l.figures.length} possible figures` : s.key === "looking" && judged ? `${l.figures.filter(kept).length} of ${l.figures.length} kept` : s.key === "writing" && l.sections.length ? `${written} of ${l.sections.length} sections` : s.hint}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {l.status === "error" && <p className="pencil error">{l.error}</p>}

      {l.figures.length > 0 && (
        <ul className="job-figs" aria-label="Figures found">
          {l.figures.map((f) => (
            <li key={f.id} className={`job-fig ${f.verdict ? (kept(f) ? "job-fig-kept" : "job-fig-aside") : ""}`} title={f.verdict ? `${f.verdict.kind}: ${f.verdict.caption}` : "not looked at yet"}>
              {images[`${l.id}:fig:${f.id}`] ? <img src={images[`${l.id}:fig:${f.id}`]} alt="" /> : null}
              {f.verdict && <span className="job-fig-mark">{kept(f) ? <Check size={18} /> : <Cross size={14} />}</span>}
            </li>
          ))}
        </ul>
      )}

      {live?.step === "writing" && live.draft && (
        <div className="job-draft">
          <Writing label={`section ${live.i} of ${live.n}`} />
          <p className="ink small job-draft-text">{lastLines(live.draft)}</p>
        </div>
      )}

      <div className="actions">
        {l.slides.length > 0 && (
          <button className="ink-btn ink-blue" onClick={() => go({ page: "chapter", id: l.id })}>
            {l.status === "done" ? "open the chapter →" : "watch it being written →"}
          </button>
        )}
        {l.status === "error" && (
          <button className="link small" onClick={() => lib.removeLecture(l.id)}>
            remove
          </button>
        )}
      </div>
    </article>
  );
}
