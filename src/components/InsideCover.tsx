"use client";

import { useEffect, useState } from "react";
import { health, type Health } from "@/lib/ai";
import * as store from "@/lib/store";
import { Check, Cross, Scribble } from "./doodles";
import type { Go } from "./Notebook";
import { TAB_COLORS, type Library } from "./useLibrary";

export function InsideCover({ lib, go }: { lib: Library; go: Go }) {
  const [h, setH] = useState<Health | null | undefined>(undefined);
  const [name, setName] = useState(lib.settings.name);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    health().then(setH);
  }, []);

  const addSubject = async () => {
    const c = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!c) return;
    if (lib.subjects.some((s) => s.id === c)) return setMsg(`${c} is already in the book.`);
    await lib.saveSubject({ id: c, code: c, name: "", year: "", color: TAB_COLORS[lib.subjects.length % TAB_COLORS.length] });
    setCode("");
    go({ page: "subject", id: c });
  };

  const download = async () => {
    const data = await store.exportBook();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studyink-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "studyink") throw new Error("not a StudyInk file");
      await store.importBook(data);
      await lib.reload();
      setMsg(`Imported ${data.lectures?.length ?? 0} chapters.`);
    } catch (e) {
      setMsg(`Couldn't import: ${e instanceof Error ? e.message : e}`);
    }
  };

  const ok = (yes: boolean | undefined, good: string, bad: string) => (
    <span className={yes ? "ok" : "error"}>
      {yes ? <Check size={18} /> : <Cross size={14} />} {yes ? good : bad}
    </span>
  );

  return (
    <section className="inside">
      <header className="page-head">
        <h2>
          Inside cover
          <Scribble className="scribble" />
        </h2>
      </header>

      <label className="field">
        <span className="hand-label">This book belongs to</span>
        <input className="line-input big" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => lib.saveSettings({ name: name.trim() })} maxLength={40} placeholder="your name" />
      </label>

      <h3 className="section-title">Who does the work</h3>
      {h === undefined ? (
        <p className="pencil">checking…</p>
      ) : h === null ? (
        <p className="pencil error">The notebook&apos;s own server isn&apos;t answering.</p>
      ) : (
        <table className="ledger">
          <tbody>
            <tr>
              <td>Writing the notes</td>
              <td>
                {ok(h.modelReady, h.model, `${h.model} isn't there. Start Ollama and run: ollama pull ${h.model.split(" ")[0]}`)}
              </td>
            </tr>
            <tr>
              <td>Looking at figures</td>
              <td>{ok(h.vision, "the same model, with vision", "this model can't see images, so figures are kept by rule and captioned from the slide title")}</td>
            </tr>
            <tr>
              <td>Reading PDF decks</td>
              <td>{ok(h.python, "PyMuPDF, on this laptop", h.problem ?? "Python with PyMuPDF wasn't found")}</td>
            </tr>
            <tr>
              <td>Reading .pptx decks</td>
              <td>{ok(h.libreoffice, "LibreOffice prints them to PDF first, headless", "LibreOffice isn't installed (brew install --cask libreoffice); export decks as PDF meanwhile")}</td>
            </tr>
          </tbody>
        </table>
      )}

      <h3 className="section-title">Where your slides go</h3>
      <table className="ledger">
        <tbody>
          <tr>
            <td>The deck you drop in</td>
            <td>to this laptop&apos;s own server, into a temp folder that&apos;s deleted as soon as it&apos;s read</td>
          </tr>
          <tr>
            <td>Slide text and figures</td>
            <td>to Gemma, running in Ollama on this laptop. No cloud API, no account, no per-page fee</td>
          </tr>
          <tr>
            <td>The finished book</td>
            <td>this browser&apos;s IndexedDB, and nowhere else. Download it below to keep a copy</td>
          </tr>
        </tbody>
      </table>
      <p className="source-note">
        Lecture slides belong to your lecturer and your university. StudyInk never uploads them anywhere, so making study notes from them stays between you and your laptop.
      </p>

      <h3 className="section-title">Add a subject</h3>
      <div className="where-row">
        <input className="line-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="course code, e.g. IS7110" maxLength={14} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
        <button className="ink-btn" onClick={addSubject}>
          add tab
        </button>
      </div>

      <h3 className="section-title">Keep a copy</h3>
      <div className="actions">
        <button className="ink-btn" onClick={download}>
          download my study book
        </button>
        <label className="ink-btn ink-blue">
          bring one back
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {msg && <p className="pencil">{msg}</p>}
    </section>
  );
}
