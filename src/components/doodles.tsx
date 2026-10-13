/* Hand-drawn bits for the margins. Every stroke is slightly wobbly on purpose. */

type P = { className?: string; size?: number; title?: string };

const svg = (size: number, className?: string, title?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  role: title ? "img" : undefined,
  "aria-hidden": title ? undefined : true,
  "aria-label": title,
});

export const Pen = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M32 6 L42 16 L18 40 L6 42 L8 30 Z" />
    <path d="M28 10 L38 20 M8 30 L18 40" />
  </svg>
);

export const Plus = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M24 7 C24.5 18, 23.5 30, 24 41 M7 24 C18 23, 30 25, 41 24" />
  </svg>
);

export const Check = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)} strokeWidth={3}>
    <path d="M7 25 C11 29, 15 33, 19 38 C25 26, 33 15, 42 8" />
  </svg>
);

export const Cross = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)} strokeWidth={3}>
    <path d="M10 9 C18 18, 28 29, 38 39 M38 9 C29 19, 19 29, 10 39" />
  </svg>
);

/** A slide deck: the thing you tape into the book. */
export const Deck = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M6 11 L40 9 L42 33 L8 35 Z" />
    <path d="M12 17 L30 16 M12 23 L34 22 M12 29 L24 28.5" />
    <path d="M24 35 L23 43 M16 43 L31 42" />
  </svg>
);

export const Lens = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <circle cx="20" cy="20" r="12" />
    <path d="M29 29 L42 41" strokeWidth={3} />
    <path d="M14 16 C15 13, 18 12, 20 12" />
  </svg>
);

export const Arrow = ({ size = 60, className }: P) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden>
    <path d="M6 44 C30 10, 70 6, 104 26" />
    <path d="M92 14 L106 27 L88 33" />
  </svg>
);

/** A wobbly underline to put under handwritten headings. */
export const Scribble = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 300 16" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <path d="M3 10 C60 4, 120 13, 180 7 S270 6, 297 9" />
    <path d="M40 13 C100 9, 170 14, 250 11" opacity=".55" strokeWidth="2" />
  </svg>
);

/** The "pen is moving" placeholder while the model writes. */
export function Writing({ label = "writing…" }: { label?: string }) {
  return (
    <div className="writing" role="status">
      <svg viewBox="0 0 220 40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path className="writing-line" d="M4 28 C14 8, 22 34, 30 20 S44 10, 50 24 S62 34, 70 18 S84 8, 92 24 S104 32, 112 18 S126 10, 134 26 S148 30, 156 16 S170 12, 178 26 S194 30, 216 20" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
