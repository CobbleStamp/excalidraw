/**
 * Polygon geometry: where a polygon's corners sit inside its box. A polygon
 * is a regular polygon with a flat bottom edge, stretched to fill its box, so
 * its box and corner count are all that is stored.
 */
import {
  DEFAULT_POLYGON_SIDES,
  POLYGON_MAX_SIDES,
  POLYGON_MIN_SIDES,
} from "@excalidraw/common";

import {
  clamp,
  pointFrom,
  pointFromVector,
  vectorFromPoint,
  vectorNormalize,
  vectorScale,
} from "@excalidraw/math";

import type { GlobalPoint, LocalPoint } from "@excalidraw/math";

import type { ExcalidrawElement, ExcalidrawPolygonElement } from "./types";

/** Turns any stored corner count into a whole number within the allowed range */
export const normalizePolygonSides = (sides: unknown): number =>
  typeof sides === "number" && Number.isFinite(sides)
    ? clamp(Math.round(sides), POLYGON_MIN_SIDES, POLYGON_MAX_SIDES)
    : DEFAULT_POLYGON_SIDES;

type RegularPolygon = {
  /** corners fitted to a 1×1 box, clockwise on screen from the bottom-left */
  unitPoints: [number, number][];
  /** width over height of the box that keeps all sides equal */
  aspectRatio: number;
};

const regularPolygon = (sides: number): RegularPolygon => {
  const n: number = normalizePolygonSides(sides);
  // a flat bottom edge: the two bottom corners sit either side of straight down
  const angles: number[] = Array.from(
    { length: n },
    (_, k) => Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n,
  );
  const xs: number[] = angles.map(Math.cos);
  const ys: number[] = angles.map(Math.sin);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  return {
    unitPoints: angles.map((_, k) => [
      (xs[k] - minX) / (maxX - minX),
      (ys[k] - minY) / (maxY - minY),
    ]),
    aspectRatio: (maxX - minX) / (maxY - minY),
  };
};

/** A polygon's corners, relative to its top-left, before rotation */
export const getPolygonPoints = (
  element: Pick<ExcalidrawPolygonElement, "width" | "height" | "sides">,
): LocalPoint[] =>
  regularPolygon(element.sides).unitPoints.map(([x, y]) =>
    pointFrom<LocalPoint>(x * element.width, y * element.height),
  );

/**
 * Each corner's rounding: where it leaves the side before it, the corner
 * itself, and where it joins the side after it, `radius` away along each side.
 */
export const getPolygonCornerArcs = <Point extends GlobalPoint | LocalPoint>(
  points: readonly Point[],
  radius: number,
): [start: Point, corner: Point, end: Point][] => {
  const towards = (from: Point, to: Point): Point =>
    pointFromVector<Point>(
      vectorScale(vectorNormalize(vectorFromPoint(to, from)), radius),
      from,
    );
  return points.map((corner, i) => [
    towards(corner, points[(i + points.length - 1) % points.length]),
    corner,
    towards(corner, points[(i + 1) % points.length]),
  ]);
};

/**
 * Whether turning the element upside down takes a half turn: a polygon with
 * an odd number of corners has its flat edge only at the bottom, so flipped
 * top to bottom it is the same polygon turned half a turn.
 */
export const flipsVerticallyByTurning = (
  element: Pick<ExcalidrawElement, "type"> & { sides?: number },
): boolean =>
  element.type === "polygon" && normalizePolygonSides(element.sides) % 2 === 1;

/** Width over height of the box that makes a polygon's sides all equal */
export const getRegularPolygonAspectRatio = (sides: number): number =>
  regularPolygon(sides).aspectRatio;

const textAreaFractions = new Map<number, number>();

/**
 * Whether a point lies inside a polygon's corners (as `getPolygonPoints`
 * gives them, in the same frame as the point), or within `tolerance` of its
 * edges.
 */
export const isPointInsidePolygonPoints = (
  points: readonly (readonly [number, number])[],
  [px, py]: readonly [number, number],
  tolerance: number = 0,
): boolean =>
  points.every(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    // the corners run clockwise on screen (y down), so inside is to the
    // right of every edge: a non-negative signed distance
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    return cross / Math.hypot(bx - ax, by - ay) >= -tolerance;
  });

/**
 * The share of a polygon's width and height that text inside it may use: the
 * largest box, centred on the polygon's box and with the same proportions,
 * that fits inside the outline.
 */
export const getPolygonTextAreaFraction = (
  sides: number | undefined,
): number => {
  const n: number = normalizePolygonSides(sides);
  const cached: number | undefined = textAreaFractions.get(n);
  if (cached !== undefined) {
    return cached;
  }
  const points = regularPolygon(n).unitPoints;
  const fits = (f: number): boolean =>
    [
      [0.5 - f / 2, 0.5 - f / 2],
      [0.5 + f / 2, 0.5 - f / 2],
      [0.5 + f / 2, 0.5 + f / 2],
      [0.5 - f / 2, 0.5 + f / 2],
    ].every((corner) =>
      isPointInsidePolygonPoints(points, corner as [number, number], 1e-9),
    );
  let [low, high] = [0, 1];
  for (let i = 0; i < 30; i++) {
    const mid: number = (low + high) / 2;
    [low, high] = fits(mid) ? [mid, high] : [low, mid];
  }
  textAreaFractions.set(n, low);
  return low;
};
