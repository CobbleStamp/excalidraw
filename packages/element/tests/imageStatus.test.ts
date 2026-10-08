import rough from "roughjs/bin/rough";

import { getDefaultAppState } from "../../excalidraw/appState";
import { renderElement } from "../src/renderElement";
import { newImageElement } from "../src/newElement";
import { arrayToMap } from "@excalidraw/common";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../../excalidraw/scene/types";
import type { AppState } from "../../excalidraw/types";
import type {
  ExcalidrawImageElement,
  FileId,
  NonDeletedSceneElementsMap,
} from "../src/types";

describe("an image's status", () => {
  const picture = document.createElement("img");
  picture.src = "data:image/png;base64,picture";

  // what drawImage was given, on any canvas, for an image whose picture the
  // tab holds
  const drawnFor = (status: ExcalidrawImageElement["status"]) => {
    const image = newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fileId: "file" as FileId,
      status,
    });
    const elementsMap = arrayToMap([image]);
    const canvas = document.createElement("canvas");
    const renderConfig: StaticCanvasRenderConfig = {
      imageCache: new Map([
        ["file" as FileId, { image: picture, mimeType: "image/png" }],
      ]),
      renderGrid: false,
      isExporting: false,
      canvasBackgroundColor: "#fff",
      embedsValidationStatus: new Map(),
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
      theme: "light",
    };
    const appState: AppState = getDefaultAppState() as AppState;
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage");
    renderElement(
      image,
      elementsMap as unknown as RenderableElementsMap,
      elementsMap as unknown as NonDeletedSceneElementsMap,
      rough.canvas(canvas),
      canvas.getContext("2d")!,
      renderConfig,
      appState,
    );
    const drawn = drawImage.mock.calls.map((call) => call[0]);
    drawImage.mockRestore();
    return drawn;
  };

  it("draws the picture of a pending or saved image the tab holds", () => {
    expect(drawnFor("pending")).toContain(picture);
    expect(drawnFor("saved")).toContain(picture);
  });

  it("draws an image that could not be saved as broken, though the tab holds its picture", () => {
    const drawn = drawnFor("error");
    expect(drawn).not.toContain(picture);
    expect(
      drawn.some(
        (source) =>
          source instanceof HTMLImageElement &&
          source.src.startsWith("data:image/svg+xml"),
      ),
    ).toBe(true);
  });
});
