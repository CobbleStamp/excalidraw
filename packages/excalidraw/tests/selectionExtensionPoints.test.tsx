/**
 * The host's say over a selection: which transform handles it offers,
 * refusing to move it by dragging or the arrow keys, a click on a member
 * of a selected group selecting that member alone, and opening a
 * container's text for editing.
 */
import React from "react";

import { KEYS } from "@excalidraw/common";

import type {
  ExcalidrawTextContainer,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { getTextEditor } from "./queries/dom";
import { act, render, screen, unmountComponent } from "./test-utils";

import type { ExcalidrawProps } from "../types";

const { h } = window;

const mouse = new Pointer("mouse");

unmountComponent();

const renderWith = async (props: Partial<ExcalidrawProps>) => {
  await render(<Excalidraw handleKeyboardGlobally={true} {...props} />);
  API.setElements([]);
};

const rectangleAt = (x: number) =>
  API.createElement({
    type: "rectangle",
    x,
    y: 0,
    width: 100,
    height: 50,
    backgroundColor: "#ffc9c9",
  });

describe("transformHandlesOf", () => {
  it("offers no handle: a corner neither resizes nor a rotation rotates", async () => {
    await renderWith({ transformHandlesOf: () => "none" });
    const rectangle = rectangleAt(0);
    API.setElements([rectangle]);

    UI.resize(rectangle, "se", [50, 50]);
    UI.rotate(rectangle, [50, 50]);

    expect(h.elements[0]).toMatchObject({ width: 100, height: 50, angle: 0 });
  });

  it("offers only rotation: a corner does not resize, rotation rotates", async () => {
    await renderWith({ transformHandlesOf: () => "rotation" });
    const rectangle = rectangleAt(0);
    API.setElements([rectangle]);

    UI.resize(rectangle, "se", [50, 50]);
    expect(h.elements[0]).toMatchObject({ width: 100, height: 50 });

    UI.rotate(rectangle, [50, 50]);
    expect(h.elements[0].angle).not.toBe(0);
  });

  it("is asked about the whole selection, and a multiple one rotates as one", async () => {
    const asked: number[] = [];
    await renderWith({
      transformHandlesOf: (selected) => {
        asked.push(selected.length);
        return selected.length > 1 ? "rotation" : "all";
      },
    });
    const left = rectangleAt(0);
    const right = rectangleAt(200);
    API.setElements([left, right]);

    UI.resize([left, right], "se", [50, 50]);
    expect(h.elements.map((element) => element.width)).toEqual([100, 100]);

    UI.rotate([left, right], [50, 50]);
    expect(h.elements.every((element) => element.angle !== 0)).toBe(true);
    expect(asked).toContain(2);
  });

  it("offers every handle when the host gives no answer", async () => {
    await renderWith({});
    const rectangle = rectangleAt(0);
    API.setElements([rectangle]);

    UI.resize(rectangle, "se", [50, 50]);

    expect(h.elements[0].width).toBe(150);
  });
});

describe("refusesDrag", () => {
  it("keeps a refused selection in place under a drag and the arrow keys", async () => {
    await renderWith({
      refusesDrag: (selected: readonly NonDeletedExcalidrawElement[]) =>
        selected.some((element) => element.id === "fixed"),
    });
    const fixed = { ...rectangleAt(0), id: "fixed" };
    const free = rectangleAt(200);
    API.setElements([fixed, free]);

    mouse.select(fixed);
    mouse.down(10, 10);
    mouse.up(60, 60);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(h.elements[0]).toMatchObject({ x: 0, y: 0 });

    mouse.select(free);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(h.elements[1].x).toBeGreaterThan(200);
  });
});

describe("refusesDrag, released", () => {
  it("is no click: the selection the host set during the drag stays", async () => {
    await renderWith({ refusesDrag: () => true });
    const pressed = rectangleAt(0);
    const other = rectangleAt(200);
    API.setElements([pressed, other]);
    mouse.select(pressed);

    mouse.downAt(50, 25);
    mouse.moveTo(90, 25);
    API.setSelectedElements([other]);
    mouse.upAt(90, 25);

    expect(h.state.selectedElementIds).toEqual({ [other.id]: true });
    expect(h.elements[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe("entersGroupOnClick", () => {
  const groupOfTwo = () => {
    const left = { ...rectangleAt(0), groupIds: ["matrix"] };
    const right = { ...rectangleAt(100), groupIds: ["matrix"] };
    API.setElements([left, right]);
    return [left, right];
  };

  it("selects the group first, then the member clicked", async () => {
    await renderWith({ entersGroupOnClick: () => true });
    const [, right] = groupOfTwo();

    mouse.clickAt(150, 25);
    expect(Object.keys(h.state.selectedElementIds)).toHaveLength(2);

    mouse.clickAt(150, 25);
    expect(h.state.editingGroupId).toBe("matrix");
    expect(h.state.selectedElementIds).toEqual({ [right.id]: true });
  });

  it("still moves the selected group when pressed and dragged", async () => {
    await renderWith({ entersGroupOnClick: () => true });
    groupOfTwo();

    mouse.clickAt(150, 25);
    mouse.downAt(150, 25);
    mouse.moveTo(170, 25);
    mouse.upAt(170, 25);

    expect(h.state.editingGroupId).toBe(null);
    expect(h.elements.map((element) => element.x)).toEqual([20, 120]);
  });

  it("keeps the group selected without the host's answer", async () => {
    await renderWith({});
    groupOfTwo();

    mouse.clickAt(150, 25);
    mouse.clickAt(150, 25);

    expect(h.state.editingGroupId).toBe(null);
    expect(Object.keys(h.state.selectedElementIds)).toHaveLength(2);
  });
});

describe("startTextEditing", () => {
  const cellWithText = async (text: string) => {
    const cell = rectangleAt(0) as ExcalidrawTextContainer;
    API.setElements([cell]);
    await act(async () => {
      h.app.api.startTextEditing(cell, text);
    });
    Keyboard.exitTextEditor(await getTextEditor());
    return cell;
  };

  it("opens a container's text with the caret at its end", async () => {
    await renderWith({});
    const cell = await cellWithText("hello");

    act(() => h.app.api.startTextEditing(cell));
    const editor = await getTextEditor();

    expect(editor.value).toBe("hello");
    expect(editor.selectionStart).toBe(5);
    expect(editor.selectionEnd).toBe(5);
  });

  it("replaces the text when given", async () => {
    await renderWith({});
    const cell = await cellWithText("hello");

    act(() => h.app.api.startTextEditing(cell, "w"));
    const editor = await getTextEditor();
    expect(editor.value).toBe("w");
    Keyboard.exitTextEditor(editor);

    const text = h.elements.find((element) => element.type === "text");
    expect(text).toMatchObject({ originalText: "w", containerId: cell.id });
  });

  it("does not grow a small container that keeps its size", async () => {
    await renderWith({});
    const cell = {
      ...API.createElement({ type: "rectangle", width: 20, height: 20 }),
      keepsSize: true,
    } as ExcalidrawTextContainer;
    API.setElements([cell]);

    act(() => h.app.api.startTextEditing(cell, "x"));
    Keyboard.exitTextEditor(await getTextEditor());

    expect(h.elements[0]).toMatchObject({ width: 20, height: 20 });
  });
});

describe("shapePanelSections", () => {
  it("shows the host's sections in the selected shapes' panel, given the selection", async () => {
    const seen: number[] = [];
    await renderWith({
      shapePanelSections: (selected) => {
        seen.push(selected.length);
        return <div data-testid="host-section">{selected.length} chosen</div>;
      },
    });
    const left = rectangleAt(0);
    const right = rectangleAt(200);
    API.setElements([left, right]);

    expect(screen.queryByTestId("host-section")).toBeNull();
    API.setSelectedElements([left, right]);

    expect((await screen.findByTestId("host-section")).textContent).toBe(
      "2 chosen",
    );
    expect(seen).toContain(2);
  });
});
