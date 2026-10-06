/**
 * The host's plain text for a copy: other apps get the host's text while
 * the elements travel under the editor's own clipboard type, which a paste
 * reads before the plain text.
 */
import React from "react";

import { MIME_TYPES } from "@excalidraw/common";

import { actionCopy } from "../actions/actionClipboard";
import {
  createPasteEvent,
  parseClipboard,
  parseDataTransferEvent,
  serializeAsClipboardJSON,
} from "../clipboard";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, render, unmountComponent, waitFor } from "./test-utils";

import type { ExcalidrawProps } from "../types";

const { h } = window;

unmountComponent();

const renderWith = async (props: Partial<ExcalidrawProps>) => {
  await render(<Excalidraw handleKeyboardGlobally={true} {...props} />);
  API.setElements([]);
};

/** Copies the selection through a copy event, as Ctrl+C does, and gives what the clipboard got. */
const copySelection = async () => {
  const event = new ClipboardEvent("copy", {
    clipboardData: new DataTransfer(),
  });
  act(() => {
    h.app.actionManager.executeAction(actionCopy, "keyboard", event);
  });
  await waitFor(() =>
    expect(
      event.clipboardData?.getData(MIME_TYPES.excalidrawClipboard),
    ).not.toBe(""),
  );
  return event.clipboardData!;
};

describe("clipboardTextOf", () => {
  it("puts the host's text as plain text, and the elements under the editor's own type", async () => {
    await renderWith({ clipboardTextOf: (copied) => `${copied.length} shape` });
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    const clipboard = await copySelection();

    expect(clipboard.getData(MIME_TYPES.text)).toBe("1 shape");
    expect(
      JSON.parse(clipboard.getData(MIME_TYPES.excalidrawClipboard)).elements,
    ).toHaveLength(1);
  });

  it("leaves the elements' JSON as plain text when the host gives none", async () => {
    await renderWith({ clipboardTextOf: () => null });
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    const clipboard = await copySelection();

    expect(clipboard.getData(MIME_TYPES.text)).toBe(
      clipboard.getData(MIME_TYPES.excalidrawClipboard),
    );
  });
});

describe("parseClipboard with the editor's own type", () => {
  const rectangle = API.createElement({ type: "rectangle" });
  const pasteOf = () =>
    parseDataTransferEvent(
      createPasteEvent({
        types: {
          [MIME_TYPES.text]: "a\tb",
          [MIME_TYPES.excalidrawClipboard]: serializeAsClipboardJSON({
            elements: [rectangle],
            files: null,
          }),
        } as Parameters<typeof createPasteEvent>[0]["types"],
      }),
    );

  it("reads the elements from it before the plain text", async () => {
    const data = await parseClipboard(await pasteOf());

    expect(data.elements).toEqual([rectangle]);
  });

  it("gives a plain paste the plain text", async () => {
    const data = await parseClipboard(await pasteOf(), true);

    expect(data.text).toBe("a\tb");
  });
});
