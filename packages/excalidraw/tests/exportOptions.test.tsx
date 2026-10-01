/**
 * The host's export options: switches in the image export dialog that change
 * what is exported, and exporting exactly a rectangle of the scene; and the
 * host's own sections of the library panel.
 */
import React from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { exportToCanvas } from "../scene/export";
import { DEFAULT_SIDEBAR, LIBRARY_SIDEBAR_TAB } from "@excalidraw/common";
import { getDefaultAppState } from "../appState";

import { API } from "./helpers/api";
import { act, fireEvent, render, waitFor } from "./test-utils";

import type { AppState, ImageExportOption } from "../types";

const { h } = window;

const withoutEllipses = () =>
  vi.fn(
    (
      elements: readonly NonDeletedExcalidrawElement[],
      switchChecked: boolean,
    ) =>
      switchChecked
        ? elements
        : elements.filter((element) => element.type !== "ellipse"),
  );

const openImageExport = async (options: readonly ImageExportOption[]) => {
  await render(<Excalidraw imageExportOptions={options} />);
  API.setElements([
    API.createElement({ type: "rectangle", x: 0, y: 0 }),
    API.createElement({ type: "ellipse", x: 200, y: 0 }),
  ]);
  act(() => {
    h.setState({ openDialog: { name: "imageExport" } });
  });
};

describe("image export options", () => {
  it("shows the host's switch, and each export passes through it", async () => {
    const exportedElements = withoutEllipses();
    await openImageExport([
      {
        name: "ellipses",
        label: "Ellipses",
        defaultChecked: true,
        exportedElements,
      },
    ]);
    const toggle = document.querySelector<HTMLInputElement>(
      'input[name="ellipses"]',
    )!;
    expect(toggle.checked).toBe(true);
    expect(exportedElements).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: "ellipse" })]),
      true,
    );

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="ellipses"]')!
          .checked,
      ).toBe(false),
    );
    expect(exportedElements).toHaveBeenLastCalledWith(expect.any(Array), false);
    const lastResult: readonly NonDeletedExcalidrawElement[] =
      exportedElements.mock.results.at(-1)!.value;
    expect(lastResult.map((element) => element.type)).toEqual(["rectangle"]);
  });

  it("hides a switch that does not apply to what is exported", async () => {
    await openImageExport([
      {
        name: "diamonds",
        label: "Diamonds",
        defaultChecked: true,
        appliesTo: (elements) =>
          elements.some((element) => element.type === "diamond"),
        exportedElements: (elements) => elements,
      },
    ]);
    expect(document.querySelector(".ImageExportModal")).not.toBeNull();
    expect(document.querySelector('input[name="diamonds"]')).toBeNull();
  });
});

describe("exporting a rectangle of the scene", () => {
  it("makes the canvas the rectangle's size, wherever the elements reach", async () => {
    const elements = [
      API.createElement({ type: "rectangle", x: 0, y: 0, width: 100 }),
      API.createElement({ type: "rectangle", x: 900, y: 900, width: 100 }),
    ] as NonDeletedExcalidrawElement[];
    const createCanvas = vi.fn((width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return { canvas, scale: 1 };
    });
    const canvas = await exportToCanvas(
      elements,
      { ...getDefaultAppState(), exportScale: 1 } as AppState,
      {},
      {
        exportBackground: true,
        viewBackgroundColor: "#ffffff",
        exportingBounds: { x: 50, y: 20, width: 300, height: 150 },
      },
      createCanvas,
      async () => {},
    );
    expect(createCanvas).toHaveBeenCalledWith(300, 150);
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
  });
});

describe("the host's library sections", () => {
  it("shows them above the library's items", async () => {
    await render(
      <Excalidraw
        librarySections={<section data-testid="host-section">Kinds</section>}
      />,
    );
    act(() => {
      h.setState({
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB },
      });
    });
    await waitFor(() =>
      expect(
        document.querySelector(
          ".library-menu-items-container [data-testid='host-section']",
        ),
      ).not.toBeNull(),
    );
  });
});
