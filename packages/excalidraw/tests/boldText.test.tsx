/**
 * Bold text: the Bold toggle and Ctrl/Cmd+B on selected text, the text of
 * shapes, sticky notes and lines, and edited text, the bold new text takes, copying it with styles, keeping it
 * through a save and reopen, and exporting it to SVG with the bold faces it
 * needs.
 */
import React from "react";

import {
  CODES,
  FONT_FAMILY,
  KEYS,
  getFontString,
  getLineHeight,
} from "@excalidraw/common";

import { measureText } from "@excalidraw/element";

import type {
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { restoreElements } from "../data/restore";
import * as exportUtils from "../scene/export";

import { textFixture } from "./fixtures/elementFixture";
import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { getTextEditor, updateTextEditor } from "./queries/dom";
import { act, fireEvent, render, screen } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const pressBoldShortcut = (): void => {
  const pressB = (): void => {
    Keyboard.keyPress(KEYS.B);
  };
  Keyboard.withModifierKeys({ ctrl: true }, pressB);
};

const textById = (id: string): ExcalidrawTextElement =>
  h.elements.find((element) => element.id === id) as ExcalidrawTextElement;

describe("bold text", () => {
  beforeEach(async () => {
    localStorage.clear();
    mouse.reset();
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  afterEach(async () => {
    await act(async () => {});
  });

  it("puts bold in the font a text is measured and drawn with", () => {
    const regular = getFontString({
      fontSize: 20,
      fontFamily: FONT_FAMILY.Nunito,
    });
    const bold = getFontString({
      fontSize: 20,
      fontFamily: FONT_FAMILY.Nunito,
      bold: true,
    });

    expect(bold).toBe(`bold ${regular}`);
  });

  it("measures a bold text as tall as a regular one, reading its size past the weight", () => {
    const font = (bold: boolean) =>
      getFontString({ fontSize: 20, fontFamily: FONT_FAMILY.Nunito, bold });
    const lineHeight = getLineHeight(FONT_FAMILY.Nunito);

    const regular = measureText("Two\nlines", font(false), lineHeight);
    const bold = measureText("Two\nlines", font(true), lineHeight);

    expect(bold.height).toBe(regular.height);
    expect(bold.height).toBeGreaterThan(0);
  });

  it("makes the selected text bold with Ctrl/Cmd+B, and regular again", () => {
    const text = API.createElement({ type: "text", text: "Headline" });
    API.setElements([text]);
    API.setSelectedElements([text]);

    pressBoldShortcut();
    expect(textById(text.id).bold).toBe(true);
    expect(h.state.currentItemBold).toBe(true);

    pressBoldShortcut();
    expect(textById(text.id).bold).toBe(false);
    expect(h.state.currentItemBold).toBe(false);
  });

  it("turns a selection that is partly bold all bold first", () => {
    const regular = API.createElement({ type: "text", text: "regular" });
    const bold = API.createElement({ type: "text", text: "bold", bold: true });
    API.setElements([regular, bold]);
    API.setSelectedElements([regular, bold]);

    pressBoldShortcut();

    expect(textById(regular.id).bold).toBe(true);
    expect(textById(bold.id).bold).toBe(true);
  });

  it("makes a shape's text bold when the shape is selected", () => {
    const [container, label] = API.createTextContainer({
      label: { text: "Order" },
    });
    API.setElements([container, label]);
    API.setSelectedElements([container]);

    pressBoldShortcut();

    expect(textById(label.id).bold).toBe(true);
  });

  it("makes a sticky note's text bold when the note is selected", () => {
    const note = API.createElement({
      type: "stickynote",
      id: "note",
      boundElements: [{ type: "text", id: "note-label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "note-label",
      text: "Remember",
      containerId: note.id,
    });
    API.setElements([note, label]);
    API.setSelectedElements([note]);

    pressBoldShortcut();

    expect(textById(label.id).bold).toBe(true);
  });

  it("makes a line's label bold when the line is selected", () => {
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      boundElements: [{ type: "text", id: "arrow-label" }],
    });
    const label = API.createElement({
      type: "text",
      id: "arrow-label",
      text: "calls",
      containerId: arrow.id,
    });
    API.setElements([arrow, label]);
    API.setSelectedElements([arrow]);

    pressBoldShortcut();

    expect(textById(label.id).bold).toBe(true);
  });

  it("shows the Bold button on for bold text, and toggles it", () => {
    const text = API.createElement({ type: "text", text: "Headline" });
    API.setElements([text]);
    API.setSelectedElements([text]);

    const button = (): HTMLElement => screen.getByTestId("text-bold");
    expect(button()).not.toHaveClass("active");

    fireEvent.click(button());

    expect(textById(text.id).bold).toBe(true);
    expect(button()).toHaveClass("active");
  });

  it("writes new text bold once bold was turned on", async () => {
    UI.clickTool("text");
    fireEvent.click(screen.getByTestId("text-bold"));
    expect(h.state.currentItemBold).toBe(true);

    mouse.clickAt(100, 100);
    const editor = await getTextEditor();
    updateTextEditor(editor, "New");
    Keyboard.exitTextEditor(editor);

    const created = h.elements[h.elements.length - 1] as ExcalidrawTextElement;
    expect(created.text).toBe("New");
    expect(created.bold).toBe(true);
  });

  it("toggles the text being edited with Ctrl/Cmd+B, keeping the browser's own shortcut from running", async () => {
    const text = API.createElement({ type: "text", text: "Headline" });
    API.setElements([text]);
    UI.clickTool("selection");
    mouse.doubleClickOn(text);
    const editor = await getTextEditor();

    const notPrevented: boolean = fireEvent.keyDown(editor, {
      key: KEYS.B,
      ctrlKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(textById(text.id).bold).toBe(true);
    expect(["bold", "700"]).toContain(editor.style.fontWeight);
  });

  it("copies bold with the other styles", () => {
    const source = API.createElement({
      type: "text",
      text: "source",
      bold: true,
    });
    const target = API.createElement({ type: "text", text: "target" });
    API.setElements([source, target]);

    const pressCopyStyles = (): void => {
      Keyboard.codeDown(CODES.C);
    };
    const pressPasteStyles = (): void => {
      Keyboard.codeDown(CODES.V);
    };
    API.setSelectedElements([source] as NonDeletedExcalidrawElement[]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, pressCopyStyles);
    API.setSelectedElements([target] as NonDeletedExcalidrawElement[]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, pressPasteStyles);

    expect(textById(target.id).bold).toBe(true);
  });

  it("keeps bold through a save and reopen, and opens a bold that is not true or false as regular", () => {
    const [kept, unknown, plain] = restoreElements(
      [
        { ...textFixture, id: "kept", bold: true },
        { ...textFixture, id: "unknown", bold: "yes" },
        { ...textFixture, id: "plain" },
      ] as unknown as ExcalidrawTextElement[],
      null,
    ) as ExcalidrawTextElement[];

    expect(kept.bold).toBe(true);
    expect("bold" in unknown).toBe(false);
    expect("bold" in plain).toBe(false);
  });
});

describe("bold text in SVG export", () => {
  const nunitoText = {
    ...textFixture,
    fontFamily: FONT_FAMILY.Nunito,
    index: "a0",
  } as NonDeletedExcalidrawElement;
  const options = {
    exportBackground: false,
    viewBackgroundColor: "#ffffff",
    files: {},
  };

  it("draws bold text bold and embeds the family's bold faces", async () => {
    const svg: SVGSVGElement = await exportUtils.exportToSvg(
      [{ ...nunitoText, bold: true } as NonDeletedExcalidrawElement],
      options,
      null,
    );

    expect(svg.querySelector("text")?.getAttribute("font-weight")).toBe("bold");
    expect(svg.innerHTML).toContain("font-family: Nunito; font-weight: 700;");
  });

  it("leaves the bold faces out when no text is bold", async () => {
    const svg: SVGSVGElement = await exportUtils.exportToSvg(
      [nunitoText],
      options,
      null,
    );

    expect(svg.querySelector("text")?.hasAttribute("font-weight")).toBe(false);
    expect(svg.innerHTML).toContain("font-family: Nunito; font-weight: 500;");
    expect(svg.innerHTML).not.toContain("font-weight: 700");
  });
});
