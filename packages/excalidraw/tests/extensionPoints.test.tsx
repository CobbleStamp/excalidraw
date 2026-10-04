/**
 * The host's extension points: custom tools in the "more tools" menu,
 * replacing the editor's response to editing an element, images that cannot
 * be cropped, stroke colours for elements whose type has none, revising
 * an action's elements within its undo step, and hiding a link's bar; the
 * eyedropper on a canvas it cannot read; and the tab the sidebar button
 * opens.
 */
import React from "react";

import { CODES, KEYS, reseed } from "@excalidraw/common";

import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  FileId,
  NonDeleted,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { actionToggleCropEditor } from "../actions/actionCropEditor";
import { actionChangeStrokeColor } from "../actions/actionProperties";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render, waitFor } from "./test-utils";

import type { CustomTool, ExcalidrawProps } from "../types";

const { h } = window;

const mouse = new Pointer("mouse");

const formulaTool: CustomTool = {
  customType: "formula",
  label: "Formula",
  icon: <svg data-testid="formula-icon" />,
  key: "m",
};

const renderEditor = async (props: Partial<ExcalidrawProps> = {}) => {
  await render(<Excalidraw handleKeyboardGlobally {...props} />);
};

const addImage = (): NonDeleted<ExcalidrawImageElement> => {
  const image = API.createElement({
    type: "image",
    x: 100,
    y: 100,
    width: 100,
    height: 60,
    fileId: "file-1" as FileId,
  }) as NonDeleted<ExcalidrawImageElement>;
  // kept as an undo step of its own, so undoing a later change keeps it
  API.updateScene({
    elements: [image],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return image;
};

const openExtraToolsMenu = () => {
  fireEvent.click(
    GlobalTestState.renderResult.container.querySelector(
      ".App-toolbar__extra-tools-trigger",
    )!,
  );
};

describe("extension points", () => {
  beforeEach(() => {
    localStorage.clear();
    reseed(7);
    mouse.reset();
  });

  afterEach(async () => {
    await act(async () => {});
  });

  describe("customTools", () => {
    it("lists a custom tool in the more tools menu and makes it active", async () => {
      await renderEditor({ customTools: [formulaTool] });

      openExtraToolsMenu();
      const item = document.querySelector<HTMLButtonElement>(
        '[data-testid="toolbar-custom-formula"]',
      )!;
      expect(item.textContent).toContain("Formula");
      expect(item.textContent).toContain("M");
      fireEvent.click(item);

      expect(h.state.activeTool).toMatchObject({
        type: "custom",
        customType: "formula",
      });
      // the menu's button shows the active tool's icon
      expect(
        GlobalTestState.renderResult.container.querySelector(
          ".App-toolbar__extra-tools-trigger [data-testid='formula-icon']",
        ),
      ).not.toBe(null);
    });

    it("chooses a custom tool with its key, and a click reaches the host without making an element", async () => {
      const onPointerDown = vi.fn();
      await renderEditor({ customTools: [formulaTool], onPointerDown });

      Keyboard.keyPress("m");
      expect(h.state.activeTool).toMatchObject({
        type: "custom",
        customType: "formula",
      });

      mouse.click(40, 50);
      expect(onPointerDown).toHaveBeenCalledWith(
        expect.objectContaining({ type: "custom", customType: "formula" }),
        expect.objectContaining({ origin: { x: 40, y: 50 } }),
      );
      expect(h.elements).toHaveLength(0);
    });

    it("ignores a custom tool's key in view mode", async () => {
      await renderEditor({ customTools: [formulaTool], viewModeEnabled: true });

      Keyboard.keyPress("m");
      expect(h.state.activeTool.type).not.toBe("custom");
    });
  });

  describe("onElementEdit", () => {
    it("replaces cropping on double-click and on Enter when it answers true", async () => {
      const onElementEdit = vi.fn(() => true);
      await renderEditor({ onElementEdit });
      const image = addImage();

      mouse.doubleClickOn(image);
      expect(onElementEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: image.id }),
      );
      expect(h.state.croppingElementId).toBe(null);

      onElementEdit.mockClear();
      API.setSelectedElements([image]);
      Keyboard.keyPress(KEYS.ENTER);
      expect(onElementEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: image.id }),
      );
      expect(h.state.croppingElementId).toBe(null);
    });

    it("leaves the editor's own response when it answers false", async () => {
      const onElementEdit = vi.fn(() => false);
      await renderEditor({ onElementEdit });
      const image = addImage();

      API.setSelectedElements([image]);
      Keyboard.keyPress(KEYS.ENTER);
      expect(onElementEdit).toHaveBeenCalled();
      expect(h.state.croppingElementId).toBe(image.id);
    });

    it("is not asked in view mode", async () => {
      const onElementEdit = vi.fn(() => true);
      await renderEditor({ onElementEdit, viewModeEnabled: true });
      const image = addImage();

      mouse.doubleClickOn(image);
      expect(onElementEdit).not.toHaveBeenCalled();
    });
  });

  describe("isImageCroppable", () => {
    it("offers no crop for an image it refuses, by any way in", async () => {
      await renderEditor({ isImageCroppable: () => false });
      const image = addImage();
      API.setSelectedElements([image]);

      expect(h.app.actionManager.isActionEnabled(actionToggleCropEditor)).toBe(
        false,
      );
      expect(document.querySelector('[title="Crop image"]')).toBe(null);

      Keyboard.keyPress(KEYS.ENTER);
      expect(h.state.croppingElementId).toBe(null);
      mouse.doubleClickOn(image);
      expect(h.state.croppingElementId).toBe(null);
    });

    it("leaves a double-click on empty canvas to make text, with an image it refuses selected", async () => {
      await renderEditor({ isImageCroppable: () => false });
      API.setSelectedElements([addImage()]);

      mouse.doubleClickAt(500, 500);
      expect(h.state.croppingElementId).toBe(null);
      expect(h.state.editingTextElement).not.toBe(null);
    });

    it("hints at cropping only an image it accepts", async () => {
      const croppable = { value: true };
      await renderEditor({ isImageCroppable: () => croppable.value });
      const image = addImage();
      const hint = () =>
        h.app.ownerDocument.querySelector(".HintViewer")?.textContent ?? "";

      API.setSelectedElements([image]);
      expect(hint()).toContain("crop");

      croppable.value = false;
      API.setSelectedElements([]);
      API.setSelectedElements([image]);
      expect(hint()).not.toContain("crop");
    });

    it("still crops an image it accepts", async () => {
      await renderEditor({ isImageCroppable: () => true });
      const image = addImage();
      API.setSelectedElements([image]);

      expect(h.app.actionManager.isActionEnabled(actionToggleCropEditor)).toBe(
        true,
      );
      Keyboard.keyPress(KEYS.ENTER);
      expect(h.state.croppingElementId).toBe(image.id);
    });
  });

  describe("takesStrokeColor", () => {
    it("lets a stroke colour change an image it accepts", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
      });
      const image = addImage();
      API.setSelectedElements([image]);

      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          color: "#e03131",
        });
      });
      expect(h.elements[0].strokeColor).toBe("#e03131");
    });

    it("changes a mixed selection of an accepted image and a shape", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
      });
      const image = addImage();
      const rectangle = API.createElement({ type: "rectangle", x: 300 });
      API.setElements([image, rectangle]);
      API.setSelectedElements([image, rectangle]);

      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          color: "#e03131",
        });
      });
      expect(h.elements.map((element) => element.strokeColor)).toEqual([
        "#e03131",
        "#e03131",
      ]);
    });

    it("leaves images alone without it", async () => {
      await renderEditor();
      const image = addImage();
      API.setSelectedElements([image]);

      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          color: "#e03131",
        });
      });
      expect(h.elements[0].strokeColor).toBe(image.strokeColor);
    });

    it("shows the stroke colour picker for a selection it accepts", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
      });
      API.setSelectedElements([addImage()]);

      expect(
        document.querySelector('[data-testid="color-top-pick-#e03131"]'),
      ).not.toBe(null);
    });
  });

  describe("reviseActionElements", () => {
    // follows an image's stroke colour into its customData
    const recordColor = (elements: readonly ExcalidrawElement[]) =>
      elements.map((element) =>
        element.type === "image" &&
        element.customData?.color !== element.strokeColor
          ? newElementWith(element, {
              customData: { color: element.strokeColor },
            })
          : element,
      );

    it("revises an action's elements in the same undo step", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
        reviseActionElements: recordColor,
      });
      const image = addImage();
      API.setSelectedElements([image]);

      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          color: "#e03131",
        });
      });
      expect(h.elements[0].customData).toEqual({ color: "#e03131" });

      Keyboard.undo();
      expect(h.elements[0].strokeColor).toBe(image.strokeColor);
      expect(h.elements[0].customData).toEqual({ color: image.strokeColor });
    });

    it("revises a colour pasted with paste styles", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
        reviseActionElements: recordColor,
      });
      const image = addImage();
      const red = API.createElement({
        type: "rectangle",
        x: 300,
        strokeColor: "#e03131",
      });
      API.setElements([image, red]);

      API.setSelectedElements([red]);
      Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
        Keyboard.codeDown(CODES.C);
      });
      API.setSelectedElements([h.elements[0] as typeof image]);
      Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
        Keyboard.codeDown(CODES.V);
      });

      expect(h.elements[0].strokeColor).toBe("#e03131");
      expect(h.elements[0].customData).toEqual({ color: "#e03131" });
    });

    it("returns elements it leaves alone unchanged", async () => {
      const reviseActionElements = vi.fn(recordColor);
      await renderEditor({ reviseActionElements });
      const rectangle = API.createElement({ type: "rectangle" });
      API.setElements([rectangle]);
      API.setSelectedElements([rectangle]);

      act(() => {
        h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", {
          color: "#e03131",
        });
      });
      expect(reviseActionElements).toHaveBeenCalled();
      expect(h.elements[0].strokeColor).toBe("#e03131");
      expect(h.elements[0].customData).toBeUndefined();
    });

    it("revises a colour picked with the eyedropper", async () => {
      await renderEditor({
        takesStrokeColor: (element) => element.type === "image",
        reviseActionElements: recordColor,
      });
      API.setSelectedElements([addImage()]);

      const context = h.app.canvas.getContext("2d")!;
      vi.spyOn(context, "getImageData").mockReturnValue({
        data: new Uint8ClampedArray([18, 18, 18, 255]),
      } as ImageData);
      Keyboard.withModifierKeys({ shift: true }, () => {
        Keyboard.keyPress(KEYS.S);
      });
      const backdrop = await waitFor(() => {
        const element =
          GlobalTestState.renderResult.container.querySelector<HTMLDivElement>(
            ".excalidraw-eye-dropper-backdrop",
          );
        expect(element).not.toBeNull();
        return element!;
      });
      fireEvent.pointerUp(backdrop, { clientX: 50, clientY: 50 });

      expect(h.elements[0].strokeColor).toBe("#121212");
      expect(h.elements[0].customData).toEqual({ color: "#121212" });
    });
  });

  describe("hidesLinkInfo", () => {
    const selectLinkedRectangle = () => {
      const rectangle = {
        ...API.createElement({ type: "rectangle", x: 0, y: 0 }),
        link: "https://example.com",
      };
      API.setElements([rectangle]);
      API.setSelectedElements([rectangle]);
    };
    const linkBar = () =>
      GlobalTestState.renderResult.container.querySelector(
        ".excalidraw-hyperlinkContainer",
      );
    const linkEditor = () =>
      GlobalTestState.renderResult.container.querySelector(
        ".excalidraw-hyperlinkContainer-input",
      );

    it("hides the link's bar of an element it answers true for", async () => {
      await renderEditor({ hidesLinkInfo: () => true });
      selectLinkedRectangle();
      act(() => h.setState({ showHyperlinkPopup: "info" }));
      expect(linkBar()).toBeNull();
    });

    it("still shows the link editor", async () => {
      await renderEditor({ hidesLinkInfo: () => true });
      selectLinkedRectangle();
      act(() => h.setState({ showHyperlinkPopup: "editor" }));
      expect(linkEditor()).not.toBeNull();
    });

    it("shows the link's bar of an element it answers false for", async () => {
      await renderEditor({ hidesLinkInfo: () => false });
      selectLinkedRectangle();
      act(() => h.setState({ showHyperlinkPopup: "info" }));
      expect(linkBar()).not.toBeNull();
    });
  });

  describe("the eyedropper", () => {
    it("says it cannot read a canvas the browser forbids reading, and stops", async () => {
      await renderEditor();
      const rectangle = API.createElement({ type: "rectangle", x: 0, y: 0 });
      API.setElements([rectangle]);
      API.setSelectedElements([rectangle]);
      const context = h.app.canvas.getContext("2d")!;
      vi.spyOn(context, "getImageData").mockImplementation(() => {
        throw new DOMException("tainted", "SecurityError");
      });
      Keyboard.withModifierKeys({ shift: true }, () => {
        Keyboard.keyPress(KEYS.S);
      });
      await waitFor(() =>
        expect(h.state.toast?.message).toMatch(/eyedropper can't read/),
      );
      expect(
        GlobalTestState.renderResult.container.querySelector(
          ".excalidraw-eye-dropper-backdrop",
        ),
      ).toBeNull();
    });
  });

  describe("defaultSidebarTab", () => {
    const openSidebar = () =>
      fireEvent.click(
        GlobalTestState.renderResult.container
          .querySelector(".default-sidebar-trigger")!
          .closest("button")!,
      );

    it("opens the sidebar on the host's tab", async () => {
      await render(<Excalidraw defaultSidebarTab="search" />);
      openSidebar();
      expect(h.state.openSidebar).toEqual({ name: "default", tab: "search" });
    });

    it("opens it on the library when unset", async () => {
      await render(<Excalidraw />);
      openSidebar();
      expect(h.state.openSidebar).toEqual({ name: "default", tab: "library" });
    });
  });
});
