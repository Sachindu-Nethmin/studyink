---
title: "StudyInk: my lecture slides, rewritten as a study book by Gemma on my laptop"
published: false
tags: devchallenge, hf26challenge, gemma, opensource
cover_image: https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/cover.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)*

## What I Built

I'm doing my honours degree, and every week brings another deck of fifty slides. Slides are made for being *presented*, not for revising from: half the meaning is in what the lecturer said, the diagrams are scattered across the deck, and the night before an exam nobody wants to click through 300 of them.

So I built **StudyInk**. You drop in a lecture deck (`.pptx` or `.pdf`) and it becomes a chapter of a study book: a spiral notebook with an index tab for each subject, pages that turn, and notes written to be *scanned*, not read.

![The StudyInk study book, closed](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/01-cover.jpg)

**Who would pay for it?** Students like me, around exam time. A cloud AI tool would charge per page or per month, which is exactly when students can't afford one. StudyInk runs on the laptop the student already owns, so it costs nothing per lecture. That makes a one-off price per semester (or a campus licence) viable, where an API bill wouldn't be. Tutors and lecturers are the other customers: a lecturer could hand out a study book for their own course, made from their own slides, without uploading them anywhere.

### What happens to a deck

**1. It's read on the laptop.** A `.pptx` is printed to PDF by LibreOffice (headless), then PyMuPDF reads every slide's text, speaker notes and a small picture of the slide.

**2. The figures are cut out.** Slides have no "Figure 3:" captions to anchor on, so StudyInk finds figures by what they're made of: pictures placed on a slide (minus anything repeated on every slide, like the faculty logo and the background), and clusters of vector shapes that look like a diagram rather than a grid of text boxes.

![Adding a lecture: the deck is read, the figures cut out, and Gemma looks at each one](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/02-add.jpg)

**3. Gemma looks at every figure.** This is the vision half of Gemma 4. For each crop it decides: diagram, flowchart, table, chart or screenshot (keep it, and caption it), or layout, logo or decoration (set it aside). If a "figure" turns out to be a *picture of text* (one of my lecturer's slides had its bullet list pasted in as a screenshot, with zero extractable words), Gemma reads the words off it so they still reach the notes.

**4. Gemma names the chapter and writes it,** a few slides at a time, streaming onto the page while you watch:

![A chapter opener: the title, in a nutshell, and what you'll be able to do](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/03-chapter.jpg)

Every section is built to be skimmed: **the gist** highlighted, **short points** with the details underneath, **step flows** (numbered boxes joined by arrows) when the slides describe a process, and **comparison tables** when they contrast things. Then key terms on an index card, one thing to remember on a sticky note, and "check yourself" questions with the answers folded away until you've tried.

![Visual notes: the gist, short points and a step flow](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/04-points.jpg)

| A figure taped in, with what to notice | A comparison becomes a table |
|---|---|
| ![A figure Gemma kept and captioned](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/05-figure.jpg) | ![A comparison table Gemma wrote from the slides](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/06-table.jpg) |

**5. Every point has a footnote.** Gemma tags each point with the slide it came from (`[s12]`), and the book turns that into a numbered footnote. Click one and the actual slide opens, so you can always check the model's work against the source.

![A footnote opens the slide it came from](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/07-footnote.jpg)

## Demo

▶ **Watch the demo:**

{% youtube 2TxgfABTZ6g %}

| Contents: a tab for every subject | On a phone |
|---|---|
| ![The contents page with chapters per subject](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/08-contents.jpg) | ![A page of notes on a phone](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/10-phone.jpg) |

It also installs as a **Mac app**: a native window around the notebook, with Node bundled inside, so a student never sees a terminal. It starts Ollama if it isn't running, and when you quit it asks Ollama to unload the model, so the memory comes back.

![StudyInk as a Mac app](https://raw.githubusercontent.com/Sachindu-Nethmin/studyink/main/docs/images/11-mac-app.jpg)

## Code

{% github Sachindu-Nethmin/studyink %}

```bash
ollama pull gemma4:e4b
pip3 install pymupdf pillow python-pptx
npm install && npm run dev
```

Or `packaging/build_app.sh` builds `StudyInk.app` and a `.dmg`.

## How I Built It

**The model is Gemma 4 E4B, running on my laptop through Ollama, and it does two jobs: it *sees* and it *writes*.** The same model judges every figure crop (vision) and writes the notes, so there's one download and one thing to keep in memory. Next.js serves the notebook, and its API routes are thin, stateless pass-throughs: one streams the slide reader's progress, one talks to `localhost:11434`. The study book lives in the browser's IndexedDB, and the uploaded deck is deleted from the temp folder as soon as it's read.

The slide reader is a Python script (PyMuPDF, python-pptx, and LibreOffice for `.pptx`). Its figure finder is adapted from PaperLamp, an earlier project of mine that turns research papers into explainer videos. Papers have captions to anchor on. Slides don't, which is where most of the work went.

A few things I learned getting a 4B model to do this well:

- **Card layouts look like tables.** My first figure finder counted horizontal lines to spot tables, and decided that a slide of rounded text cards was a table, because a rounded card's top and bottom edges are lines. It now counts only stroked rules and hairline bars, and treats shapes as a diagram only when an open line actually runs from one shape to a *different* one (a connector), not across a single card (a divider). The rest it leaves to Gemma's eyes.
- **Let the vision model be the second filter, not the first.** The finder errs on the side of finding too much, and Gemma throws out what isn't a figure. Asked "is this a diagram, a table, a layout or decoration?", it reliably kept the flowcharts, tables and an infinity-loop diagram, and set aside the text cards and the "Thank you" slide's social-media links.
- **The table that ate the token budget.** On one big table, Gemma decided to transcribe every cell into a field I hadn't asked it to fill, ran out of tokens mid-JSON, and the figure fell back to a generic caption. The prompt now says to leave that field empty for anything that isn't a picture of text, and the parser salvages whatever fields did finish.
- **Nobody revises from paragraphs.** The first version wrote two or three tidy paragraphs per section, and they read like an essay. Switching to a line format (`GIST:`, `- point`, `STEP:`, `TABLE:`, `KEY:`, `TIP:`, `Q:`/`A:`) made the notes scannable, and made the model faster too: points are shorter than prose. It also streams well, because every line is complete on its own.
- **Be lenient with what a small model writes.** It sometimes drops the `TABLE:` prefix after the header row, writes a table with only a header, or repeats a process as both points and steps. The parser treats any piped line as a table row and a lone header as a row of labels, and the prompt now asks for steps only when there are three or more, without repeating them as points.
- **Footnotes keep it honest.** Because every point carries a slide tag, a wrong claim is one click away from its source. It's also why the notes stick to the slides: the prompt says to use only what's on them, and the footnotes make that checkable.

The notebook is the same plain CSS and SVG as my last project, [Footnotes](https://github.com/Sachindu-Nethmin/footnotes): content flows into page-sized CSS columns, and each page turn copies the sheet into five hinged strips that curl around the spiral. New this time: the step flows (flexbox boxes with SVG pen arrows), the index-card key terms, and the subject tabs along the top edge.

## Why Does Open Innovation Matter?

Because the slides aren't mine.

Lecture slides belong to the lecturer and the university. Every cloud "summarise my slides" tool starts by asking you to upload them: someone else's material, sent to a server neither of you controls. With an open-weight model running locally, the question never comes up:

- **The slides never leave my laptop.** LibreOffice, PyMuPDF and Gemma all run on the same machine. There's no account, and nothing to upload.
- **There's no bill per page.** My 59-slide deck took 24 model calls (ten looks at figures, one chapter title, thirteen sections) and about seven minutes on my laptop. On a metered API that's a cost for every lecture, for every student, every semester. Here it's a few minutes of a laptop that was already on. That's what makes a one-off price possible.
- **It works without the internet.** Campus Wi-Fi during exam week is not something to build a product on.
- **I could fix it when it was wrong.** When the finder mistook cards for tables, or a table blew the token budget, I could see exactly what the model was given and change it, or swap in a different model. With no model at all, the book still fills in from the slides' own words, footnotes and all.

A closed API would probably have written slightly better notes on day one. But I'd be asking students to upload their lecturers' slides to a server they don't control, and paying for it per page.

<!-- ## My First User
Who tried it, what they said, and whether they'd pay. Remove this section if you haven't handed it to anyone yet. -->

## Prize Categories

- **Best Use of Gemma**: Gemma 4 E4B runs locally through Ollama and does both halves of the job. Its vision judges and captions every figure cropped from the slides (and reads pictures of text), and its text side names each chapter and writes every section of the notes.
