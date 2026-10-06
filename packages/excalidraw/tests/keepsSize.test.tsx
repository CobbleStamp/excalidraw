/**
 * Containers that keep their size (`keepsSize`) and containers that do not
 * wrap their text (`wrapsText: false`): their text never resizes them, on
 * any path, and text past their outline is hidden on the canvas and in SVG.
 */
import React from "react";

import { arrayToMap, KEYS, VERTICAL_ALIGN } from "@excalidraw/common";
import { exportToCanvas } from "@excalidraw/utils";

import {
  computeBoundTextPosition,
  getContainerCoords,
  getKeptSizeHolders,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElementWithContainer,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { getTextEditor, updateTextEditor } from "./queries/dom";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

unmountComponent();

const LONG_TEXT = new Array(40).fill("line").join("\n");
const WIDE_TEXT = new Array(40).fill("word").join(" ");

const typeInto = async (
  container: NonDeletedExcalidrawElement,
  text: string,
) => {
  API.setSelectedElements([container]);
  Keyboard.keyPress(KEYS.ENTER);
  const editor = await getTextEditor();
  updateTextEditor(editor, text);
  Keyboard.exitTextEditor(editor);
};

const boundTextOf = (container: ExcalidrawElement) =>
  h.elements.find(
    (element) =>
      element.type === "text" && element.containerId === container.id,
  ) as ExcalidrawTextElementWithContainer;

describe("a container that keeps its size", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setElements([]);
  });

  it("does not grow while its text is typed, nor after", async () => {
    const cell = {
      ...API.createElement({
        type: "rectangle",
        width: 160,
        height: 60,
      }),
      keepsSize: true,
    };
    API.setElements([cell]);
    API.setSelectedElements([cell]);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await getTextEditor();
    updateTextEditor(editor, LONG_TEXT);

    expect(h.elements[0].height).toBe(60);
    // the editor stays inside the container
    expect(parseFloat(editor.style.height)).toBeLessThanOrEqual(60);

    Keyboard.exitTextEditor(editor);
    expect(h.elements[0]).toMatchObject({ width: 160, height: 60 });
    expect(boundTextOf(cell).height).toBeGreaterThan(60);
  });

  it("grows like any container without the property", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      width: 160,
      height: 60,
    });
    API.setElements([rectangle]);
    await typeInto(rectangle, LONG_TEXT);

    expect(h.elements[0].height).toBeGreaterThan(60);
  });

  it("keeps its size when its text is laid out again, as a font change or undo does", async () => {
    const cell = {
      ...API.createElement({
        type: "ellipse",
        width: 160,
        height: 60,
      }),
      keepsSize: true,
    };
    API.setElements([cell]);
    await typeInto(cell, "short");

    const text = boundTextOf(cell);
    h.app.scene.mutateElement(text, { originalText: LONG_TEXT, fontSize: 40 });
    redrawTextBoundingBox(text, h.elements[0], h.app.scene);
    expect(h.elements[0]).toMatchObject({ width: 160, height: 60 });

    Keyboard.undo();
    Keyboard.redo();
    expect(h.elements[0]).toMatchObject({ width: 160, height: 60 });
  });

  it("shows the first lines and the start of lines of text that overflows it", () => {
    const cell = {
      ...API.createElement({
        type: "rectangle",
        width: 160,
        height: 60,
      }),
      keepsSize: true,
    };
    const text = API.createElement({
      type: "text",
      text: LONG_TEXT,
      containerId: cell.id,
      verticalAlign: VERTICAL_ALIGN.MIDDLE,
      textAlign: "center",
      width: 400,
      height: 900,
    }) as ExcalidrawTextElementWithContainer;
    const elementsMap = arrayToMap<ExcalidrawElement>([cell, text]);

    expect(computeBoundTextPosition(cell, text, elementsMap)).toEqual(
      getContainerCoords(cell),
    );
  });

  it("hides text past its outline on the canvas", async () => {
    const draw = async (keepsSize: boolean) => {
      const cell = {
        ...API.createElement({
          type: "diamond",
          width: 160,
          height: 60,
        }),
        keepsSize,
      };
      const text = API.createElement({
        type: "text",
        text: LONG_TEXT,
        containerId: cell.id,
      });
      const canvas = await exportToCanvas({
        elements: [
          { ...cell, boundElements: [{ type: "text", id: text.id }] },
          text,
        ],
        files: {},
      });
      return canvas.getContext("2d")!.clip as unknown as {
        mock: { calls: unknown[] };
      };
    };

    expect((await draw(true)).mock.calls.length).toBe(1);
    expect((await draw(false)).mock.calls.length).toBe(0);
  });

  it("hides text past its outline in SVG", async () => {
    const cell = {
      ...API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 160,
        height: 60,
      }),
      keepsSize: true,
    };
    const text = API.createElement({
      type: "text",
      text: LONG_TEXT,
      containerId: cell.id,
    });
    const svg = await exportToSvg(
      [{ ...cell, boundElements: [{ type: "text", id: text.id }] }, text],
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      {},
    );

    const clipPath = svg.querySelector("clipPath[id^='outline-']")!;
    expect(clipPath.querySelector("polygon")).not.toBeNull();
    const group = svg.querySelector(`g[clip-path="url(#${clipPath.id})"]`)!;
    expect(group.querySelector("text")).not.toBeNull();
  });
});

describe("what a container that keeps its size holds", () => {
  const cellWith = (keepsSize: boolean) => ({
    ...API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 160,
      height: 60,
    }),
    keepsSize,
  });
  const inside = () =>
    API.createElement({
      type: "ellipse",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    });

  it("is the elements the container carries when it moves", () => {
    const cell = cellWith(true);
    const held = inside();
    const across = API.createElement({
      type: "ellipse",
      x: 140,
      y: 10,
      width: 40,
      height: 40,
    });
    const holders = getKeptSizeHolders(arrayToMap([cell, held, across]));

    expect(holders.get(held.id)).toEqual([cell]);
    expect(holders.has(across.id)).toBe(false);
    expect(getKeptSizeHolders(arrayToMap([cellWith(false), held])).size).toBe(
      0,
    );
  });

  it("is hidden past its outline on the canvas", async () => {
    const clipsDrawing = async (keepsSize: boolean) => {
      const canvas = await exportToCanvas({
        elements: [cellWith(keepsSize), inside()],
        files: {},
      });
      return (
        canvas.getContext("2d")!.clip as unknown as {
          mock: { calls: unknown[] };
        }
      ).mock.calls.length;
    };

    expect(await clipsDrawing(true)).toBe(1);
    expect(await clipsDrawing(false)).toBe(0);
  });

  it("is hidden past its outline in SVG", async () => {
    const cell = cellWith(true);
    const held = inside();
    const svg = await exportToSvg(
      [cell, held],
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      {},
    );

    const group = svg.querySelector(
      `g[clip-path="url(#outline-${cell.id}-${held.id})"]`,
    );
    expect(group?.querySelector("path, ellipse")).not.toBeNull();
    expect(svg.querySelector(`#outline-${cell.id}-${held.id}`)).not.toBeNull();
  });
});

describe("a container that does not wrap its text", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setElements([]);
  });

  it("keeps each paragraph on one line", async () => {
    const cell = {
      ...API.createElement({
        type: "rectangle",
        width: 160,
        height: 60,
      }),
      keepsSize: true,
      wrapsText: false,
    };
    API.setElements([cell]);
    API.setSelectedElements([cell]);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await getTextEditor();
    expect(editor.style.whiteSpace).toBe("pre");
    updateTextEditor(editor, WIDE_TEXT);
    Keyboard.exitTextEditor(editor);

    expect(boundTextOf(cell).text).toBe(WIDE_TEXT);
    expect(h.elements[0]).toMatchObject({ width: 160, height: 60 });
  });

  it("wraps like any container without the property", async () => {
    const cell = {
      ...API.createElement({
        type: "rectangle",
        width: 160,
        height: 60,
      }),
      keepsSize: true,
    };
    API.setElements([cell]);
    await typeInto(cell, WIDE_TEXT);

    expect(boundTextOf(cell).text).toContain("\n");
  });
});
