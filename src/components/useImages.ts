"use client";

import { useEffect, useState } from "react";
import * as store from "@/lib/store";

/** Loads every saved image under a key prefix (e.g. one chapter's figures) from IndexedDB. */
export function useImages(prefix: string | null, version?: unknown) {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!prefix) return;
    let alive = true;
    store.imagesWithPrefix(prefix).then((r) => alive && setImages(r));
    return () => {
      alive = false;
    };
  }, [prefix, version]);
  return images;
}
