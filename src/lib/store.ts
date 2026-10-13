"use client";

/**
 * The study book lives in this browser's IndexedDB, and only there: subjects, chapters, and the
 * figures and slide pictures cut from your decks. No account, no sync, no upload. "Download my
 * study book" hands you the whole thing as one file you own.
 */
import type { Lecture, Settings, Subject } from "./types";

const DB = "studyink";
const VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("subjects")) d.createObjectStore("subjects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("lectures")) d.createObjectStore("lectures", { keyPath: "id" });
      if (!d.objectStoreNames.contains("images")) d.createObjectStore("images");
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const allSubjects = () => run<Subject[]>("subjects", "readonly", (s) => s.getAll());
export const putSubject = (x: Subject) => run("subjects", "readwrite", (s) => s.put(x));

export const allLectures = () => run<Lecture[]>("lectures", "readonly", (s) => s.getAll());
export const putLecture = (x: Lecture) => run("lectures", "readwrite", (s) => s.put(x));

export const getImage = (key: string) => run<string | undefined>("images", "readonly", (s) => s.get(key));

/** A deck waiting to be read is kept here too, so closing the tab mid-read doesn't lose it. */
export const putUpload = (lectureId: string, file: Blob) => run("images", "readwrite", (s) => s.put(file, `${lectureId}:upload`));
export const getUpload = (lectureId: string) => run<Blob | undefined>("images", "readonly", (s) => s.get(`${lectureId}:upload`));
export const deleteUpload = (lectureId: string) => run("images", "readwrite", (s) => s.delete(`${lectureId}:upload`));

/** Saves many images in one transaction (a deck can have 60 slide pictures). */
export async function putImages(entries: [string, string][]) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction("images", "readwrite");
    const s = tx.objectStore("images");
    for (const [k, v] of entries) s.put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** All images whose key starts with `prefix` (e.g. every figure of one chapter). */
export async function imagesWithPrefix(prefix: string): Promise<Record<string, string>> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out: Record<string, string> = {};
    const range = IDBKeyRange.bound(prefix, prefix + "￿");
    const req = d.transaction("images", "readonly").objectStore("images").openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out[String(c.key)] = c.value;
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLecture(id: string) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(["lectures", "images"], "readwrite");
    tx.objectStore("lectures").delete(id);
    tx.objectStore("images").delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const getKV = <T>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key));
export const setKV = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key));

export const DEFAULT_SETTINGS: Settings = { name: "" };

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getKV<Settings>("settings")) ?? {}) };
}

export async function exportBook() {
  const [subjects, lectures, settings, all] = await Promise.all([allSubjects(), allLectures(), loadSettings(), imagesWithPrefix("")]);
  const images = Object.fromEntries(Object.entries(all).filter(([, v]) => typeof v === "string"));
  return { app: "studyink", version: 1, exportedAt: new Date().toISOString(), settings, subjects, lectures, images };
}

export async function importBook(data: { subjects?: Subject[]; lectures?: Lecture[]; settings?: Settings; images?: Record<string, string> }) {
  for (const s of data.subjects ?? []) await putSubject(s);
  for (const l of data.lectures ?? []) await putLecture(l);
  if (data.images) await putImages(Object.entries(data.images));
  if (data.settings) await setKV("settings", data.settings);
}
