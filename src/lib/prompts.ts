/**
 * Every prompt the notebook sends, its parser, and what the notebook writes when there's no model
 * at all (so a chapter is never blank). Three jobs:
 *
 *   figure   — Gemma *looks* at a region cropped from a slide (vision) and says whether it's a real
 *              figure (diagram, table, chart, photo) or layout/decoration, and captions it. A picture
 *              that's only text gets transcribed, so its words reach the notes.
 *   overview — names the chapter and writes "in a nutshell" + learning outcomes from the outline.
 *   section  — writes a few slides up as visual revision notes (a gist, short points, step flows,
 *              comparison tables, key terms), in a small line format that streams well and parses
 *              even when a small model drifts. Every point carries a slide tag ([s12]), which the
 *              book turns into a footnote pointing back at that slide.
 */
import type { ChatMsg, Overview, Verdict } from "./types";

const GROUNDED = "You only use what is on the slides and in the speaker notes. You never add facts, names, dates, numbers or examples that are not there.";

// ── figure ──────────────────────────────────────────────────────────────────

export type FigureInput = { src: string; slideTitle: string; slideText: string; labels: string };

const KEEP = new Set(["diagram", "flowchart", "table", "chart", "photo", "screenshot"]);

export function figurePrompt(f: FigureInput): ChatMsg[] {
  return [
    { role: "system", content: "You help a student turn lecture slides into a study notebook. You look at one region cropped from a slide and say what it is." },
    {
      role: "user",
      images: [f.src],
      content: `Slide title: "${f.slideTitle || "untitled"}". Text found inside the crop: "${f.labels || "none"}".
Other text on the slide: "${f.slideText.slice(0, 500) || "none"}".

What is this crop? Answer with JSON only:
{"kind": "diagram|flowchart|table|chart|photo|screenshot|text|layout|decoration",
 "keep": true or false,
 "caption": "short figure caption, at most 9 words",
 "explain": "one or two sentences: what it shows and how to read it",
 "transcript": "only when kind is text: the words in the picture, line by line. For every other kind leave it empty: \"\""}

kind:
- diagram / flowchart: shapes connected by lines or arrows, a cycle, a tree, a process
- table: rows and columns
- chart: a plot or graph with data
- photo / screenshot: a picture of something real or of software
- text: a picture that is just sentences or a bullet list
- layout: boxes or cards that only hold text side by side, with no arrows or structure between them
- decoration: logos, icons, backgrounds, social links
keep is true only for diagram, flowchart, table, chart, photo and screenshot.
Only describe what is visible. Do not invent labels.`,
    },
  ];
}

export function parseVerdict(text: string, by: string): (Verdict & { transcript: string }) | null {
  const o = parseJSON(text);
  if (!o) return null;
  const kind = String(o.kind ?? "").toLowerCase().split(/[|/,\s]/)[0] || "diagram";
  return {
    kind,
    keep: KEEP.has(kind) ? o.keep !== false : false,
    caption: tidy(String(o.caption ?? ""), 90).replace(/^(fig(ure)?\.?\s*\d*[:.\s-]*)/i, ""),
    explain: tidy(String(o.explain ?? ""), 400),
    transcript: kind === "text" ? String(o.transcript ?? "").trim().slice(0, 2000) : "",
    by,
  };
}

export const fallbackVerdict = (f: FigureInput): Verdict => ({ kind: "figure", keep: true, caption: f.slideTitle || "From the slides", explain: "", by: "the slide title" });

// ── overview ────────────────────────────────────────────────────────────────

export type OverviewInput = {
  fileName: string;
  subject: string; // "IS7101 Research Methodology"
  deckTitle: string;
  front: string; // what the cover / outline / outcomes slides say
  titles: string[]; // the slide titles, in order, without repeats
};

export function overviewPrompt(o: OverviewInput): ChatMsg[] {
  return [
    { role: "system", content: `You are a senior student organising a classmate's study notebook. ${GROUNDED}` },
    {
      role: "user",
      content: `A lecture for ${o.subject || "a university course"}. File name: "${o.fileName}". The deck calls itself "${o.deckTitle}".
What the first slides say:
${o.front.slice(0, 1200) || "(nothing)"}

The slide titles, in order:
${o.titles.slice(0, 70).map((t) => `- ${t}`).join("\n")}

Answer with JSON only:
{"title": "a chapter title for this lecture, at most 8 words; the topic of THIS lecture, not the course name",
 "nutshell": "two plain sentences: what this lecture is about and why it matters",
 "outcomes": ["three to five things the student can do after studying it, each starting with a verb"]}`,
    },
  ];
}

export function parseOverview(text: string, by: string): Overview | null {
  const o = parseJSON(text);
  if (!o || !o.title) return null;
  return {
    title: tidy(String(o.title), 80).replace(/^["']|["']$/g, ""),
    nutshell: tidy(String(o.nutshell ?? ""), 500),
    outcomes: (Array.isArray(o.outcomes) ? o.outcomes : []).map((x: unknown) => tidy(String(x), 160)).filter(Boolean).slice(0, 5),
    by,
  };
}

export function fallbackOverview(o: OverviewInput): Overview {
  const outcomes = o.front
    .split("\n")
    .map((l) => l.replace(/^[\s\-•\d.)]+/, "").trim())
    .filter((l) => l.split(" ").length >= 2 && l.split(" ").length <= 16)
    .slice(0, 5);
  return { title: o.deckTitle || o.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), nutshell: "", outcomes, by: "the slides' own outline" };
}

// ── section ─────────────────────────────────────────────────────────────────

export type SectionInput = {
  subject: string;
  lecture: string;
  title: string;
  index: number;
  total: number;
  slides: { n: number; title: string; text: string; notes: string; transcript?: string }[];
  figures: { id: string; slide: number; caption: string; explain: string }[];
};

export function sectionPrompt(s: SectionInput): ChatMsg[] {
  const first = s.slides[0]?.n ?? 1;
  const material = s.slides
    .map((sl) => {
      const parts = [`[s${sl.n}] ${sl.title || "(no title)"}`, clip(sl.text, 260)];
      if (sl.transcript) parts.push(`(words in a picture on this slide) ${clip(sl.transcript, 200)}`);
      if (sl.notes) parts.push(`Speaker notes: ${clip(sl.notes, 160)}`);
      for (const f of s.figures.filter((f) => f.slide === sl.n)) parts.push(`Figure [${f.id}] on this slide: ${f.caption}. ${f.explain}`);
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n");
  const figLine = s.figures.length
    ? `FIG: ${s.figures[0].id} — what to notice in this figure, in one sentence\n(one FIG line for each figure listed above, with its id)`
    : "(there are no figures in this section, so no FIG lines)";

  return [
    {
      role: "system",
      content: `You are a kind, sharp senior student writing a study notebook from a lecturer's slides, for a classmate who will revise from it the night before the exam. ${GROUNDED}`,
    },
    {
      role: "user",
      content: `Course: ${s.subject || "a university course"}
Lecture: ${s.lecture}
Section ${s.index} of ${s.total}: "${s.title}"

The slides:
${material}

Write this section of the notebook as quick, visual revision notes, in exactly this format:

# a short heading for the section
GIST: the one big idea of these slides, in one plain sentence [s${first}]
- a short point, at most 18 words, in your own plain words [s${first}]
  - a detail or example under that point, indented two spaces [s${first}]
(four to eight points; group related ones with sub-points)
STEP: first step of a process, in a few words [s${first}]
STEP: next step [s${first}]
(STEP lines only when the slides describe things that happen in order, three or more of them; then don't repeat those steps as points)
TABLE: aspect | first thing | second thing
TABLE: one aspect | how the first thing does it | how the second does it
(TABLE lines only when the slides compare two or more things; the first TABLE line is the header)
KEY: term — what it means, in a few words [s${first}]
(one to four KEY lines, for the terms worth memorising)
${figLine}
TIP: one memory hook or exam tip
Q: a self-check question
A: its answer in one short sentence
(one or two Q and A pairs)

Short points, never long paragraphs. Tag every point with the slide it came from, like [s${first}]. No markdown bold, no "In this section". Nothing that is not on the slides.`,
    },
  ];
}

/** No model: the slides' own words, as points in the same format, so the page still works. */
export function fallbackSection(s: SectionInput) {
  const lines = [`# ${s.title}`];
  for (const sl of s.slides) {
    const points = [sl.text, sl.transcript]
      .filter(Boolean)
      .join("\n")
      .split("\n")
      .filter((l) => l.trim());
    for (const l of points) {
      const depth = /^\s{2,}/.test(l) ? "  " : "";
      lines.push(`${depth}- ${l.replace(/^[\s\-•]+/, "").trim()} [s${sl.n}]`);
    }
  }
  for (const f of s.figures) lines.push(`FIG: ${f.id} — ${f.caption}`);
  return lines.join("\n");
}

// ── helpers ─────────────────────────────────────────────────────────────────

function clip(text: string, words: number) {
  const w = (text || "").split(/\s+/);
  return w.length > words ? `${w.slice(0, words).join(" ")} …` : text || "";
}

function tidy(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
}

function parseJSON(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  // An answer cut off by the token limit (usually mid-transcript): keep the fields that finished.
  const out: Record<string, unknown> = {};
  for (const f of text.matchAll(/"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    try {
      out[f[1]] = JSON.parse(`"${f[2]}"`);
    } catch {
      out[f[1]] = f[2];
    }
  }
  for (const f of text.matchAll(/"(\w+)"\s*:\s*(true|false)/g)) out[f[1]] = f[2] === "true";
  return Object.keys(out).length ? out : null;
}
