"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extract, judgeFigure, writeOverview, writeSection, type ExtractProgress } from "@/lib/ai";
import { frontMatter, planSections } from "@/lib/sections";
import * as store from "@/lib/store";
import type { Lecture, Settings, Subject } from "@/lib/types";

/** The courses the book starts with (an honours degree in IS, 2021/22). Names are written in by the student. */
const STARTER: [string, number][] = [
  ["IS6101", 353],
  ["IS7101", 1779],
  ["IS7102", 1778],
  ["IS7103", 1777],
  ["IS7104", 1776],
  ["IS7105", 1774],
  ["IS7106", 1773],
  ["IS7108", 1772],
  ["IS7112", 1768],
];
export const TAB_COLORS = ["#ffd866", "#9fdfc1", "#f7aab0", "#a9c6f7", "#d4c2f5", "#ffc79a", "#c9e59f", "#a6dde6", "#f3c1e3"];

/** What the notebook is doing to a chapter right now (memory only; the results are saved). */
export type Live = {
  step: "reading" | "looking" | "naming" | "writing";
  detail: string;
  i?: number;
  n?: number;
  sectionId?: string;
  draft?: string;
};

const id = () => Math.random().toString(36).slice(2, 10);

const subjectLabel = (s?: Subject) => (s ? `${s.code}${s.name ? ` ${s.name}` : ""}` : "");

export const kept = (f: Lecture["figures"][number]) => f.pinned ?? f.verdict?.keep ?? false;

export function useLibrary() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(store.DEFAULT_SETTINGS);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  // the latest copy of every chapter, updated the moment it's saved (state lags a render)
  const latest = useRef(new Map<string, Lecture>());
  const subjectsRef = useRef<Subject[]>([]);
  const files = useRef(new Map<string, File>()); // decks waiting to be read (not persisted)
  const queue = useRef<string[]>([]);
  const working = useRef(false);

  const save = useCallback(async (l: Lecture) => {
    latest.current.set(l.id, l);
    setLectures((all) => [...all.filter((x) => x.id !== l.id), l]);
    await store.putLecture(l);
  }, []);

  const patch = useCallback(
    async (lectureId: string, fn: (l: Lecture) => Lecture) => {
      const cur = latest.current.get(lectureId);
      if (cur) await save(fn(cur));
    },
    [save],
  );

  const setLiveFor = useCallback((lectureId: string, v: Live | null) => {
    setLive((all) => {
      const next = { ...all };
      if (v) next[lectureId] = v;
      else delete next[lectureId];
      return next;
    });
  }, []);

  /** Takes one chapter as far as it can go: read → look at figures → name → write. Resumable. */
  const advance = useCallback(
    async (lectureId: string) => {
      let l = latest.current.get(lectureId);
      if (!l || l.status === "done" || l.status === "error") return;
      const subject = subjectsRef.current.find((s) => s.id === l!.subjectId);

      // 1. read the deck on this laptop
      if (l.status === "reading") {
        const saved = files.current.get(lectureId) ?? (await store.getUpload(lectureId));
        const file = saved && (saved instanceof File ? saved : new File([saved], l.fileName));
        if (!file) {
          await patch(lectureId, (x) => ({ ...x, status: "error", error: "Reading was interrupted (the page was closed). Add the deck again." }));
          return;
        }
        const say = (p: ExtractProgress) =>
          setLiveFor(lectureId, {
            step: "reading",
            i: p.i,
            n: p.n,
            detail:
              p.stage === "upload"
                ? "handing the deck to the reader"
                : p.stage === "convert"
                  ? "LibreOffice is printing the slides"
                  : p.stage === "read"
                    ? `reading slide ${p.i} of ${p.n}`
                    : `cutting out figures, slide ${p.i} of ${p.n}`,
          });
        try {
          const x = await extract(file, say);
          await store.putImages([
            ...x.slides.map((s) => [`${lectureId}:slide:${s.n}`, s.thumb] as [string, string]),
            ...x.figures.map((f) => [`${lectureId}:fig:${f.id}`, f.src] as [string, string]),
          ]);
          files.current.delete(lectureId);
          await store.deleteUpload(lectureId);
          await patch(lectureId, (cur) => ({
            ...cur,
            title: x.title || cur.title,
            kind: x.source.kind,
            pages: x.source.pages,
            aspect: x.source.width / x.source.height,
            slides: x.slides.map(({ thumb, ...s }) => (void thumb, s)),
            figures: x.figures.map(({ src, ...f }) => (void src, f)),
            status: "looking",
          }));
        } catch (err) {
          await patch(lectureId, (cur) => ({ ...cur, status: "error", error: err instanceof Error ? err.message : String(err) }));
          setLiveFor(lectureId, null);
          return;
        }
        l = latest.current.get(lectureId)!;
      }

      // 2. Gemma looks at every figure: keep or set aside, caption, and read pictures of text
      if (l.status === "looking") {
        const todo = l.figures.filter((f) => !f.verdict);
        const total = l.figures.length;
        for (const f of todo) {
          const done = total - latest.current.get(lectureId)!.figures.filter((x) => !x.verdict).length;
          setLiveFor(lectureId, { step: "looking", i: done + 1, n: total, detail: `Gemma is looking at figure ${done + 1} of ${total}` });
          const src = await store.getImage(`${lectureId}:fig:${f.id}`);
          const slide = l.slides.find((s) => s.n === f.slide);
          const v = src
            ? await judgeFigure({ src, slideTitle: slide?.title ?? "", slideText: slide?.text ?? "", labels: f.labels })
            : { kind: "missing", keep: false, caption: "", explain: "", by: "nobody" };
          const { transcript, ...verdict } = v as typeof v & { transcript?: string };
          await patch(lectureId, (cur) => ({
            ...cur,
            figures: cur.figures.map((x) => (x.id === f.id ? { ...x, verdict } : x)),
            slides: transcript
              ? cur.slides.map((s) => (s.n === f.slide ? { ...s, transcript: [s.transcript, transcript].filter(Boolean).join("\n") } : s))
              : cur.slides,
          }));
        }

        // 3. name the chapter, from the cover and outline slides
        l = latest.current.get(lectureId)!;
        if (!l.overview) {
          setLiveFor(lectureId, { step: "naming", detail: "Gemma is naming the chapter" });
          const front = frontMatter(l.slides)
            .map((s) => [s.title, s.text, s.transcript].filter(Boolean).join("\n"))
            .join("\n\n");
          const titles = [...new Set(l.slides.filter((s) => !s.skip && s.title).map((s) => s.title))];
          const overview = await writeOverview({ fileName: l.fileName, subject: subjectLabel(subject), deckTitle: l.title, front, titles });
          await patch(lectureId, (cur) => ({ ...cur, overview }));
        }
        await patch(lectureId, (cur) => ({
          ...cur,
          status: "writing",
          sections: cur.sections.length ? cur.sections : planSections(cur.slides, new Set(cur.figures.filter(kept).map((f) => f.id))),
        }));
        l = latest.current.get(lectureId)!;
      }

      // 4. write the notes, one section at a time, streaming onto the page
      if (l.status === "writing") {
        const total = l.sections.length;
        for (let i = 0; i < total; i++) {
          const cur = latest.current.get(lectureId)!;
          const sec = cur.sections[i];
          if (sec.text) continue;
          const slides = cur.slides.filter((s) => sec.slides.includes(s.n));
          const figures = cur.figures
            .filter((f) => sec.slides.includes(f.slide) && kept(f))
            .map((f) => ({ id: f.id, slide: f.slide, caption: f.verdict?.caption ?? "", explain: f.verdict?.explain ?? "" }));
          let draft = "";
          const show = () =>
            setLiveFor(lectureId, { step: "writing", i: i + 1, n: total, sectionId: sec.id, draft, detail: `Gemma is writing section ${i + 1} of ${total}: ${sec.title}` });
          show();
          const { text, by } = await writeSection(
            {
              subject: subjectLabel(subject),
              lecture: cur.overview?.title || cur.title,
              title: sec.title,
              index: i + 1,
              total,
              slides: slides.map((s) => ({ n: s.n, title: s.title, text: s.text, notes: s.notes, transcript: s.transcript })),
              figures,
            },
            (t) => {
              draft += t;
              show();
            },
          );
          await patch(lectureId, (x) => ({ ...x, sections: x.sections.map((s) => (s.id === sec.id ? { ...s, text, by, at: Date.now() } : s)) }));
        }
        await patch(lectureId, (x) => ({ ...x, status: "done" }));
      }
      setLiveFor(lectureId, null);
    },
    [patch, setLiveFor],
  );

  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      while (queue.current.length) {
        const next = queue.current.shift()!;
        try {
          await advance(next);
        } catch (err) {
          console.error("chapter failed", err);
          await patch(next, (x) => ({ ...x, status: "error", error: err instanceof Error ? err.message : String(err) }));
          setLiveFor(next, null);
        }
      }
    } finally {
      working.current = false;
    }
  }, [advance, patch, setLiveFor]);

  const enqueue = useCallback(
    (lectureId: string) => {
      if (!queue.current.includes(lectureId)) queue.current.push(lectureId);
      pump();
    },
    [pump],
  );

  useEffect(() => {
    (async () => {
      const [s, subs, lecs] = await Promise.all([store.loadSettings(), store.allSubjects(), store.allLectures()]);
      let all = subs;
      if (!all.length) {
        all = STARTER.map(([code, lms], i) => ({ id: code, code, name: "", year: "2021/22", color: TAB_COLORS[i % TAB_COLORS.length], link: `https://lms.sab.ac.lk/course/view.php?id=${lms}` }));
        for (const x of all) await store.putSubject(x);
      }
      subjectsRef.current = all;
      setSettings(s);
      setSubjects(all);
      for (const l of lecs) latest.current.set(l.id, l);
      setLectures(lecs);
      setReady(true);
      // pick up anything that was still being written when the page closed
      for (const l of lecs.sort((a, b) => a.addedAt - b.addedAt)) if (l.status !== "done" && l.status !== "error") enqueue(l.id);
    })().catch((err) => {
      console.error("the book failed to open", err);
      setReady(true);
    });
  }, [enqueue]);

  // the Mac app asks this before quitting, to warn that a chapter is still being written
  useEffect(() => {
    (window as Window & { studyinkBusy?: number }).studyinkBusy = Object.keys(live).length;
  }, [live]);

  const saveSettings = useCallback(
    async (p: Partial<Settings>) => {
      const next = { ...settings, ...p };
      setSettings(next);
      await store.setKV("settings", next);
    },
    [settings],
  );

  const saveSubject = useCallback(async (s: Subject) => {
    subjectsRef.current = [...subjectsRef.current.filter((x) => x.id !== s.id), s];
    setSubjects((all) => (all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s]));
    await store.putSubject(s);
  }, []);

  const addLecture = useCallback(
    async (file: File, subjectId: string) => {
      const lid = id();
      files.current.set(lid, file);
      await store.putUpload(lid, file);
      await save({
        id: lid,
        subjectId,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " "),
        fileName: file.name,
        kind: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "pptx",
        addedAt: Date.now(),
        pages: 0,
        aspect: 16 / 9,
        slides: [],
        figures: [],
        sections: [],
        status: "reading",
      });
      enqueue(lid);
      return lid;
    },
    [save, enqueue],
  );

  /** The student's call on a figure beats Gemma's. */
  const pinFigure = useCallback(
    (lectureId: string, figId: string, keep: boolean) => patch(lectureId, (l) => ({ ...l, figures: l.figures.map((f) => (f.id === figId ? { ...f, pinned: keep } : f)) })),
    [patch],
  );

  /** Throws the notes away and has Gemma write the chapter again (figures keep their verdicts). */
  const rewrite = useCallback(
    async (lectureId: string) => {
      await patch(lectureId, (l) => ({
        ...l,
        status: "writing",
        error: undefined,
        sections: planSections(l.slides, new Set(l.figures.filter(kept).map((f) => f.id))),
      }));
      enqueue(lectureId);
    },
    [patch, enqueue],
  );

  const removeLecture = useCallback(async (lectureId: string) => {
    queue.current = queue.current.filter((x) => x !== lectureId);
    latest.current.delete(lectureId);
    setLectures((all) => all.filter((x) => x.id !== lectureId));
    await store.deleteLecture(lectureId);
  }, []);

  const reload = useCallback(async () => {
    const [subs, lecs, s] = await Promise.all([store.allSubjects(), store.allLectures(), store.loadSettings()]);
    subjectsRef.current = subs;
    for (const l of lecs) latest.current.set(l.id, l);
    setSubjects(subs);
    setLectures(lecs);
    setSettings(s);
  }, []);

  return { ready, settings, subjects, lectures, live, saveSettings, saveSubject, addLecture, pinFigure, rewrite, removeLecture, reload };
}

export type Library = ReturnType<typeof useLibrary>;

/** A subject's chapters in the order they were added. */
export const chaptersOf = (lib: Library, subjectId: string) => lib.lectures.filter((l) => l.subjectId === subjectId).sort((a, b) => a.addedAt - b.addedAt);
