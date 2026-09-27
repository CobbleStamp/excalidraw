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
  attachLooseEndpoints,
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

describe("files that record an attachment on the arrow only", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  for (const elbowed of [false, true]) {
    it(`makes the ${
      elbowed ? "elbow " : ""
    }arrow follow its shape once opened`, () => {
      // the shape doesn't list the arrow in its boundElements
      const box = API.createElement({
        id: "box",
        type: "rectangle",
        x: 300,
        y: 300,
        width: 300,
        height: 150,
      });
      const arrow = {
        ...API.createElement({
          id: "arrow",
          type: "arrow",
          x: 450,
          y: 100,
          width: 0,
          height: 195,
        }),
        points: [
          [0, 0],
          [0, 195],
        ],
        elbowed,
        startBinding: null,
        endBinding: { elementId: "box", fixedPoint: [0.5, 0], mode: "orbit" },
      } as unknown as ExcalidrawLinearElement;

      const restored = restoreElements([box, arrow], null, {
        repairBindings: true,
      });
      API.setElements(restored);
      expect(API.getElement(box).boundElements).toEqual([
        { type: "arrow", id: "arrow" },
      ]);

      mouse.clickAt(300, 300);
      mouse.downAt(300, 375);
      mouse.moveTo(300, 575);
      mouse.up();

      const moved = API.getElement(arrow);
      const endY = moved.y + moved.points[moved.points.length - 1][1];
      expect(Math.abs(endY - 500)).toBeLessThanOrEqual(1);
    });
  }
});

describe("attaching loose endpoints when a file opens", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  const makeBox = () =>
    API.createElement({
      id: "box",
      type: "rectangle",
      x: 300,
      y: 300,
      width: 300,
      height: 150,
    });
  const makeArrow = (id: string, x: number, endY: number) =>
    ({
      ...API.createElement({
        id,
        type: "arrow",
        x,
        y: 100,
        width: 0,
        height: endY - 100,
      }),
      points: [
        [0, 0],
        [0, endY - 100],
      ],
      startBinding: null,
      endBinding: null,
    } as unknown as ExcalidrawLinearElement);

  it("attaches an endpoint within the snap distance, onto the boundary", () => {
    const box = makeBox();
    const near = makeArrow("near", 450, 290);
    API.setElements([box, near]);

    attachLooseEndpoints(h.app.scene);

    const attached = API.getElement(near);
    expect(attached.endBinding?.elementId).toBe("box");
    const endY = attached.y + attached.points[attached.points.length - 1][1];
    expect(Math.abs(endY - 300)).toBeLessThanOrEqual(1);
    expect(API.getElement(box).boundElements).toEqual([
      { type: "arrow", id: "near" },
    ]);
  });

  it("leaves an endpoint beyond the snap distance loose", () => {
    const box = makeBox();
    const far = makeArrow("far", 450, 270);
    API.setElements([box, far]);

    attachLooseEndpoints(h.app.scene);

    expect(API.getElement(far).endBinding).toBeNull();
  });

  it("attaches a line with both ends on one shape where it lies", () => {
    const box = makeBox();
    const divider = {
      ...API.createElement({
        id: "divider",
        type: "line",
        x: 300,
        y: 340,
        width: 300,
        height: 0,
      }),
      points: [
        [0, 0],
        [300, 0],
      ],
    } as unknown as ExcalidrawLinearElement;
    API.setElements([box, divider]);

    attachLooseEndpoints(h.app.scene);

    const attached = API.getElement(divider);
    expect(attached.startBinding?.elementId).toBe("box");
    expect(attached.endBinding?.elementId).toBe("box");
    expect([attached.x, attached.y, attached.points[1][0]]).toEqual([
      300, 340, 300,
    ]);
  });

  it("follows the shape afterwards", () => {
    const box = makeBox();
    const near = makeArrow("near", 450, 290);
    API.setElements([box, near]);
    attachLooseEndpoints(h.app.scene);

    mouse.clickAt(300, 300);
    mouse.downAt(300, 375);
    mouse.moveTo(300, 575);
    mouse.up();

    const moved = API.getElement(near);
    const endY = moved.y + moved.points[moved.points.length - 1][1];
    expect(Math.abs(endY - 500)).toBeLessThanOrEqual(1);
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

    // excalidraw-web: dropped 10px inside the edge, within the snap distance
    const line = drawLine([300, 50], [90, 50]);

    expect(line.endBinding?.elementId).toBe("shape");
    const endX = line.x + line.points[line.points.length - 1][0];
    expect(Math.abs(endX - 100)).toBeLessThanOrEqual(1);
  });

  // excalidraw-web: deeper inside than the snap distance, the endpoint stays free
  it("leaves an endpoint dropped deep inside a shape free", () => {
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

    expect(line.endBinding).toBeNull();
    const endX = line.x + line.points[line.points.length - 1][0];
    expect(Math.abs(endX - 60)).toBeLessThanOrEqual(1);
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
