"use client";

/**
 * A paper page turn, done with the real page rather than a fade.
 *
 * The page you're leaving is copied into a "leaf" made of five hinged strips. The strip at the
 * spine swings 180° around the spiral while the outer strips bend a little behind it, so the
 * paper curls instead of flipping like a board. Each side is shaded as it turns away from the
 * light, the back shows faint mirror-image ink bleeding through, and the leaf casts a shadow on
 * the page underneath. Going back plays it the other way: the earlier page swings in from the
 * left and lands on top.
 */

const SEGMENTS = 5;
const MS = 950;

type TurnOptions = {
  page: HTMLElement; // the sheet being turned (has the paper background)
  layer: HTMLElement; // an empty child of `page` that React never renders into
  dir: "fwd" | "back";
  swap: () => void; // must commit the new content synchronously (flushSync)
};

let turnId = 0;

export function turnPage({ page, layer, dir, swap }: TurnOptions) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !page.isConnected) return swap();

  const id = String(++turnId);
  layer.replaceChildren(); // finish a turn that's still in flight
  layer.dataset.turn = id;
  layer.style.setProperty("--turn-ms", `${MS}ms`);

  const rect = page.getBoundingClientRect();
  const offset = Math.max(0, Math.round(-rect.top)); // how much of the old page was scrolled away
  const w = page.offsetWidth;
  const fullH = page.offsetHeight;
  // Tall enough that the leaf's bottom edge never shows on screen, even as it swings toward you.
  const h = Math.max(200, Math.min(fullH - offset, window.innerHeight + 160));
  page.style.minHeight = `${h}px`; // a short new page shouldn't leave the leaf hanging off the bottom

  const shadow = el("div", `turn-shadow turn-shadow-${dir}`);
  shadow.style.height = `${h}px`;

  if (dir === "fwd") {
    const leaf = buildLeaf(snapshot(page, layer, w, fullH), w, h, offset, dir);
    layer.append(shadow, leaf);
    swap();
  } else {
    // Keep the old page visible underneath while the earlier one swings back over it.
    const under = el("div", "turn-under");
    under.style.height = `${h}px`;
    const old = snapshot(page, layer, w, fullH);
    old.style.top = `${-offset}px`;
    under.append(old);
    layer.append(under);
    swap();
    const leaf = buildLeaf(snapshot(page, layer, w, page.offsetHeight), w, h, 0, dir);
    layer.append(shadow, leaf);
  }

  const done = () => {
    if (layer.dataset.turn !== id) return;
    layer.replaceChildren();
    delete layer.dataset.turn;
    page.style.minHeight = "";
  };
  window.setTimeout(done, MS + 80);
}

/** A copy of the page's paper and ink, laid out exactly like the original. */
function snapshot(page: HTMLElement, layer: HTMLElement, w: number, h: number) {
  const sheet = el("div", `${page.className} leaf-paper`);
  sheet.style.width = `${w}px`;
  sheet.style.height = `${h}px`;
  for (const child of Array.from(page.children)) {
    if (child === layer) continue;
    const copy = child.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    sheet.append(copy);
  }
  sheet.setAttribute("aria-hidden", "true");
  sheet.inert = true;
  return sheet;
}

function buildLeaf(sheet: HTMLElement, w: number, h: number, offset: number, dir: "fwd" | "back") {
  const leaf = el("div", `turn-leaf turn-leaf-${dir}`);
  leaf.style.width = `${w}px`;
  leaf.style.height = `${h}px`;
  leaf.style.setProperty("--leaf-w", `${w}px`);

  const segW = w / SEGMENTS;
  let parent: HTMLElement = leaf;
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = el("div", `seg ${i === 0 ? "seg-spine" : "seg-bend"}`);
    seg.style.width = `${segW}px`;
    // Each strip bends a little more than the one before; the whole curl adds up to ~45° at the edge.
    seg.style.setProperty("--k", String((6 * i) / (SEGMENTS * (SEGMENTS - 1))));
    // Where this strip sits on the sheet, so light and shadow run across all strips as one surface.
    seg.style.setProperty("--seg-x", `${-i * segW}px`);
    seg.style.setProperty("--seg-xb", `${-(w - (i + 1) * segW)}px`);

    const front = el("div", "face face-front");
    const ink = sheet.cloneNode(true) as HTMLElement;
    ink.style.left = `${-i * segW}px`;
    ink.style.top = `${-offset}px`;
    front.append(ink, el("div", "shade"));
    if (i === SEGMENTS - 1) front.append(el("div", "curl-light"));

    // The back of the sheet: blank ruled paper with the front's ink faintly mirrored through it.
    const back = el("div", "face face-back");
    const ghost = sheet.cloneNode(true) as HTMLElement;
    ghost.classList.add("leaf-ghost");
    ghost.querySelectorAll("img, svg").forEach((n) => n.remove()); // only ink bleeds through
    ghost.style.left = `${(i + 1) * segW}px`;
    ghost.style.top = `${-offset}px`;
    back.append(ghost, el("div", "shade"));

    seg.append(front, back);
    parent.append(seg);
    parent = seg;
  }
  return leaf;
}

function el(tag: string, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
