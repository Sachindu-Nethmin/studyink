/** A course in the study book. Each one gets an index tab along the top of the book. */
export type Subject = {
  id: string; // the course code, e.g. "IS7101"
  code: string;
  name: string; // written by the student on the subject's divider page
  year: string;
  color: string;
  link?: string; // the course's LMS page
};

/** One slide as the extractor read it. */
export type Slide = {
  n: number;
  title: string;
  text: string;
  notes: string; // speaker notes (pptx only)
  words: number;
  skip: boolean; // "Thank you", "Questions?"
  figures: string[];
  /** words Gemma read off a picture of text on this slide (a screenshot of a bullet list) */
  transcript?: string;
};

/** What Gemma (vision) made of a region cropped from a slide. */
export type Verdict = {
  kind: string; // diagram, flowchart, table, chart, photo, screenshot, text, layout, decoration
  keep: boolean;
  caption: string;
  explain: string;
  by: string;
};

/** A region cropped from a slide: a diagram, table, chart or picture. The image itself is in the
 *  "images" store, under `${lectureId}:fig:${id}`. */
export type Figure = {
  id: string;
  slide: number;
  w: number;
  h: number;
  box: number[]; // where it sits on the slide, 0..1
  kind: "picture" | "drawing";
  labels: string; // text found inside it
  verdict?: Verdict;
  /** the student's own call, which beats Gemma's: true = keep, false = set aside */
  pinned?: boolean;
};

/** A run of slides that Gemma writes up as one section of the chapter. */
export type Section = {
  id: string;
  title: string;
  slides: number[];
  text?: string; // the notes, in the small markup the parser in notes.ts reads
  by?: string;
  at?: number;
};

export type Overview = {
  title: string;
  nutshell: string;
  outcomes: string[];
  by: string;
};

export type LectureStatus = "reading" | "looking" | "writing" | "done" | "error";

/** A lecture becomes a chapter. Lives only in this browser's IndexedDB. */
export type Lecture = {
  id: string;
  subjectId: string;
  title: string; // the deck's own title, until Gemma names the chapter
  fileName: string;
  kind: "pdf" | "pptx";
  addedAt: number;
  pages: number;
  aspect: number; // slide width / height
  slides: Slide[];
  figures: Figure[];
  sections: Section[];
  overview?: Overview;
  status: LectureStatus;
  error?: string;
};

export type Settings = { name: string };

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

/** What /api/extract hands back. */
export type Extracted = {
  source: { name: string; kind: "pdf" | "pptx"; pages: number; width: number; height: number };
  title: string;
  slides: (Omit<Slide, "transcript"> & { thumb: string })[];
  figures: (Omit<Figure, "verdict" | "pinned"> & { src: string })[];
};
