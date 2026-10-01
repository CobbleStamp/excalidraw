/**
 * Polygon geometry: where the corners sit in the box, the proportions that
 * keep the sides equal, the area text may use, and how a stored corner count
 * is normalized.
 */
import { pointDistance } from "@excalidraw/math";

import {
  getPolygonPoints,
  getPolygonTextAreaFraction,
  getRegularPolygonAspectRatio,
  isPointInsidePolygonPoints,
  normalizePolygonSides,
} from "../src/polygon";

const allSides: number[] = Array.from({ length: 10 }, (_, i) => i + 3);

describe("polygon corners", () => {
  it("places a hexagon's corners in its box, flat on top and bottom", () => {
    const points = getPolygonPoints({ width: 200, height: 100, sides: 6 });
    const rounded = points.map(([x, y]) => [
      Math.round(x * 1e6) / 1e6,
      Math.round(y * 1e6) / 1e6,
    ]);
    expect(rounded).toEqual([
      [50, 100],
      [0, 50],
      [50, 0],
      [150, 0],
      [200, 50],
      [150, 100],
    ]);
  });

  it.each(allSides)(
    "gives %i corners a flat bottom edge and fills the box",
    (sides) => {
      const points = getPolygonPoints({ width: 120, height: 80, sides });
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);

      expect(points).toHaveLength(sides);
      expect(Math.min(...xs)).toBeCloseTo(0);
      expect(Math.max(...xs)).toBeCloseTo(120);
      expect(Math.min(...ys)).toBeCloseTo(0);
      expect(Math.max(...ys)).toBeCloseTo(80);
      // exactly two corners sit on the bottom edge, level with each other
      expect(ys.filter((y) => Math.abs(y - 80) < 1e-6)).toHaveLength(2);
    },
  );

  it("points odd corner counts up, with the top corner in the middle", () => {
    for (const sides of [3, 5, 7]) {
      const points = getPolygonPoints({ width: 100, height: 100, sides });
      const top = points.filter(([, y]) => Math.abs(y) < 1e-6);
      expect(top).toHaveLength(1);
      expect(top[0][0]).toBeCloseTo(50);
    }
  });

  it("makes 4 corners a square, not a diamond", () => {
    const points = getPolygonPoints({ width: 100, height: 100, sides: 4 });
    for (const [x, y] of points) {
      expect([0, 100]).toContainEqual(Math.round(x));
      expect([0, 100]).toContainEqual(Math.round(y));
    }
  });

  it.each(allSides)(
    "keeps all %i sides equal in a box of the regular proportions",
    (sides) => {
      const height = 100;
      const width = height * getRegularPolygonAspectRatio(sides);
      const points = getPolygonPoints({ width, height, sides });
      const lengths = points.map((point, i) =>
        pointDistance(point, points[(i + 1) % points.length]),
      );
      for (const length of lengths) {
        expect(length).toBeCloseTo(lengths[0], 6);
      }
    },
  );
});

describe("the area text may use", () => {
  it.each(allSides)(
    "is the largest centred box that fits inside %i corners",
    (sides) => {
      const points = getPolygonPoints({ width: 1, height: 1, sides });
      const corners = (f: number): [number, number][] => [
        [0.5 - f / 2, 0.5 - f / 2],
        [0.5 + f / 2, 0.5 - f / 2],
        [0.5 + f / 2, 0.5 + f / 2],
        [0.5 - f / 2, 0.5 + f / 2],
      ];
      const fraction = getPolygonTextAreaFraction(sides);

      expect(fraction).toBeGreaterThan(0);
      expect(
        corners(fraction).every((corner) =>
          isPointInsidePolygonPoints(points, corner, 1e-6),
        ),
      ).toBe(true);
      if (fraction < 1) {
        expect(
          corners(fraction + 0.01).every((corner) =>
            isPointInsidePolygonPoints(points, corner),
          ),
        ).toBe(false);
      }
    },
  );

  it("is the whole box for a square", () => {
    expect(getPolygonTextAreaFraction(4)).toBeCloseTo(1, 6);
  });
});

describe("the stored corner count", () => {
  it("keeps whole numbers from 3 to 12", () => {
    expect(normalizePolygonSides(3)).toBe(3);
    expect(normalizePolygonSides(12)).toBe(12);
  });

  it("rounds and clamps other numbers into range", () => {
    expect(normalizePolygonSides(6.4)).toBe(6);
    expect(normalizePolygonSides(2)).toBe(3);
    expect(normalizePolygonSides(40)).toBe(12);
  });

  it("falls back to 6 when it is not a number", () => {
    expect(normalizePolygonSides(undefined)).toBe(6);
    expect(normalizePolygonSides(Number.NaN)).toBe(6);
    expect(normalizePolygonSides("8")).toBe(6);
  });
});
