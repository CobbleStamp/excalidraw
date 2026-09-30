/**
 * The editor behaviour excalidraw-web's cloud drawings rely on to turn a
 * user's edits into changes and to apply other people's changes: which
 * increments `onIncrement` reports for a drag, a selection and a background
 * colour, and that a change applied from elsewhere reports no durable
 * increment and stays out of the undo history, so it is never sent back.
 */
import React from "react";

import { newElementWith } from "@excalidraw/element";
import { CaptureUpdateAction, StoreIncrement } from "@excalidraw/element";
import { reseed } from "@excalidraw/common";

import type { DurableIncrement, EphemeralIncrement } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { GlobalTestState, render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

type Increment = DurableIncrement | EphemeralIncrement;

describe("increments a cloud drawing relies on", () => {
  let increments: Increment[];

  const durable = (): DurableIncrement[] =>
    increments.filter((increment): increment is DurableIncrement =>
      StoreIncrement.isDurable(increment),
    );

  beforeEach(async () => {
    unmountComponent();
    reseed(7);
    increments = [];
    Object.assign(document, {
      elementFromPoint: () => GlobalTestState.canvas,
    });
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        isCollaborating={true}
        onIncrement={(increment: Increment) => {
          increments.push(increment);
        }}
      />,
    );
  });

  it("reports one durable increment for a whole drag, carrying the new position", () => {
    const rectangle = UI.createElement("rectangle", { x: 0, y: 0 });
    const start = { x: h.elements[0].x, y: h.elements[0].y };
    increments = [];

    mouse.downAt(start.x + 5, start.y + 5);
    mouse.moveTo(start.x + 25, start.y + 15);
    mouse.moveTo(start.x + 55, start.y + 45);
    mouse.up();

    expect(durable()).toHaveLength(1);
    const { updated } = durable()[0].delta.elements;
    expect(updated[rectangle.id].inserted).toEqual(
      expect.objectContaining({ x: start.x + 50, y: start.y + 40 }),
    );
    // the frames in between are reported, but only as ephemeral
    expect(
      increments.filter((increment) => StoreIncrement.isEphemeral(increment))
        .length,
    ).toBeGreaterThan(0);
  });

  it("reports a selection with no element changes", () => {
    const rectangle = UI.createElement("rectangle", { x: 0, y: 0 });
    Keyboard.keyPress("Escape");
    increments = [];

    mouse.clickAt(rectangle.x + 5, rectangle.y + 5);

    // the selection is recorded (it is an undo step)...
    expect(durable().length).toBeGreaterThan(0);
    expect(
      durable().some(
        (increment) =>
          increment.delta.appState.delta.inserted.selectedElementIds?.[
            rectangle.id
          ],
      ),
    ).toBe(true);
    // ...but changes no element
    for (const increment of durable()) {
      const { added, removed, updated } = increment.delta.elements;
      expect({ added, removed, updated }).toEqual({
        added: {},
        removed: {},
        updated: {},
      });
    }
  });

  it("reports a background colour change as an app state change", () => {
    increments = [];

    API.setAppState({ viewBackgroundColor: "#ffc9c9" });
    API.updateScene({
      appState: { viewBackgroundColor: "#ffec99" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const changed = durable().map(
      (increment) => increment.delta.appState.delta.inserted,
    );
    expect(changed).toContainEqual(
      expect.objectContaining({ viewBackgroundColor: "#ffec99" }),
    );
  });

  it("applies a change from elsewhere with no durable increment and no undo step", () => {
    const rectangle = UI.createElement("rectangle", { x: 0, y: 0 });
    const undoSteps = API.getUndoStack().length;
    increments = [];

    const remote = newElementWith(h.elements[0], { strokeColor: "#1971c2" });
    API.updateScene({
      elements: [remote],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(durable()).toHaveLength(0);
    expect(API.getUndoStack().length).toBe(undoSteps);
    // what is reported is ephemeral and carries the version the change was
    // applied with, which is how the app tells it from the user's own edits
    const ephemeral = increments.filter((increment) =>
      StoreIncrement.isEphemeral(increment),
    );
    const reported = ephemeral
      .map((increment) => increment.change.elements[rectangle.id])
      .filter((element) => element !== undefined);
    expect(reported.length).toBeGreaterThan(0);
    for (const element of reported) {
      expect(element.versionNonce).toBe(remote.versionNonce);
    }
    expect(h.elements[0].strokeColor).toBe("#1971c2");
  });

  it("undoes only the user's own change after a change from elsewhere", () => {
    UI.createElement("rectangle", { x: 0, y: 0 });
    API.updateScene({
      elements: [newElementWith(h.elements[0], { backgroundColor: "#ffc9c9" })],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.updateScene({
      elements: [newElementWith(h.elements[0], { strokeColor: "#1971c2" })],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    Keyboard.undo();

    expect(h.elements[0]).toEqual(
      expect.objectContaining({
        backgroundColor: "transparent",
        strokeColor: "#1971c2",
      }),
    );
  });
});
