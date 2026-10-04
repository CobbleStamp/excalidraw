/**
 * excalidraw-web's host data: the host app's own entries in a drawing, kept in
 * files, read back only from the drawing being opened, and undone and redone
 * one entry at a time.
 */
import React from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { actionClearCanvas } from "../actions/actionCanvas";
import { Excalidraw } from "../index";
import { serializeAsJSON } from "../data/json";
import { restoreAppState } from "../data/restore";
import { getDefaultAppState } from "../appState";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

import type { HostData } from "../types";

const { h } = window;

const entry = (name: string) => ({ name, x: 10, y: 20 });

const setHostData = (
  hostData: HostData,
  captureUpdate: typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction],
) => API.updateScene({ appState: { hostData }, captureUpdate });

describe("host data in files", () => {
  it("round-trips through a saved file", () => {
    const hostData: HostData = { "note:a": entry("Auth flow") };
    const json = JSON.parse(
      serializeAsJSON([], { ...getDefaultAppState(), hostData }, {}, "local"),
    );

    expect(json.appState.hostData).toEqual(hostData);
    expect(restoreAppState(json.appState, null).hostData).toEqual(hostData);
  });

  it("is not sent to the collaboration server", () => {
    const hostData: HostData = { "note:a": entry("Auth flow") };
    const json = JSON.parse(
      serializeAsJSON(
        [],
        { ...getDefaultAppState(), hostData },
        {},
        "database",
      ),
    );

    expect(json.appState.hostData).toBeUndefined();
  });

  it("does not carry over the entries of the drawing open before", () => {
    const open = {
      ...getDefaultAppState(),
      hostData: { "note:a": entry("Auth flow") },
    };

    expect(restoreAppState({}, open).hostData).toEqual({});
  });

  it("is an object, or none", () => {
    expect(restoreAppState({ hostData: [1] } as never, null).hostData).toEqual(
      {},
    );
    expect(restoreAppState({ hostData: "x" } as never, null).hostData).toEqual(
      {},
    );
  });
});

describe("undoing host data", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("undoes and redoes adding, changing and deleting an entry", () => {
    const added = entry("View point 1");
    setHostData({ "note:a": added }, CaptureUpdateAction.IMMEDIATELY);
    const renamed = { ...added, name: "Auth flow" };
    setHostData({ "note:a": renamed }, CaptureUpdateAction.IMMEDIATELY);
    setHostData({}, CaptureUpdateAction.IMMEDIATELY);
    expect(API.getUndoStack().length).toBe(3);

    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "note:a": renamed });
    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "note:a": added });
    Keyboard.undo();
    expect(h.state.hostData).toEqual({});

    Keyboard.redo();
    expect(h.state.hostData).toEqual({ "note:a": added });
    Keyboard.redo();
    Keyboard.redo();
    expect(h.state.hostData).toEqual({});
  });

  it("undoes entries whose values are falsy", () => {
    setHostData(
      { "flag:a": false, "count:b": 0 },
      CaptureUpdateAction.IMMEDIATELY,
    );
    setHostData(
      { "flag:a": true, "count:b": 0 },
      CaptureUpdateAction.IMMEDIATELY,
    );

    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "flag:a": false, "count:b": 0 });
    Keyboard.undo();
    expect(h.state.hostData).toEqual({});
  });

  it("leaves a collaborator's entry when undoing one's own", () => {
    const mine = entry("Mine");
    setHostData({ "note:mine": mine }, CaptureUpdateAction.IMMEDIATELY);
    const theirs = entry("Theirs");
    setHostData(
      { "note:mine": mine, "note:theirs": theirs },
      CaptureUpdateAction.NEVER,
    );

    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "note:theirs": theirs });

    Keyboard.redo();
    expect(h.state.hostData).toEqual({
      "note:mine": mine,
      "note:theirs": theirs,
    });
  });

  it("keeps a collaborator's later change when undoing one's own addition", () => {
    const theirs = entry("Theirs");
    setHostData({ "note:theirs": theirs }, CaptureUpdateAction.NEVER);
    const mine = entry("Mine");
    setHostData(
      { "note:theirs": theirs, "note:mine": mine },
      CaptureUpdateAction.IMMEDIATELY,
    );
    const renamed = { ...theirs, name: "Renamed by them" };
    setHostData(
      { "note:theirs": renamed, "note:mine": mine },
      CaptureUpdateAction.NEVER,
    );

    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "note:theirs": renamed });
  });

  it("clears host data on resetting the canvas, and undo brings it back", () => {
    const kept = entry("Auth flow");
    setHostData({ "note:a": kept }, CaptureUpdateAction.IMMEDIATELY);

    API.executeAction(actionClearCanvas);
    expect(h.state.hostData).toEqual({});

    Keyboard.undo();
    expect(h.state.hostData).toEqual({ "note:a": kept });
  });
});
