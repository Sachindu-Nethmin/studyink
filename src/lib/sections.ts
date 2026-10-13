/**
 * How a deck is cut into sections for the model to write up: consecutive slides with the same
 * title belong together, tiny sections are folded into their neighbour, and long ones are split,
 * so each call gets a few slides' worth of material (a small model writes better notes from
 * 3–7 slides than from 40).
 */
import type { Section, Slide } from "./types";

// (decks often use a curly apostrophe: "On today’s lecture")
const OUTLINE = /^(outline|agenda|contents?|overview|today['’]?s? (lecture|topics?|session)|on today['’]?s lecture|learning (outcomes|objectives)|objectives|what you should be able to do|session outcomes)\b/i;
const MIN_WORDS = 110;
const MAX_WORDS = 950;
const MAX_SLIDES = 7;

const key = (t: string) =>
  t
    .toLowerCase()
    .replace(/\(?\b(cont(inued|'d|\.)?|part \d+|\d+ of \d+)\b\)?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const slideWords = (s: Slide) => s.words + (s.transcript ? s.transcript.split(/\s+/).length : 0);

/** The slides that are about the lecture rather than content: cover, outline, outcomes. */
export function frontMatter(slides: Slide[]) {
  return slides.filter((s, i) => (i === 0 && slideWords(s) < 45 && !s.figures.length) || OUTLINE.test(s.title));
}

export function planSections(slides: Slide[], keptFigures: Set<string>): Section[] {
  const front = new Set(frontMatter(slides).map((s) => s.n));
  const usable = slides.filter((s) => !s.skip && !front.has(s.n) && (slideWords(s) >= 3 || s.figures.some((f) => keptFigures.has(f))));

  type G = { title: string; key: string; slides: Slide[] };
  const groups: G[] = [];
  for (const s of usable) {
    const k = key(s.title) || `untitled-${s.n}`;
    const last = groups[groups.length - 1];
    if (last && (last.key === k || !s.title)) last.slides.push(s);
    else groups.push({ title: s.title || "Notes", key: k, slides: [s] });
  }

  const words = (g: G) => g.slides.reduce((n, s) => n + slideWords(s) + 40 * s.figures.filter((f) => keptFigures.has(f)).length, 0);

  // fold tiny sections into a neighbour
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (words(g) >= MIN_WORDS || groups.length === 1) continue;
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const fits = (o?: G) => o && o.slides.length + g.slides.length <= MAX_SLIDES && words(o) + words(g) <= MAX_WORDS;
    if (fits(prev)) {
      prev!.slides.push(...g.slides);
      groups.splice(i--, 1);
    } else if (fits(next)) {
      next!.slides.unshift(...g.slides);
      next!.title = g.title;
      groups.splice(i--, 1);
    }
  }

  // split long ones
  const out: G[] = [];
  for (const g of groups) {
    let cur: G = { ...g, slides: [] };
    for (const s of g.slides) {
      if (cur.slides.length && (cur.slides.length >= MAX_SLIDES || words(cur) + slideWords(s) > MAX_WORDS)) {
        out.push(cur);
        cur = { ...g, title: s.title || g.title, slides: [] };
      }
      cur.slides.push(s);
    }
    if (cur.slides.length) out.push(cur);
  }

  return out.map((g, i) => ({ id: `s${i + 1}`, title: g.title, slides: g.slides.map((s) => s.n) }));
}
