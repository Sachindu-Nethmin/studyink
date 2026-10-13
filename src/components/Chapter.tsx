"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { citedSlides, parseNotes, pieces, stripCites, type Block } from "@/lib/notes";
import * as store from "@/lib/store";
import type { Figure, Lecture, Section } from "@/lib/types";
import { chapterTitle } from "./Contents";
import { Cross, Lens, Writing } from "./doodles";
import type { Go } from "./Notebook";
import { useImages } from "./useImages";
import { chaptersOf, kept, type Library, type Live } from "./useLibrary";

type Peek = { kind: "slide"; n: number } | { kind: "figure"; id: string } | null;
type Nums = Map<number, number>;

/** A lecture, written up as a chapter of the study book. */
export function Chapter({ lib, go, id }: { lib: Library; go: Go; id: string }) {
  const l = lib.lectures.find((x) => x.id === id);
  if (!l) {
    return (
      <section>
        <p className="pencil">This chapter has been torn out.</p>
        <button className="link" onClick={() => go({ page: "contents" })}>
          ← contents
        </button>
      </section>
    );
  }
  return <ChapterBody key={l.id} lib={lib} go={go} l={l} />;
}

function ChapterBody({ lib, go, l }: { lib: Library; go: Go; l: Lecture }) {
  const [peek, setPeek] = useState<Peek>(null);
  const images = useImages(l.figures.length ? `${l.id}:fig:` : null, l.figures.length);
  const live = lib.live[l.id];
  const subject = lib.subjects.find((s) => s.id === l.subjectId);
  const chNo = chaptersOf(lib, l.subjectId).findIndex((x) => x.id === l.id) + 1;

  const keptFigs = l.figures.filter(kept).sort((a, b) => a.slide - b.slide || a.box[1] - b.box[1]);
  const figNo = new Map(keptFigs.map((f, i) => [f.id, `${chNo}.${i + 1}`]));
  const aside = l.figures.filter((f) => f.verdict && !kept(f));
  const by = l.sections.find((s) => s.by)?.by ?? l.overview?.by;

  // Footnotes are numbered through the chapter; each section lists the slides it leaned on.
  let next = 1;
  const sections = l.sections.map((sec) => {
    const drafting = !sec.text && live?.sectionId === sec.id;
    const blocks = parseNotes(sec.text ?? (drafting ? (live?.draft ?? "") : ""));
    const nums: Nums = new Map(citedSlides(blocks).map((n) => [n, next++]));
    return { sec, blocks, nums, drafting };
  });

  return (
    <article className="chapter">
      <a className="link back" href={subject ? `#/subject/${encodeURIComponent(subject.id)}` : "#/contents"}>
        ← {subject?.code ?? "contents"}
      </a>
      <header className="chapter-head">
        <p className="chapter-kicker">
          <span className="kicker-tab" style={{ background: subject?.color }}>
            {subject?.code}
          </span>
          Chapter {chNo}
        </p>
        <h2 className="chapter-title">{chapterTitle(l)}</h2>
        <p className="typed">
          from {l.fileName}
          {l.pages ? ` · ${l.pages} slides` : ""}
          {keptFigs.length ? ` · ${keptFigs.length} figures` : ""}
          {by ? ` · written by ${by}` : ""}
        </p>
      </header>

      {l.overview?.nutshell && (
        <p className="nutshell">
          <span className="sticky-head">in a nutshell</span>
          <mark>{l.overview.nutshell}</mark>
        </p>
      )}
      {!!l.overview?.outcomes.length && (
        <div className="outcomes">
          <h3 className="section-title">By the end of this chapter you can</h3>
          <ul className="checklist small-list">
            {l.overview.outcomes.map((o) => (
              <li key={o} className="check-row">
                <span className="box" aria-hidden />
                <span className="ink">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {live && !live.sectionId && <Writing label={live.detail} />}
      {l.status === "error" && <p className="pencil error">{l.error}</p>}

      {sections.map((s) => (
        <SectionView key={s.sec.id} l={l} {...s} live={live} figNo={figNo} images={images} onPeek={setPeek} onPin={(fid, keep) => lib.pinFigure(l.id, fid, keep)} />
      ))}

      {l.status === "done" && (
        <footer className="chapter-end">
          {aside.length > 0 && (
            <>
              <h3 className="section-title">What Gemma set aside</h3>
              <p className="pencil small">Cut from the slides but left out of the notes: layouts, decoration, or pictures of text it read for you. Put one back if Gemma got it wrong.</p>
              <ul className="aside-strip">
                {aside.map((f) => (
                  <li key={f.id} className="aside-item">
                    <button className="aside-img" onClick={() => setPeek({ kind: "figure", id: f.id })} aria-label={`Look at the ${f.verdict?.kind} from slide ${f.slide}`}>
                      {images[`${l.id}:fig:${f.id}`] && <img src={images[`${l.id}:fig:${f.id}`]} alt="" />}
                    </button>
                    <span className="typed">
                      slide {f.slide} · {f.verdict?.kind}
                    </span>
                    <button className="mini-btn" onClick={() => lib.pinFigure(l.id, f.id, true)}>
                      put it back
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="section-title">This chapter</h3>
          <div className="actions no-print">
            <button className="ink-btn" onClick={() => window.print()}>
              print it
            </button>
            <button className="ink-btn ink-blue" onClick={() => lib.rewrite(l.id)}>
              have Gemma write it again
            </button>
            <button
              className="link small"
              onClick={() => {
                if (confirm(`Tear "${chapterTitle(l)}" out of the book? Its notes and figures are deleted from this browser.`)) {
                  lib.removeLecture(l.id);
                  go(subject ? { page: "subject", id: subject.id } : { page: "contents" });
                }
              }}
            >
              tear this chapter out
            </button>
          </div>
        </footer>
      )}

      {peek && <PeekOverlay l={l} peek={peek} images={images} figNo={figNo} onClose={() => setPeek(null)} />}
    </article>
  );
}

function SectionView({
  l,
  sec,
  blocks,
  nums,
  drafting,
  live,
  figNo,
  images,
  onPeek,
  onPin,
}: {
  l: Lecture;
  sec: Section;
  blocks: Block[];
  nums: Nums;
  drafting: boolean;
  live?: Live;
  figNo: Map<string, string>;
  images: Record<string, string>;
  onPeek: (p: Peek) => void;
  onPin: (figId: string, keep: boolean) => void;
}) {
  const range = sec.slides.length > 1 ? `slides ${sec.slides[0]}–${sec.slides[sec.slides.length - 1]}` : `slide ${sec.slides[0]}`;
  if (!sec.text && !drafting) {
    return (
      <section className="notes-section">
        <h3 className="section-title section-pending">{sec.title}</h3>
        <p className="pencil small">{l.status === "error" ? "not written" : `waiting its turn · ${range}`}</p>
      </section>
    );
  }

  const heading = blocks.find((b) => b.t === "h")?.text ?? sec.title;
  const flow = groupFlow(blocks);
  const keys = blocks.filter((b) => b.t === "key" && b.term) as Extract<Block, { t: "key" }>[];
  const tips = blocks.filter((b) => b.t === "tip") as Extract<Block, { t: "tip" }>[];
  const qas = blocks.filter((b) => b.t === "qa") as Extract<Block, { t: "qa" }>[];
  const notes = new Map((blocks.filter((b) => b.t === "fig") as Extract<Block, { t: "fig" }>[]).map((b) => [b.id, b.note]));
  const here = l.figures.filter((f) => kept(f) && sec.slides.includes(f.slide));
  // figures Gemma wrote about come first, in its order; the rest follow once the section is done
  const figs = [...here.filter((f) => notes.has(f.id)).sort((a, b) => [...notes.keys()].indexOf(a.id) - [...notes.keys()].indexOf(b.id)), ...(drafting ? [] : here.filter((f) => !notes.has(f.id)))];
  const ink = (t: string) => <Ink text={t} nums={nums} onPeek={onPeek} />;

  return (
    <section className="notes-section">
      <h3 className="section-title">{heading}</h3>
      {flow.map((g, i) => {
        switch (g.t) {
          case "gist":
            return (
              <p key={i} className="gist">
                <span className="sticky-head">the gist</span>
                <mark>{ink(g.text)}</mark>
              </p>
            );
          case "p":
            return (
              <p key={i} className="ink notes-p">
                {ink(g.text)}
              </p>
            );
          case "points":
            return (
              <ul key={i} className="points">
                {g.items.map((it, j) => (
                  <li key={j}>
                    {ink(it.text)}
                    {it.sub.length > 0 && (
                      <ul className="subpoints">
                        {it.sub.map((x, k) => (
                          <li key={k}>{ink(x)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            );
          case "steps":
            return (
              <ol key={i} className="flow" aria-label="Steps, in order">
                {g.items.map((x, j) => (
                  <li key={j} className="flow-step">
                    <span className="flow-no">{j + 1}</span>
                    <span className="flow-text">{ink(x)}</span>
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={i} className="mini-table-wrap">
                <table className="mini-table">
                  {g.head && (
                    <thead>
                      <tr>
                        {g.head.map((c, j) => (
                          <th key={j}>{ink(c)}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {g.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (k === 0 ? <th key={k}>{ink(c)}</th> : <td key={k}>{ink(c)}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}

      {figs.map((f, i) => (
        <Plate key={f.id} l={l} f={f} no={figNo.get(f.id) ?? ""} note={notes.get(f.id)} src={images[`${l.id}:fig:${f.id}`]} tilt={i % 2 ? 0.8 : -0.7} onPeek={onPeek} onPin={onPin} />
      ))}

      {keys.length > 0 && (
        <dl className="keycard">
          <span className="sticky-head">key terms</span>
          {keys.map((k, i) => (
            <Fragment key={i}>
              <dt>{stripCites(k.term)}</dt>
              <dd>{ink(k.meaning)}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {tips.map((t, i) => (
        <p key={i} className="sticky sticky-yellow tip">
          <span className="sticky-head">remember</span>
          {ink(t.text)}
        </p>
      ))}

      {qas.length > 0 && (
        <div className="selfcheck">
          <span className="sticky-head">check yourself</span>
          {qas.map((q, i) => (
            <QA key={i} q={q.q} a={q.a} ink={ink} />
          ))}
        </div>
      )}

      {drafting && <Writing label={live?.detail ?? "writing…"} />}

      {nums.size > 0 && (
        <ol className="footnotes" aria-label="Footnotes: the slides this section came from">
          {[...nums].map(([n, num]) => {
            const s = l.slides.find((x) => x.n === n);
            return (
              <li key={n} value={num}>
                <button className="fn-row" onClick={() => onPeek({ kind: "slide", n })}>
                  <span className="fn-num">{num}</span>
                  slide {n}
                  {s?.title ? ` · ${s.title}` : ""}
                  {s?.transcript ? " (Gemma read it off a picture)" : ""}
                  {!s ? " (not in this deck)" : ""}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

type Flow =
  | { t: "gist" | "p"; text: string }
  | { t: "points"; items: { text: string; sub: string[] }[] }
  | { t: "steps"; items: string[] }
  | { t: "table"; head?: string[]; rows: string[][] };

/** The section's body in Gemma's order, with runs of points, steps and table rows gathered up. */
function groupFlow(blocks: Block[]): Flow[] {
  const out: Flow[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.t === "gist" || b.t === "p") out.push({ t: b.t, text: b.text });
    else if (b.t === "li") {
      const list = prev?.t === "points" ? prev : (out[out.push({ t: "points", items: [] }) - 1] as Extract<Flow, { t: "points" }>);
      const parent = list.items[list.items.length - 1];
      if (b.depth === 1 && parent) parent.sub.push(b.text);
      else list.items.push({ text: b.text, sub: [] });
    } else if (b.t === "step") {
      if (prev?.t === "steps") prev.items.push(b.text);
      else out.push({ t: "steps", items: [b.text] });
    } else if (b.t === "row") {
      const table = prev?.t === "table" && !b.head ? prev : (out[out.push({ t: "table", rows: [] }) - 1] as Extract<Flow, { t: "table" }>);
      if (b.head && b.cells.length > 1) table.head = b.cells;
      else table.rows.push(b.cells);
    }
  }
  // a header with nothing under it is just a row of labels
  for (const g of out) if (g.t === "table" && g.head && !g.rows.length) [g.rows, g.head] = [[g.head], undefined];
  return out;
}

/** Text with its slide tags turned into footnote markers. */
function Ink({ text, nums, onPeek }: { text: string; nums: Nums; onPeek: (p: Peek) => void }) {
  return (
    <>
      {pieces(text).map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <sup key={i} className="fn">
            {p.slides.map((n, j) => (
              <Fragment key={n}>
                {j > 0 && ","}
                <button className="fn-mark" onClick={() => onPeek({ kind: "slide", n })} aria-label={`footnote ${nums.get(n)}: slide ${n}`}>
                  {nums.get(n) ?? n}
                </button>
              </Fragment>
            ))}
          </sup>
        ),
      )}
    </>
  );
}

function QA({ q, a, ink }: { q: string; a: string; ink: (t: string) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qa">
      <p className="qa-q">{ink(q)}</p>
      {a &&
        (open ? (
          <p className="qa-a">{ink(a)}</p>
        ) : (
          <button className="link small" onClick={() => setOpen(true)}>
            show the answer
          </button>
        ))}
    </div>
  );
}

/** A figure taped into the notes. */
function Plate({
  l,
  f,
  no,
  note,
  src,
  tilt,
  onPeek,
  onPin,
}: {
  l: Lecture;
  f: Figure;
  no: string;
  note?: string;
  src?: string;
  tilt: number;
  onPeek: (p: Peek) => void;
  onPin: (figId: string, keep: boolean) => void;
}) {
  const caption = f.verdict?.caption || l.slides.find((s) => s.n === f.slide)?.title || "From the slides";
  const say = note ? stripCites(note) : f.verdict?.explain;
  return (
    <figure className="plate" style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}>
      <span className={`tape ${no.endsWith("1") ? "tape-1" : ""}`} aria-hidden />
      <button className="plate-img" onClick={() => onPeek({ kind: "figure", id: f.id })} aria-label={`Fig. ${no}, larger`}>
        {src ? <img src={src} alt={caption} style={{ aspectRatio: `${f.w} / ${f.h}` }} /> : <span className="sketch" style={{ aspectRatio: `${f.w} / ${f.h}` }} />}
        <span className="plate-zoom" aria-hidden>
          <Lens size={20} />
        </span>
      </button>
      <figcaption>
        <span className="plate-no">Fig. {no}</span> {caption}
      </figcaption>
      {say && <p className="plate-note">{say}</p>}
      <p className="plate-foot">
        <button className="link small" onClick={() => onPeek({ kind: "slide", n: f.slide })}>
          from slide {f.slide}
        </button>
        <button className="link small no-print" onClick={() => onPin(f.id, false)}>
          take it out
        </button>
      </p>
    </figure>
  );
}

/** A slide or a figure, held up close. */
function PeekOverlay({ l, peek, images, figNo, onClose }: { l: Lecture; peek: NonNullable<Peek>; images: Record<string, string>; figNo: Map<string, string>; onClose: () => void }) {
  const [slideImg, setSlideImg] = useState<string | undefined>();
  const n = peek.kind === "slide" ? peek.n : undefined;

  useEffect(() => {
    if (n === undefined) return;
    let alive = true;
    store.getImage(`${l.id}:slide:${n}`).then((x) => alive && setSlideImg(x));
    return () => {
      alive = false;
    };
  }, [l.id, n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const slide = n !== undefined ? l.slides.find((s) => s.n === n) : undefined;
  const fig = peek.kind === "figure" ? l.figures.find((f) => f.id === peek.id) : undefined;

  return createPortal(
    <div className="peek" role="dialog" aria-modal="true" aria-label={slide ? `Slide ${n}` : "Figure"} onClick={onClose}>
      <div className="peek-card" onClick={(e) => e.stopPropagation()}>
        <button className="peek-close" onClick={onClose} aria-label="Close" autoFocus>
          <Cross size={20} />
        </button>
        {peek.kind === "slide" ? (
          <>
            <p className="typed">
              {l.fileName} · slide {n} of {l.pages}
            </p>
            <h3 className="peek-title">{slide?.title || `Slide ${n}`}</h3>
            {slideImg ? <img className="peek-img" src={slideImg} alt={`Slide ${n}`} style={{ aspectRatio: String(l.aspect) }} /> : <div className="peek-img sketch" style={{ aspectRatio: String(l.aspect) }} />}
            {slide?.notes && <p className="pencil small">Speaker notes: {slide.notes}</p>}
            {slide?.transcript && <p className="pencil small">Gemma read this off a picture on the slide: {slide.transcript}</p>}
          </>
        ) : (
          fig && (
            <>
              <p className="typed">
                {kept(fig) ? `Fig. ${figNo.get(fig.id)}` : `set aside as ${fig.verdict?.kind}`} · slide {fig.slide}
              </p>
              <h3 className="peek-title">{fig.verdict?.caption || "From the slides"}</h3>
              {images[`${l.id}:fig:${fig.id}`] && <img className="peek-img" src={images[`${l.id}:fig:${fig.id}`]} alt={fig.verdict?.caption ?? ""} />}
              {fig.verdict?.explain && <p className="ink small">{fig.verdict.explain}</p>}
              {fig.verdict && <p className="typed">looked at by {fig.verdict.by}</p>}
            </>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
