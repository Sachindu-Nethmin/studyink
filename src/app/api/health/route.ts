import { execFile } from "node:child_process";
import path from "node:path";
import { modelLabel, ping, provider } from "@/lib/llm";

const PYTHON = process.env.PYTHON ?? "python3";
const SCRIPT = path.join(process.cwd(), "extractor", "slides.py");

type Check = { pymupdf: boolean; pptx: boolean; libreoffice: boolean; problem?: string | null };

function checkReader(): Promise<Check> {
  return new Promise((resolve) => {
    execFile(PYTHON, [SCRIPT, "--check"], { timeout: 15_000 }, (err, stdout) => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ pymupdf: false, pptx: false, libreoffice: false, problem: err ? `${PYTHON}: ${err.message}` : "the slide reader didn't answer" });
      }
    });
  });
}

export async function GET() {
  const [model, reader] = await Promise.all([ping(), checkReader()]);
  return Response.json({
    ok: true,
    provider,
    model: modelLabel,
    modelReady: model.ready,
    vision: model.vision,
    python: reader.pymupdf,
    libreoffice: reader.libreoffice,
    problem: reader.problem ?? undefined,
  });
}
