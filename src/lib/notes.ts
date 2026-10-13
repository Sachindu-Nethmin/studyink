/**
 * Reads the notes Gemma writes (see sectionPrompt) into blocks the page can lay out. Lenient on
 * purpose: it's parsed again on every streamed token, and small models drift ("**Key term:**",
 * "Figure f2:", "Q1.", table rows without their "TABLE:"), so anything it doesn't recognise is a
 * plain point or paragraph rather than lost.
 */

export type Block =
  | { t: "h"; text: string }
  | { t: "gist"; text: string }
  | { t: "p"; text: string }
  | { t: "li"; depth: 0 | 1; text: string }
  | { t: "step"; text: string }
  | { t: "row"; cells: string[]; head: boolean }
  | { t: "key"; term: string; meaning: string }
  | { t: "fig"; id: string; note: string }
  | { t: "tip"; text: string }
  | { t: "qa"; q: string; a: string };

const KEY = /^(?:key(?:\s*terms?)?|term)\s*[:：]\s*(.+)$/i;
const FIG = /^fig(?:ure)?\.?\s*[:：]?\s*\[?(f\d+)\]?\s*[—–:\-]*\s*(.*)$/i;
const TIP = /^(?:tip|exam tip|memory hook|remember)\s*[:：]\s*(.+)$/i;
const GIST = /^(?:gist|big idea|in short|summary)\s*[:：]\s*(.+)$/i;
const STEP = /^(?:step(?:\s*\d+)?\s*[:：.)]|\d{1,2}[.)]\s)\s*(.+)$/i;
const TABLE = /^table\s*[:：]\s*(.+)$/i;
const Q = /^q(?:uestion)?\s*\d*\s*[:：.)]\s*(.+)$/i;
const A = /^a(?:nswer)?\s*\d*\s*[:：.)]\s*(.+)$/i;

export function parseNotes(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: "p", text: para.join(" ") });
    para = [];
  };
  const last = () => out[out.length - 1];

  for (const raw of text.split("\n")) {
    const indent = (raw.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
    const clean = raw.replace(/\*\*|__/g, "").trim();
    const bullet = /^[-*•▪◦]\s+/.test(clean);
    const line = clean.replace(/^[-*•▪◦]\s+/, "").trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,6}\s*(.+)$/))) {
      flush();
      out.push({ t: "h", text: m[1].trim() });
    } else if (!out.length && !para.length && !bullet && line.length < 90 && !/\[s\d/i.test(line) && !/[.:]$/.test(line) && !/^[A-Z]+\s*:/.test(line)) {
      out.push({ t: "h", text: line }); // a heading without its "#"
    } else if ((m = line.match(GIST))) {
      flush();
      out.push({ t: "gist", text: m[1].trim() });
    } else if ((m = line.match(KEY))) {
      flush();
      const [term, ...rest] = m[1].split(/\s+[—–-]\s+|:\s+|\s+—|—\s+/);
      out.push({ t: "key", term: term.trim(), meaning: rest.join(" — ").trim() });
    } else if ((m = line.match(FIG))) {
      flush();
      out.push({ t: "fig", id: m[1].toLowerCase(), note: m[2].trim() });
    } else if ((m = line.match(TIP))) {
      flush();
      out.push({ t: "tip", text: m[1].trim() });
    } else if ((m = line.match(Q))) {
      flush();
      out.push({ t: "qa", q: m[1].trim(), a: "" });
    } else if ((m = line.match(A)) && last()?.t === "qa" && !para.length) {
      const qa = last() as Extract<Block, { t: "qa" }>;
      qa.a = qa.a ? `${qa.a} ${m[1].trim()}` : m[1].trim();
    } else if ((m = line.match(TABLE)) || (line.match(/\|/g) ?? []).length >= 2) {
      flush();
      const body = m ? m[1] : line;
      if (/^[\s|:-]+$/.test(body)) continue; // a markdown |---|---| rule
      const cells = body.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      out.push({ t: "row", cells, head: last()?.t !== "row" });
    } else if ((m = line.match(STEP)) && !bullet) {
      flush();
      out.push({ t: "step", text: m[1].trim() });
    } else if (bullet) {
      flush();
      const prev = last();
      const depth: 0 | 1 = indent >= 2 && prev?.t === "li" ? 1 : 0;
      out.push({ t: "li", depth, text: line });
    } else if (/^\(.*\)$/.test(line)) {
      continue; // an echoed instruction like "(one to four KEY lines)"
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

/** "[s12]", "[s4, s5]", "[slide 7]", "[s3–s4]" */
const CITE = /\s*\[\s*(?:s|slide\s*)\d+(?:\s*[,;–-]\s*(?:s|slide\s*)?\d+)*\s*\]/gi;

export type Piece = string | { slides: number[] };

/** Splits text into plain runs and slide citations. */
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(CITE)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push({ slides: (m[0].match(/\d+/g) ?? []).map(Number) });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export const stripCites = (text: string) => text.replace(CITE, "").trim();

/** The text a block shows, for collecting its citations. */
const textOf = (b: Block) =>
  b.t === "key" ? b.meaning : b.t === "qa" ? `${b.q} ${b.a}` : b.t === "fig" ? b.note : b.t === "row" ? b.cells.join(" ") : b.text;

/** Every slide cited in a section, in order of first mention. */
export function citedSlides(blocks: Block[]) {
  const seen: number[] = [];
  for (const b of blocks) {
    if (b.t === "h") continue;
    for (const p of pieces(textOf(b))) if (typeof p !== "string") for (const n of p.slides) if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}
