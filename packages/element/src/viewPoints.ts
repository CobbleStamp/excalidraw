import { isFiniteNumber } from "@excalidraw/math";

import type { ViewPoint, ViewPoints } from "@excalidraw/excalidraw/types";

/**
 * The well-formed view points in untrusted data: each needs a name, a finite
 * area of positive size and an ordering index; anything else is dropped.
 */
export const restoreViewPoints = (value: unknown): ViewPoints => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const viewPoints: Record<string, ViewPoint> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { name, x, y, width, height, index } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof name === "string" &&
      isFiniteNumber(x) &&
      isFiniteNumber(y) &&
      isFiniteNumber(width) &&
      isFiniteNumber(height) &&
      width > 0 &&
      height > 0 &&
      typeof index === "string" &&
      index.length > 0
    ) {
      viewPoints[id] = { name, x, y, width, height, index };
    }
  }
  return viewPoints;
};
