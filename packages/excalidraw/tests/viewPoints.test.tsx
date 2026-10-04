/**
 * View points: kept in files, read back only from the drawing being opened,
 * and undone and redone one view point at a time.
 */
import React from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { actionClearCanvas } from "../actions/actionCanvas";
import { Excalidraw } from "../index";
import { serializeAsJSON } from "../data/json";
import { restoreAppState, restoreViewPoints } from "../data/restore";
import { getDefaultAppState } from "../appState";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

import type { ViewPoint, ViewPoints } from "../types";

const { h } = window;

const area = (name: string, index: string): ViewPoint => ({
  name,
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  index,
});

const setViewPoints = (
  viewPoints: ViewPoints,
  captureUpdate: typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction],
) => API.updateScene({ appState: { viewPoints }, captureUpdate });

describe("view points in files", () => {
  it("round-trips through a saved file", () => {
    const viewPoints: ViewPoints = { a: area("Auth flow", "a0") };
    const json = JSON.parse(
      serializeAsJSON([], { ...getDefaultAppState(), viewPoints }, {}, "local"),
    );

    expect(json.appState.viewPoints).toEqual(viewPoints);
    expect(restoreAppState(json.appState, null).viewPoints).toEqual(viewPoints);
  });

  it("is not sent to the collaboration server", () => {
    const viewPoints: ViewPoints = { a: area("Auth flow", "a0") };
    const json = JSON.parse(
      serializeAsJSON(
        [],
        { ...getDefaultAppState(), viewPoints },
        {},
        "database",
      ),
    );

    expect(json.appState.viewPoints).toBeUndefined();
  });

  it("does not carry over the view points of the drawing open before", () => {
    const open = {
      ...getDefaultAppState(),
      viewPoints: { a: area("Auth flow", "a0") },
    };

    expect(restoreAppState({}, open).viewPoints).toEqual({});
  });

  it("drops malformed view points", () => {
    expect(
      restoreViewPoints({
        good: area("Good", "a0"),
        noName: { ...area("x", "a1"), name: 3 },
        empty: { ...area("Empty", "a2"), width: 0 },
        infinite: { ...area("Far", "a3"), x: Infinity },
        noIndex: { ...area("No index", ""), index: "" },
        notObject: "view point",
      }),
    ).toEqual({ good: area("Good", "a0") });
    expect(restoreViewPoints([area("In a list", "a0")])).toEqual({});
    expect(restoreViewPoints(null)).toEqual({});
  });
});

describe("undoing view points", () => {
  beforeEach(async () => {
    unmountComponent();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("undoes and redoes adding, renaming, moving and deleting", () => {
    const added = area("View point 1", "a0");
    setViewPoints({ a: added }, CaptureUpdateAction.IMMEDIATELY);
    const renamed = { ...added, name: "Auth flow" };
    setViewPoints({ a: renamed }, CaptureUpdateAction.IMMEDIATELY);
    const moved = { ...renamed, index: "a5" };
    setViewPoints({ a: moved }, CaptureUpdateAction.IMMEDIATELY);
    setViewPoints({}, CaptureUpdateAction.IMMEDIATELY);
    expect(API.getUndoStack().length).toBe(4);

    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ a: moved });
    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ a: renamed });
    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ a: added });
    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({});

    Keyboard.redo();
    Keyboard.redo();
    expect(h.state.viewPoints).toEqual({ a: renamed });
    Keyboard.redo();
    Keyboard.redo();
    expect(h.state.viewPoints).toEqual({});
  });

  it("leaves a collaborator's view point when undoing one's own", () => {
    const mine = area("Mine", "a0");
    setViewPoints({ mine }, CaptureUpdateAction.IMMEDIATELY);
    const theirs = area("Theirs", "a1");
    setViewPoints({ mine, theirs }, CaptureUpdateAction.NEVER);

    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ theirs });

    Keyboard.redo();
    expect(h.state.viewPoints).toEqual({ mine, theirs });
  });

  it("keeps a collaborator's later rename when undoing one's own addition", () => {
    const theirs = area("Theirs", "a0");
    setViewPoints({ theirs }, CaptureUpdateAction.NEVER);
    const mine = area("Mine", "a1");
    setViewPoints({ theirs, mine }, CaptureUpdateAction.IMMEDIATELY);
    const renamed = { ...theirs, name: "Renamed by them" };
    setViewPoints({ theirs: renamed, mine }, CaptureUpdateAction.NEVER);

    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ theirs: renamed });
  });

  it("brings back a deleted view point beside one a collaborator added", () => {
    const mine = area("Mine", "a0");
    setViewPoints({ mine }, CaptureUpdateAction.NEVER);
    setViewPoints({}, CaptureUpdateAction.IMMEDIATELY);
    const theirs = area("Theirs", "a1");
    setViewPoints({ theirs }, CaptureUpdateAction.NEVER);

    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ mine, theirs });
  });

  it("clears view points on resetting the canvas, and undo brings them back", () => {
    const kept = area("Auth flow", "a0");
    setViewPoints({ a: kept }, CaptureUpdateAction.IMMEDIATELY);

    API.executeAction(actionClearCanvas);
    expect(h.state.viewPoints).toEqual({});

    Keyboard.undo();
    expect(h.state.viewPoints).toEqual({ a: kept });
  });
});
