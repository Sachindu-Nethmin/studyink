# StudyInk

**Lecture slides in, a study book out.**

Drop in a lecture deck (`.pptx` or `.pdf`). StudyInk cuts the figures out of the slides, an open-weight model (Gemma 4, running in Ollama on your own laptop) looks at every figure and writes the lecture up as pages of a study book. Every point has a footnote that points back to the slide it came from.

It looks and behaves like a spiral notebook: an index tab along the top for each subject, chapters that turn like pages, and notes built to be scanned rather than read. Each section has a highlighted gist, short pen-arrow points, numbered step flows, comparison tables, figures taped in with a caption, key terms on an index card, a sticky note to remember, and self-check questions whose answers stay folded until you've tried.

## What it does with a deck

1. **Reads the slides on your laptop.** A `.pptx` is printed to PDF by LibreOffice (headless), then PyMuPDF reads every slide's text, speaker notes and a small picture of the slide.
2. **Cuts out the figures** the way PaperLamp finds figures in papers, adapted for slides, which have no "Figure 3:" captions to go by. It keeps pictures placed on the slide but drops the deck's template (anything repeated on many slides: logos, backgrounds, header bands), edge-to-edge decorative strips and tiny icons. It also keeps clusters of vector shapes that look like a diagram (boxes joined by connectors, table rules, free curves) rather than a grid of text cards. Each region is rendered from the page, so crops and recolouring look exactly as they do on screen.
3. **Gemma looks at every crop** (vision). It keeps diagrams, flowcharts, tables, charts, photos and screenshots. It sets aside layouts, logos and decoration. Each figure it keeps gets a caption and a one-line "how to read it". If a crop turns out to be a *picture of text* (a pasted screenshot of a bullet list), Gemma reads the words off it so they still reach the notes.
4. **Gemma names the chapter** from the cover and outline slides: a title, "in a nutshell", and what you'll be able to do afterwards.
5. **Gemma writes the notes**, a few slides at a time, streaming onto the page as you watch. They're revision notes, not an essay:
   - **the gist**: the section's one big idea, highlighted
   - **points**: short ones, with sub-points for details and examples
   - **step flows**: when the slides describe a process, numbered boxes joined by arrows
   - **tables**: when the slides compare things (basic vs applied research, journal vs conference)
   - **the figures**, each with what to notice in it
   - **key terms**, one thing to **remember**, and a couple of **check yourself** questions

   Every point is tagged with its slide (`[s12]`), and the book turns that into a numbered footnote. Click one to see the slide itself.

You can overrule Gemma: take a figure out, or put back one it set aside. "Have Gemma write it again" redoes a chapter. Close the tab halfway and it picks up where it stopped.

## Why it's built on open pieces

Lecture slides belong to the lecturer and the university, and a lot of LMS terms say not to upload them to third-party services. So nothing leaves the laptop:

| What | Where it goes |
| --- | --- |
| The deck you drop in | This laptop's own server, into a temp folder that's deleted as soon as it's read |
| Slide text and figure crops | Gemma in Ollama on this laptop. No cloud API, no account, no per-page fee |
| The finished study book | This browser's IndexedDB, nowhere else. *Download my study book* gives you one JSON file |

It also makes the economics work. A 59-slide deck is about 60 model calls: around 15 figure looks, a title, and 12–15 sections. On a closed API, that's a bill for every lecture, every semester, for every student. Here it costs electricity: about five minutes on an M-series laptop with a 4-bit Gemma 4 E4B.

Every piece is swappable: any Ollama model with vision, or any OpenAI-compatible server running an open model. With no model at all, the book still fills in. Figures are kept by rule and captioned with the slide title, and each section shows the slides' own words with the same footnotes.

## Run it

```bash
ollama pull gemma4:e4b                      # writes the notes and looks at figures
pip3 install pymupdf pillow python-pptx     # the slide reader
brew install --cask libreoffice             # only for .pptx (PDF decks work without it)
npm install
cp .env.example .env.local                  # set PYTHON if python3 isn't the one with PyMuPDF
npm run dev
```

Open http://localhost:3000, write your name on the cover and open the book. Then use **Add a lecture**: pick the subject and drop in a deck.

The book starts with index tabs for the MSc courses it was built for (IS6101, IS7101–IS7112). You write each subject's name on its divider page, and you can add more tabs on the inside cover.

## What's inside

```
extractor/slides.py          PPTX/PDF → slide text, notes, thumbnails and cropped figures (LibreOffice + PyMuPDF)
src/lib/prompts.ts           every prompt (figure, overview, section), its parser and its no-model fallback
src/lib/sections.ts          how a deck is cut into sections a small model can write well
src/lib/notes.ts             reads Gemma's notes (GIST / points / STEP / TABLE / KEY / FIG / TIP / Q-A lines that
                             stream well) into blocks and footnotes
src/lib/llm.ts               server side: Ollama or OpenAI-compatible, JSON, streaming, images
src/lib/store.ts             IndexedDB: subjects, chapters, figure and slide images, export/import
src/components/useLibrary.ts the job runner: read → look → name → write, resumable
src/components/Chapter.tsx   a chapter: opener, sections, figure plates, key terms, footnotes, slide peek
src/components/PagedSheet.tsx, pageTurn.ts   screen-sized pages and the paper page turn (from Footnotes)
src/app/api/                 extract (streams progress), ai, health; all stateless
```

## Credits

- Models: [Gemma](https://ai.google.dev/gemma) via [Ollama](https://ollama.com).
- Reading slides: [PyMuPDF](https://pymupdf.readthedocs.io) (AGPL-3.0, called as a separate process), [python-pptx](https://python-pptx.readthedocs.io), [Pillow](https://python-pillow.org), [LibreOffice](https://www.libreoffice.org).
- The notebook UI comes from [Footnotes](https://github.com/Sachindu-Nethmin/footnotes); the figure finding is adapted from PaperLamp.
- Fonts (self-hosted): Caveat and Patrick Hand (SIL OFL 1.1), Special Elite (Apache 2.0).

MIT licensed.
