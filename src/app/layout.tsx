import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (see src/fonts/README.md): no font CDN, and the notebook still looks right offline.
const caveat = localFont({ src: "../fonts/Caveat-Variable.woff2", weight: "400 700", variable: "--font-hand", display: "swap" });
const patrick = localFont({ src: "../fonts/PatrickHand-Regular.woff2", weight: "400", variable: "--font-note", display: "swap" });
const typewriter = localFont({ src: "../fonts/SpecialElite-Regular.woff2", weight: "400", variable: "--font-type", display: "swap" });

export const metadata: Metadata = {
  title: "StudyInk — lecture slides in, a study book out",
  description:
    "Drop in a lecture deck (.pptx or .pdf). StudyInk cuts the figures out of the slides, and Gemma, an open-weight model running on your own laptop, writes the lecture up as study-book pages with a footnote back to every slide.",
  applicationName: "StudyInk",
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#24375e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${caveat.variable} ${patrick.variable} ${typewriter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
