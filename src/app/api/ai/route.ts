import { complete, modelLabel, stream } from "@/lib/llm";
import {
  figurePrompt,
  overviewPrompt,
  parseOverview,
  parseVerdict,
  sectionPrompt,
  type FigureInput,
  type OverviewInput,
  type SectionInput,
} from "@/lib/prompts";

/**
 * POST /api/ai { task, input }
 *
 * The server keeps nothing: no database, no logs of your slides. It builds the prompt, hands it to
 * the open model (on this same machine by default) and passes the answer straight back to the
 * notebook, which stores it in your browser.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const { task, input } = (await req.json()) as { task: string; input: unknown };

  try {
    switch (task) {
      case "figure": {
        const f = input as FigureInput;
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(f.src ?? "")) return Response.json({ error: "not an image" }, { status: 400 });
        const text = await complete(figurePrompt(f), { json: true, maxTokens: 800, temperature: 0.2 });
        const result = parseVerdict(text, modelLabel);
        if (!result) throw new Error(`unparseable verdict: ${text.slice(0, 200)}`);
        return Response.json({ result });
      }
      case "overview": {
        const o = input as OverviewInput;
        const text = await complete(overviewPrompt(o), { json: true, maxTokens: 400, temperature: 0.3 });
        const result = parseOverview(text, modelLabel);
        if (!result) throw new Error(`unparseable overview: ${text.slice(0, 200)}`);
        return Response.json({ result });
      }
      case "section": {
        const s = input as SectionInput;
        const body = await stream(sectionPrompt(s), { maxTokens: 1000, temperature: 0.5 });
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "x-model": encodeURIComponent(modelLabel), "cache-control": "no-store" },
        });
      }
      default:
        return Response.json({ error: `unknown task ${task}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[ai:${task}]`, err);
    return Response.json({ error: "The model didn't answer. Is Ollama running?" }, { status: 503 });
  }
}
