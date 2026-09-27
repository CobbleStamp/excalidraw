import React from "react";

import { KEYS, reseed } from "@excalidraw/common";
import { Excalidraw } from "@excalidraw/excalidraw";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  render,
  unmountComponent,
} from "@excalidraw/excalidraw/tests/test-utils";

import { arrayToMap } from "@excalidraw/common";

import { getContainedElements, isOutlineInsideContainer } from "../src";

import type { ExcalidrawElement } from "../src/types";

unmountComponent();

const { h } = window;
const mouse = new Pointer("mouse");

/** Drags an element by (dx, dy): select it via its top-left corner, then drag from its centre. */
const dragBy = (element: ExcalidrawElement, dx: number, dy: number) => {
  mouse.clickAt(element.x, element.y);
  const startX = element.x + element.width / 2;
  const startY = element.y + element.height / 2;
  mouse.downAt(startX, startY);
  mouse.moveTo(startX + dx, startY + dy);
  mouse.up();
};

const positionOf = (element: ExcalidrawElement) => {
  const current = API.getElement(element);
  return { x: current.x, y: current.y };
};

describe("containment geometry", () => {
  it("treats an outline touching the container's edge as inside", () => {
    const container = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const inner = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
    const elementsMap = arrayToMap([container, inner]);
    expect(isOutlineInsideContainer(inner, container, elementsMap)).toBe(true);
  });

  it("uses each container's real shape, not its bounding box", () => {
    const ellipse = API.createElement({
      type: "ellipse",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const diamond = API.createElement({
      type: "diamond",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const inTheCorner = API.createElement({
      type: "rectangle",
      x: 2,
      y: 2,
      width: 10,
      height: 10,
    });
    const inTheMiddle = API.createElement({
      type: "rectangle",
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
    const elementsMap = arrayToMap([
      ellipse,
      diamond,
      inTheCorner,
      inTheMiddle,
    ]);
    expect(isOutlineInsideContainer(inTheCorner, ellipse, elementsMap)).toBe(
      false,
    );
    expect(isOutlineInsideContainer(inTheCorner, diamond, elementsMap)).toBe(
      false,
    );
    expect(isOutlineInsideContainer(inTheMiddle, ellipse, elementsMap)).toBe(
      true,
    );
    expect(isOutlineInsideContainer(inTheMiddle, diamond, elementsMap)).toBe(
      true,
    );
  });

  it("accounts for the container's rotation", () => {
    const tilted = API.createElement({
      type: "rectangle",
      x: 0,
      y: 40,
      width: 200,
      height: 20,
      angle: Math.PI / 2,
    });
    const alongTheLongSide = API.createElement({
      type: "rectangle",
      x: 95,
      y: 0,
      width: 10,
      height: 30,
    });
    const elementsMap = arrayToMap([tilted, alongTheLongSide]);
    // rotated 90°, the 200×20 rectangle stands upright: x 90..110, y -50..150
    expect(
      isOutlineInsideContainer(alongTheLongSide, tilted, elementsMap),
    ).toBe(true);
  });

  it("is not offered by lines drawn as closed polygons", () => {
    const polygon = API.createElement({
      type: "line",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const inner = API.createElement({
      type: "rectangle",
      x: 40,
      y: 40,
      width: 10,
      height: 10,
    });
    expect(
      getContainedElements(
        [polygon],
        [polygon, inner],
        arrayToMap([polygon, inner]),
      ),
    ).toEqual([]);
  });
});

describe("moving a container moves what it contains", () => {
  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  const makeContainer = () =>
    API.createElement({
      id: "container",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
  const makeTextInside = () =>
    API.createElement({
      id: "text",
      type: "text",
      text: "inside",
      x: 40,
      y: 40,
      width: 60,
      height: 20,
    });

  it("1. moves text fully inside a rectangle by exactly the same distance", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);

    dragBy(container, 120, 80);

    expect(positionOf(container)).toEqual({ x: 120, y: 80 });
    expect(positionOf(text)).toEqual({ x: 160, y: 120 });
  });

  it("2. leaves an element that is only partly inside where it is", () => {
    const container = makeContainer();
    const partly = API.createElement({
      id: "partly",
      type: "ellipse",
      x: 250,
      y: 150,
      width: 100,
      height: 100,
    });
    API.setElements([container, partly]);

    dragBy(container, 120, 80);

    expect(positionOf(partly)).toEqual({ x: 250, y: 150 });
  });

  it("3. releases an element dragged out of the container", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);

    dragBy(text, 400, 0);
    const released = positionOf(text);
    dragBy(API.getElement(container), 0, 300);

    expect(positionOf(text)).toEqual(released);
  });

  it("4. picks up an element dragged fully into the container", () => {
    const container = makeContainer();
    const outside = API.createElement({
      id: "outside",
      type: "rectangle",
      x: 400,
      y: 50,
      width: 40,
      height: 40,
    });
    API.setElements([container, outside]);

    dragBy(outside, -300, 0);
    const joined = positionOf(outside);
    dragBy(API.getElement(container), 0, 300);

    expect(positionOf(outside)).toEqual({ x: joined.x, y: joined.y + 300 });
  });

  it("5. moves nested contents with the outermost container", () => {
    const container = makeContainer();
    const inner = API.createElement({
      id: "inner",
      type: "ellipse",
      x: 20,
      y: 20,
      width: 200,
      height: 160,
    });
    const innermost = API.createElement({
      id: "innermost",
      type: "diamond",
      x: 90,
      y: 70,
      width: 60,
      height: 60,
    });
    API.setElements([container, inner, innermost]);

    dragBy(container, 50, 50);

    expect(positionOf(inner)).toEqual({ x: 70, y: 70 });
    expect(positionOf(innermost)).toEqual({ x: 140, y: 120 });
  });

  it("6. moves a selected content element once when it is dragged with its container", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);
    API.setSelectedElements([container, text]);

    const startX = 150;
    const startY = 100;
    mouse.downAt(startX, startY);
    mouse.moveTo(startX + 30, startY + 10);
    mouse.up();

    expect(positionOf(container)).toEqual({ x: 30, y: 10 });
    expect(positionOf(text)).toEqual({ x: 70, y: 50 });
  });

  it("7. moves the contents when the container is nudged with the arrow keys", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);
    API.setSelectedElements([container]);

    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    Keyboard.keyPress(KEYS.ARROW_DOWN);

    const moved = positionOf(container);
    expect(moved.x).toBeGreaterThan(0);
    expect(moved.y).toBeGreaterThan(0);
    expect(positionOf(text)).toEqual({ x: 40 + moved.x, y: 40 + moved.y });
  });

  it("8. puts the container and its contents back with one undo", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);

    dragBy(container, 120, 80);
    Keyboard.undo();

    expect(positionOf(container)).toEqual({ x: 0, y: 0 });
    expect(positionOf(text)).toEqual({ x: 40, y: 40 });
  });

  it("9. changes only positions, so the file format stays upstream's", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);
    const keysBefore = Object.keys(API.getElement(text)).sort();

    dragBy(container, 120, 80);

    expect(Object.keys(API.getElement(text)).sort()).toEqual(keysBefore);
  });

  describe("10. leaves bound text, groups and frames working as before", () => {
    it("moves a contained shape's bound text once", () => {
      // createTextContainer places its shape at (0, 0), 100×100
      const container = API.createElement({
        id: "container",
        type: "rectangle",
        x: -50,
        y: -50,
        width: 300,
        height: 250,
      });
      const [labelled, label] = API.createTextContainer();
      API.setElements([container, labelled, label]);
      const labelBefore = positionOf(label);

      dragBy(container, 100, 50);

      expect(positionOf(container)).toEqual({ x: 50, y: 0 });
      expect(positionOf(labelled)).toEqual({ x: 100, y: 50 });
      expect(positionOf(label)).toEqual({
        x: labelBefore.x + 100,
        y: labelBefore.y + 50,
      });
    });

    it("leaves a group member behind together with its group when the group is not fully inside", () => {
      const container = makeContainer();
      const insideMember = API.createElement({
        id: "insideMember",
        type: "rectangle",
        x: 20,
        y: 20,
        width: 30,
        height: 30,
        groupIds: ["group"],
      });
      const outsideMember = API.createElement({
        id: "outsideMember",
        type: "rectangle",
        x: 400,
        y: 20,
        width: 30,
        height: 30,
        groupIds: ["group"],
      });
      API.setElements([container, insideMember, outsideMember]);

      dragBy(container, 0, 300);

      expect(positionOf(insideMember)).toEqual({ x: 20, y: 20 });
      expect(positionOf(outsideMember)).toEqual({ x: 400, y: 20 });
    });

    it("moves a group that is fully inside", () => {
      const container = makeContainer();
      const first = API.createElement({
        id: "first",
        type: "rectangle",
        x: 20,
        y: 20,
        width: 30,
        height: 30,
        groupIds: ["group"],
      });
      const second = API.createElement({
        id: "second",
        type: "rectangle",
        x: 80,
        y: 20,
        width: 30,
        height: 30,
        groupIds: ["group"],
      });
      API.setElements([container, first, second]);

      dragBy(container, 0, 300);

      expect(positionOf(first)).toEqual({ x: 20, y: 320 });
      expect(positionOf(second)).toEqual({ x: 80, y: 320 });
    });

    it("moves a frame's container and its contents once when the frame is dragged", () => {
      const frame = API.createElement({
        id: "frame",
        type: "frame",
        x: 0,
        y: 0,
        width: 500,
        height: 400,
      });
      const container = API.createElement({
        id: "container",
        type: "rectangle",
        x: 50,
        y: 50,
        width: 300,
        height: 200,
        frameId: "frame",
      });
      const text = API.createElement({
        id: "text",
        type: "text",
        text: "inside",
        x: 90,
        y: 90,
        width: 60,
        height: 20,
        frameId: "frame",
      });
      API.setElements([frame, container, text]);
      API.setSelectedElements([frame]);

      // drag the selected frame from an empty spot inside it
      mouse.downAt(450, 350);
      mouse.moveTo(550, 350);
      mouse.up();

      expect(positionOf(container)).toEqual({ x: 150, y: 50 });
      expect(positionOf(text)).toEqual({ x: 190, y: 90 });
    });

    it("takes the contents into a frame along with their container", () => {
      const frame = API.createElement({
        id: "frame",
        type: "frame",
        x: 600,
        y: 0,
        width: 500,
        height: 400,
      });
      const container = makeContainer();
      const text = makeTextInside();
      API.setElements([frame, container, text]);

      dragBy(container, 700, 100);

      expect(API.getElement(container).frameId).toBe("frame");
      expect(API.getElement(text).frameId).toBe("frame");
    });
  });

  it("keeps an arrow attached to a contained shape following it", () => {
    const container = makeContainer();
    const inner = API.createElement({
      id: "inner",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 60,
      height: 60,
    });
    const target = API.createElement({
      id: "target",
      type: "ellipse",
      x: 500,
      y: 50,
      width: 60,
      height: 60,
    });
    API.setElements([container, inner, target]);

    // draw an arrow from the contained shape to the outside shape
    Keyboard.keyPress(KEYS.A);
    mouse.downAt(80, 80);
    mouse.moveTo(530, 80);
    mouse.up();
    const arrow = h.elements.find((element) => element.type === "arrow")!;
    expect(arrow).toBeDefined();

    dragBy(API.getElement(container), 0, 100);

    // the start re-anchors on the moved shape's outline, facing the target
    const moved = API.getElement(arrow);
    expect((moved as any).startBinding?.elementId).toBe("inner");
    const movedInner = API.getElement(inner);
    expect(moved.y).toBeGreaterThanOrEqual(movedInner.y);
    expect(moved.y).toBeLessThanOrEqual(movedInner.y + movedInner.height);
    expect(movedInner.y).toBe(150);
  });

  it("alt-dragging a container alone takes its contents along and leaves an empty copy", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);
    API.setSelectedElements([container]);

    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.downAt(150, 100);
      mouse.moveTo(250, 100);
      mouse.up();
    });

    const texts = h.elements.filter(
      (element) => element.type === "text" && !element.isDeleted,
    );
    expect(texts).toHaveLength(1);
    expect(positionOf(text)).toEqual({ x: 140, y: 40 });
  });

  it("keeps dragging when alt-drag duplicates the selection", () => {
    const container = makeContainer();
    const text = makeTextInside();
    API.setElements([container, text]);
    API.setSelectedElements([container, text]);

    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.downAt(150, 100);
      mouse.moveTo(250, 100);
      mouse.up();
    });

    const rectangles = h.elements.filter(
      (element) => element.type === "rectangle" && !element.isDeleted,
    );
    expect(rectangles).toHaveLength(2);
    const xs = rectangles.map((rectangle) => rectangle.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 100]);
  });
});
