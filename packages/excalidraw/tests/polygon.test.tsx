/**
 * The polygon shape in the editor: drawing it with its tool, the Corners
 * setting, and the rectangle behaviours it shares — hit-testing by its
 * outline, lines attaching to it, holding what is inside it, text inside it,
 * and surviving a save and reopen.
 */
import React from "react";

import { CODES, KEYS, arrayToMap, reseed } from "@excalidraw/common";

import {
  distanceToElement,
  getBoundTextMaxWidth,
  getPolygonTextAreaFraction,
  getRegularPolygonAspectRatio,
  isOutlineInsideContainer,
} from "@excalidraw/element";

import { pointFrom } from "@excalidraw/math";

import type { GlobalPoint } from "@excalidraw/math";

import type {
  ExcalidrawArrowElement,
  ExcalidrawPolygonElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { restoreAppState, restoreElements } from "../data/restore";
import { serializeAsJSON } from "../data/json";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, fireEvent, render, screen } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const drawWithTool = (x1: number, y1: number, x2: number, y2: number) => {
  mouse.reset();
  mouse.down(x1, y1);
  mouse.up(x2 - x1, y2 - y1);
};

const lastElement = () => h.elements[h.elements.length - 1];

describe("polygon", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  afterEach(async () => {
    await act(async () => {});
  });

  describe("drawing", () => {
    it("draws a hexagon filling the dragged box after pressing J", () => {
      Keyboard.keyPress(KEYS.J);
      expect(h.state.activeTool.type).toBe("polygon");

      drawWithTool(10, 20, 110, 100);

      const polygon = lastElement() as ExcalidrawPolygonElement;
      expect(polygon.type).toBe("polygon");
      expect(polygon.sides).toBe(6);
      expect([polygon.x, polygon.y]).toEqual([10, 20]);
      expect([polygon.width, polygon.height]).toEqual([100, 80]);
    });

    it("keeps all sides equal while Shift is held", () => {
      UI.clickTool("polygon");
      Keyboard.withModifierKeys({ shift: true }, () => {
        drawWithTool(0, 0, 120, 60);
      });

      const polygon = lastElement() as ExcalidrawPolygonElement;
      expect(polygon.width / polygon.height).toBeCloseTo(
        getRegularPolygonAspectRatio(6),
      );
    });
  });

  describe("the Corners setting", () => {
    it("reshapes the selected polygon and is used for the next one", () => {
      UI.clickTool("polygon");
      drawWithTool(0, 0, 100, 100);
      const first = lastElement();

      fireEvent.change(screen.getByTestId("polygon-sides"), {
        target: { value: "8" },
      });

      expect((API.getElement(first) as ExcalidrawPolygonElement).sides).toBe(8);
      expect(h.state.currentItemPolygonSides).toBe(8);

      UI.clickTool("polygon");
      drawWithTool(200, 0, 300, 100);
      expect((lastElement() as ExcalidrawPolygonElement).sides).toBe(8);
    });

    it("is offered by the polygon tool before anything is drawn", () => {
      UI.clickTool("polygon");
      expect(screen.queryByTestId("polygon-sides")).not.toBeNull();

      UI.clickTool("rectangle");
      expect(screen.queryByTestId("polygon-sides")).toBeNull();
    });

    it("fits text inside again when the text area shrinks", async () => {
      const polygon = API.createElement({
        type: "polygon",
        sides: 12,
        x: 0,
        y: 0,
        width: 300,
        height: 300,
      });
      API.setElements([polygon]);
      const text = await UI.editText(polygon, "a label long enough to wrap");

      API.setSelectedElements([polygon]);
      fireEvent.change(screen.getByTestId("polygon-sides"), {
        target: { value: "3" },
      });

      const triangle = API.getElement(polygon) as ExcalidrawPolygonElement;
      expect(triangle.sides).toBe(3);
      expect(API.getElement(text).width).toBeLessThanOrEqual(
        getBoundTextMaxWidth(triangle, API.getElement(text)),
      );
    });
  });

  it("keeps an attached arrow on the outline when Corners changes", () => {
    const hexagon = API.createElement({
      type: "polygon",
      sides: 6,
      x: 200,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([hexagon]);
    UI.clickTool("arrow");
    mouse.reset();
    mouse.downAt(0, 150);
    mouse.moveTo(205, 150);
    mouse.up();
    const arrow = lastElement() as ExcalidrawArrowElement;
    expect(arrow.endBinding?.elementId).toBe(hexagon.id);

    // a triangle's sides lie well inside where the hexagon's left corner was
    API.setSelectedElements([hexagon]);
    fireEvent.change(screen.getByTestId("polygon-sides"), {
      target: { value: "3" },
    });

    const moved = API.getElement(arrow);
    const end = moved.points[moved.points.length - 1];
    expect(
      distanceToElement(
        API.getElement(hexagon),
        arrayToMap(h.elements),
        pointFrom<GlobalPoint>(moved.x + end[0], moved.y + end[1]),
      ),
    ).toBeLessThan(2);
  });

  describe("turned upside down", () => {
    it("turns a triangle half a turn when flipped vertically", () => {
      const triangle = API.createElement({ type: "polygon", sides: 3 });
      const hexagon = API.createElement({ type: "polygon", sides: 6, x: 200 });
      API.setElements([triangle, hexagon]);

      API.setSelectedElements([triangle]);
      Keyboard.withModifierKeys({ shift: true }, () => {
        Keyboard.codePress(CODES.V);
      });
      expect(API.getElement(triangle).angle).toBeCloseTo(Math.PI);

      // flat on top and bottom, a hexagon flipped is the same hexagon
      API.setSelectedElements([hexagon]);
      Keyboard.withModifierKeys({ shift: true }, () => {
        Keyboard.codePress(CODES.V);
      });
      expect(API.getElement(hexagon).angle).toBe(0);
    });

    it("turns a triangle half a turn when resized past its opposite edge", () => {
      const triangle = API.createElement({
        type: "polygon",
        sides: 3,
        width: 100,
        height: 100,
      });
      API.setElements([triangle]);

      UI.resize(triangle, "n", [0, 150]);

      expect(API.getElement(triangle).angle).toBeCloseTo(Math.PI);
      expect(API.getElement(triangle).height).toBeCloseTo(50);
    });
  });

  it("is hit by its outline, not its box", () => {
    const triangle = API.createElement({
      type: "polygon",
      sides: 3,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
    });
    API.setElements([triangle]);

    // the box's top-left corner lies outside a triangle pointing up
    mouse.clickAt(8, 8);
    expect(API.getSelectedElements()).toHaveLength(0);

    mouse.clickAt(50, 70);
    expect(API.getSelectedElements().map((element) => element.id)).toEqual([
      triangle.id,
    ]);
  });

  it("lets an arrow attach to its outline and follow it", () => {
    const hexagon = API.createElement({
      type: "polygon",
      sides: 6,
      x: 200,
      y: 100,
      width: 100,
      height: 100,
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
    });
    API.setElements([hexagon]);

    // the hexagon's left corner is at (200, 150)
    UI.clickTool("arrow");
    mouse.reset();
    mouse.downAt(0, 150);
    mouse.moveTo(205, 150);
    mouse.up();

    const arrow = lastElement() as ExcalidrawArrowElement;
    expect(arrow.endBinding?.elementId).toBe(hexagon.id);
    const endBefore = arrow.x + arrow.points[arrow.points.length - 1][0];

    // leave the arrow, then pick up the hexagon by its middle
    Keyboard.keyPress(KEYS.ESCAPE);
    mouse.reset();
    mouse.clickAt(250, 150);
    mouse.downAt(250, 150);
    mouse.moveTo(250 + 60, 150);
    mouse.up();

    expect(API.getElement(hexagon).x).toBe(260);
    const moved = API.getElement(arrow);
    const endAfter = moved.x + moved.points[moved.points.length - 1][0];
    expect(endAfter - endBefore).toBeCloseTo(60, 0);
  });

  it("holds what lies fully inside its outline, not its box", () => {
    const triangle = API.createElement({
      type: "polygon",
      sides: 3,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
    const inTheMiddle = API.createElement({
      type: "rectangle",
      x: 80,
      y: 120,
      width: 40,
      height: 40,
    });
    const inTheCorner = API.createElement({
      type: "rectangle",
      x: 5,
      y: 5,
      width: 20,
      height: 20,
    });
    const elementsMap = arrayToMap([triangle, inTheMiddle, inTheCorner]);

    expect(isOutlineInsideContainer(inTheMiddle, triangle, elementsMap)).toBe(
      true,
    );
    expect(isOutlineInsideContainer(inTheCorner, triangle, elementsMap)).toBe(
      false,
    );
  });

  it("takes text inside, within its text area", async () => {
    const hexagon = API.createElement({
      type: "polygon",
      sides: 6,
      x: 0,
      y: 0,
      width: 200,
      height: 160,
    });
    API.setElements([hexagon]);

    // long enough to wrap, so it fills the text area's width
    const text = await UI.editText(
      hexagon,
      "a label long enough to wrap over several lines",
    );

    expect(API.getElement(text).containerId).toBe(hexagon.id);
    const margin = (1 - getPolygonTextAreaFraction(6)) / 2;
    expect(API.getElement(text).x).toBeGreaterThanOrEqual(200 * margin);
    expect(
      API.getElement(text).x + API.getElement(text).width,
    ).toBeLessThanOrEqual(200 * (1 - margin));
  });

  describe("in a saved file", () => {
    it("keeps its corner count through a save and reopen", () => {
      const octagon = API.createElement({
        type: "polygon",
        sides: 8,
        width: 100,
        height: 100,
      });
      const saved = JSON.parse(
        serializeAsJSON([octagon], h.state, {}, "local"),
      );

      const [reopened] = restoreElements(saved.elements, null);
      expect(reopened.type).toBe("polygon");
      expect((reopened as ExcalidrawPolygonElement).sides).toBe(8);
    });

    it("repairs a remembered corner count that is out of range", () => {
      expect(
        restoreAppState({ currentItemPolygonSides: 40 }, null)
          .currentItemPolygonSides,
      ).toBe(12);
    });

    it("repairs a corner count that is out of range or missing", () => {
      const octagon = API.createElement({ type: "polygon", sides: 8 });
      const [tooMany, missing] = restoreElements(
        [
          { ...octagon, id: "too-many", sides: 40 },
          { ...octagon, id: "missing", sides: undefined },
        ] as unknown as ExcalidrawPolygonElement[],
        null,
      ) as ExcalidrawPolygonElement[];

      expect(tooMany.sides).toBe(12);
      expect(missing.sides).toBe(6);
    });
  });
});
