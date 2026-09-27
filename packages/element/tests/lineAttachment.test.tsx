import React from "react";
import { vi } from "vitest";

import { reseed } from "@excalidraw/common";
import { Excalidraw } from "@excalidraw/excalidraw";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { actionTogglePolygon } from "@excalidraw/excalidraw/actions/actionLinearEditor";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer, UI } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  render,
  unmountComponent,
} from "@excalidraw/excalidraw/tests/test-utils";

import type { NormalizedZoomValue } from "@excalidraw/excalidraw/types";

import {
  DEFAULT_SNAP_DISTANCE_SCREEN_PX,
  getSnapDistanceScreenPx,
  maxBindingDistance_simple,
} from "../src/binding";
import { isBindingElement } from "../src/typeChecks";

import type { ExcalidrawLinearElement, NonDeleted } from "../src/types";

unmountComponent();

const { h } = window;
const mouse = new Pointer("mouse");

const zoom = (value: number) => ({ value: value as NormalizedZoomValue });

const drawLine = (from: [number, number], to: [number, number]) => {
  UI.clickTool("line");
  mouse.downAt(...from);
  mouse.moveTo(...to);
  mouse.up();
  Keyboard.keyPress("Escape");
  return h.elements.findLast(
    (element) => element.type === "line",
  ) as ExcalidrawLinearElement;
};

describe("snap distance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 16 screen pixels", () => {
    expect(DEFAULT_SNAP_DISTANCE_SCREEN_PX).toBe(16);
    vi.stubEnv("VITE_APP_SNAP_DISTANCE_PX", "");
    expect(getSnapDistanceScreenPx()).toBe(16);
  });

  it("stays the same on screen at every zoom level", () => {
    vi.stubEnv("VITE_APP_SNAP_DISTANCE_PX", "");
    for (const value of [0.25, 0.5, 1, 2, 4]) {
      expect(maxBindingDistance_simple(zoom(value)) * value).toBeCloseTo(16);
    }
  });

  it("follows the build setting", () => {
    vi.stubEnv("VITE_APP_SNAP_DISTANCE_PX", "24");
    expect(maxBindingDistance_simple(zoom(1))).toBe(24);
    vi.stubEnv("VITE_APP_SNAP_DISTANCE_PX", "not a number");
    expect(maxBindingDistance_simple(zoom(1))).toBe(16);
  });
});

describe("which lines can attach", () => {
  it("lets plain lines attach, but not closed polygons", () => {
    const line = API.createElement({ type: "line" });
    const polygon = { ...API.createElement({ type: "line" }), polygon: true };
    expect(isBindingElement(line)).toBe(true);
    expect(isBindingElement(polygon)).toBe(false);
  });

  it("keeps a plain line's attachment when a file is opened", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
    });
    const line = {
      ...API.createElement({
        id: "line",
        type: "line",
        x: 100,
        y: 50,
        width: 100,
        height: 0,
      }),
      points: [
        [0, 0],
        [100, 0],
      ],
      startBinding: { elementId: "shape", fixedPoint: [1, 0.5], mode: "orbit" },
    } as unknown as ExcalidrawLinearElement;
    const restored = restoreElements([shape, line], null, {
      repairBindings: true,
    });
    const restoredLine = restored.find(
      (element) => element.id === "line",
    ) as ExcalidrawLinearElement;
    expect(restoredLine.startBinding?.elementId).toBe("shape");
  });
});

describe("drawing and moving attached lines", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  it("snaps a line endpoint within the snap distance onto the shape's boundary", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([shape]);

    const line = drawLine([110, 50], [300, 50]);

    expect(line.startBinding?.elementId).toBe("shape");
    expect(Math.abs(line.x - 100)).toBeLessThanOrEqual(1);
  });

  it("snaps an endpoint dropped inside a shape onto its boundary", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([shape]);

    const line = drawLine([300, 50], [60, 50]);

    expect(line.endBinding?.elementId).toBe("shape");
    const endX = line.x + line.points[line.points.length - 1][0];
    expect(Math.abs(endX - 100)).toBeLessThanOrEqual(1);
  });

  it("does not attach an endpoint beyond the snap distance", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([shape]);

    const line = drawLine([130, 50], [300, 50]);

    expect(line.startBinding).toBeNull();
  });

  it("snaps to the closest of several shapes", () => {
    const near = API.createElement({
      id: "near",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const far = API.createElement({
      id: "far",
      type: "rectangle",
      x: 0,
      y: 112,
      width: 100,
      height: 100,
    });
    API.setElements([near, far]);

    // 4 below `near`, 8 above `far`: both within 16
    const line = drawLine([50, 104], [300, 104]);

    expect(line.startBinding?.elementId).toBe("near");
  });

  it("breaks an exact tie in favour of the shape on top", () => {
    const below = API.createElement({
      id: "below",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const onTop = API.createElement({
      id: "onTop",
      type: "rectangle",
      x: 0,
      y: 110,
      width: 100,
      height: 100,
    });
    API.setElements([below, onTop]);

    // 5 from each
    const line = drawLine([50, 105], [300, 105]);

    expect(line.startBinding?.elementId).toBe("onTop");
  });

  it("lets go of its shapes when a line becomes a closed polygon", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      boundElements: [{ type: "arrow", id: "line" }],
    });
    const line = {
      ...API.createElement({
        id: "line",
        type: "line",
        x: 100,
        y: 50,
        width: 100,
        height: 100,
      }),
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [5, 5],
      ],
      startBinding: { elementId: "shape", fixedPoint: [1, 0.5], mode: "orbit" },
    } as unknown as NonDeleted<ExcalidrawLinearElement>;
    API.setElements([shape, line]);
    API.setSelectedElements([line]);

    h.app.actionManager.executeAction(actionTogglePolygon);

    expect((API.getElement(line) as any).polygon).toBe(true);
    expect(API.getElement(line).startBinding).toBeNull();
    expect(API.getElement(shape).boundElements ?? []).toEqual([]);
  });

  it("moves an attached line's endpoint when the shape moves, and leaves the other end", () => {
    const shape = API.createElement({
      id: "shape",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([shape]);
    const line = drawLine([110, 50], [300, 50]);
    // elements are updated in place, so copy the numbers now
    const startYBefore = line.y;
    const endBefore = [line.x + line.points[1][0], line.y + line.points[1][1]];

    mouse.clickAt(0, 0);
    mouse.downAt(50, 50);
    mouse.moveTo(50, 150);
    mouse.up();

    const moved = API.getElement(line);
    expect(moved.startBinding?.elementId).toBe("shape");
    expect(moved.y).toBeGreaterThan(startYBefore);
    expect([
      moved.x + moved.points[1][0],
      moved.y + moved.points[1][1],
    ]).toEqual(endBefore);
  });
});
