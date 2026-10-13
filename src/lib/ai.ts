"use client";

/**
 * The notebook's door to its server: reading a deck (/api/extract) and the open model (/api/ai).
 * Every model call has a deterministic fallback, so a missing model never leaves a blank page.
 */
import {
  fallbackOverview,
  fallbackSection,
  fallbackVerdict,
  type FigureInput,
  type OverviewInput,
  type SectionInput,
} from "./prompts";
import type { Extracted, Overview, Verdict } from "./types";

export type ExtractProgress = { stage: "upload" | "convert" | "read" | "figures"; i: number; n: number };

/** Sends the deck to this laptop's own server, which reads it with LibreOffice + PyMuPDF. */
export async function extract(file: File, onProgress: (p: ExtractProgress) => void): Promise<Extracted> {
  const form = new FormData();
  form.append("file", file);
  onProgress({ stage: "upload", i: 0, n: 1 });
  const res = await fetch("/api/extract", { method: "POST", body: form });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `couldn't read the deck (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") onProgress(msg);
      else if (msg.type === "error") throw new Error(msg.error);
      else if (msg.type === "result") return msg.data as Extracted;
    }
    if (done) break;
  }
  throw new Error("the reader stopped before it finished");
}

export async function judgeFigure(input: FigureInput): Promise<Verdict & { transcript?: string }> {
  try {
    const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task: "figure", input }) });
    if (res.ok) return (await res.json()).result;
  } catch (err) {
    console.warn("figure fell back:", err);
  }
  return fallbackVerdict(input);
}

export async function writeOverview(input: OverviewInput): Promise<Overview> {
  try {
    const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task: "overview", input }) });
    if (res.ok) return (await res.json()).result;
  } catch (err) {
    console.warn("overview fell back:", err);
  }
  return fallbackOverview(input);
}

/** Streams one section of notes. With no model, the slides' own words in the same format. */
export async function writeSection(input: SectionInput, onToken: (t: string) => void, signal?: AbortSignal) {
  try {
    const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task: "section", input }), signal });
    if (!res.ok || !res.body) throw new Error(`ai ${res.status}`);
    const by = decodeURIComponent(res.headers.get("x-model") ?? "open%20model");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const t = decoder.decode(value, { stream: true });
      text += t;
      onToken(t);
    }
    if (!text.trim()) throw new Error("empty answer");
    return { text, by };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("section fell back:", err);
    const text = fallbackSection(input);
    onToken(text);
    return { text, by: "the slides' own words" };
  }
}

export type Health = { provider: string; model: string; modelReady: boolean; vision: boolean; python: boolean; libreoffice: boolean; problem?: string };

export async function health(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
