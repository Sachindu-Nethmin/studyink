import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * POST /api/extract (multipart: file)
 *
 * Reads a lecture deck on this machine: extractor/slides.py (LibreOffice for .pptx, then PyMuPDF)
 * pulls out each slide's text, a small picture of every slide, and the figures. Streams NDJSON:
 * {type:"progress", stage, i, n} lines while it works, then one {type:"result", data} line.
 * The upload is written to a temp folder and deleted as soon as the reader is done.
 */
export const runtime = "nodejs";
export const maxDuration = 900;

const PYTHON = process.env.PYTHON ?? "python3";
const SCRIPT = path.join(process.cwd(), "extractor", "slides.py");
const MAX_BYTES = 100 * 1024 * 1024;
const KINDS = new Set([".pdf", ".pptx"]);

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file came with the request." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!KINDS.has(ext)) return Response.json({ error: "StudyInk reads .pptx and .pdf decks. Save other formats as one of those first." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That deck is over 100 MB. Export it as PDF to shrink it." }, { status: 413 });

  const dir = await mkdtemp(path.join(tmpdir(), "studyink-up-"));
  const input = path.join(dir, `deck${ext}`); // never trust the uploaded name as a path
  await writeFile(input, Buffer.from(await file.arrayBuffer()));

  const encoder = new TextEncoder();
  let child: ReturnType<typeof spawn> | null = null;
  let open = true; // false once finished, or once the browser hangs up

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (o: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        } catch {
          open = false;
        }
      };
      const finish = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {}
        rm(dir, { recursive: true, force: true }).catch(() => {});
      };

      const proc = spawn(PYTHON, [SCRIPT, input, "--name", file.name], { stdio: ["ignore", "pipe", "pipe"] });
      child = proc;
      const out: Buffer[] = [];
      let errTail = "";
      let errBuf = "";
      proc.stdout!.on("data", (b: Buffer) => out.push(b));
      proc.stderr!.on("data", (b: Buffer) => {
        errBuf += b.toString();
        const lines = errBuf.split("\n");
        errBuf = lines.pop() ?? "";
        for (const line of lines) {
          const m = line.match(/^PROGRESS (\w+) (\d+) (\d+)/);
          if (m) send({ type: "progress", stage: m[1], i: Number(m[2]), n: Number(m[3]) });
          else errTail = (errTail + line + "\n").slice(-2000);
        }
      });
      proc.on("error", (e) => {
        send({ type: "error", error: `Couldn't start the slide reader (${PYTHON}): ${e.message}. Set PYTHON in .env.local.` });
        finish();
      });
      proc.on("close", () => {
        const raw = Buffer.concat(out).toString("utf8");
        try {
          const data = JSON.parse(raw);
          if (data.error) send({ type: "error", error: data.error });
          else send({ type: "result", data });
        } catch {
          console.error("[extract]", errTail);
          send({ type: "error", error: `The slide reader stopped: ${errTail.trim().split("\n").pop() || "no output"}` });
        }
        finish();
      });
    },
    cancel() {
      open = false;
      child?.kill();
      rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  });

  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
