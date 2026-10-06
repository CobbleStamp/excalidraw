import {
  DEFAULT_GRID_SIZE,
  KEYS,
  MOBILE_ACTION_BUTTON_BG,
  arrayToMap,
} from "@excalidraw/common";

import { getNonDeletedElements } from "@excalidraw/element";

import { LinearElementEditor } from "@excalidraw/element";

import {
  getSelectedElements,
  getSelectionStateForElements,
} from "@excalidraw/element";

import { syncMovedIndices } from "@excalidraw/element";

import {
  duplicateElements,
  getCommonBounds,
  getContainedElements,
  getElementsWithContents,
} from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import { IconButton } from "../components/IconButton";
import { DuplicateIcon } from "../components/icons";

import { t } from "../i18n";
import { isSomeElementSelected } from "../scene";
import { getShortcutKey } from "../shortcut";

import { useStylesPanelMode } from "../components/App";

import { register } from "./register";

export const actionDuplicateSelection = register({
  name: "duplicateSelection",
  label: "labels.duplicateSelection",
  icon: DuplicateIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    if (appState.selectedElementsAreBeingDragged) {
      return false;
    }

    // duplicate selected point(s) if editing a line
    if (appState.selectedLinearElement?.isEditing) {
      // TODO: Invariants should be checked here instead of duplicateSelectedPoints()
      try {
        const newAppState = LinearElementEditor.duplicateSelectedPoints(
          appState,
          app.scene,
        );

        return {
          elements,
          appState: newAppState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      } catch {
        return false;
      }
    }

    // excalidraw-web: a duplicated container is duplicated with its
    // contents (and their bound text), as alt-drag duplicates it
    const selectedElements = getSelectedElements(elements, appState, {
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const containedElements = getContainedElements(
      selectedElements,
      app.scene.getNonDeletedElements(),
      elementsMap,
    );
    const idsOfElementsToDuplicate = getElementsWithContents(
      selectedElements,
      containedElements,
      elementsMap,
    );

    // excalidraw-web: a copy that holds contents is placed clear of the
    // original, to its right, so nothing lies inside both and a drag of the
    // copy leaves the original's contents behind
    const [offsetX, offsetY] = (() => {
      if (containedElements.length === 0) {
        return [DEFAULT_GRID_SIZE / 2, DEFAULT_GRID_SIZE / 2];
      }
      const [minX, , maxX] = getCommonBounds(
        Array.from(idsOfElementsToDuplicate.values()),
        elementsMap,
      );
      return [maxX - minX + DEFAULT_GRID_SIZE, 0];
    })();

    const duplication = duplicateElements({
      type: "in-place",
      elements,
      idsOfElementsToDuplicate,
      appState,
      randomizeSeed: true,
      overrides: ({ origElement, origIdToDuplicateId }) => {
        const duplicateFrameId =
          origElement.frameId && origIdToDuplicateId.get(origElement.frameId);
        return {
          x: origElement.x + offsetX,
          y: origElement.y + offsetY,
          frameId: duplicateFrameId ?? origElement.frameId,
        };
      },
    });

    let { duplicatedElements, elementsWithDuplicates } = duplication;

    if (app.props.onDuplicate) {
      ({ elements: elementsWithDuplicates, duplicatedElements } =
        app.duplicate.runOnDuplicate(
          duplication,
          elementsWithDuplicates,
          elements,
        ));

      // host vetoed the duplication
      if (!duplicatedElements.length) {
        return false;
      }
    }

    return {
      elements: syncMovedIndices(
        elementsWithDuplicates,
        arrayToMap(duplicatedElements),
      ),
      appState: {
        ...appState,
        ...getSelectionStateForElements(
          duplicatedElements,
          getNonDeletedElements(elementsWithDuplicates),
          appState,
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.D,
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const isMobile = useStylesPanelMode() === "mobile";

    return (
      <IconButton
        type="button"
        icon={DuplicateIcon}
        title={`${t("labels.duplicateSelection")} — ${getShortcutKey(
          "CtrlOrCmd+D",
        )}`}
        aria-label={t("labels.duplicateSelection")}
        onClick={() => updateData(null)}
        disabled={
          !isSomeElementSelected(getNonDeletedElements(elements), appState)
        }
        style={{
          ...(isMobile && appState.openPopup !== "compactOtherProperties"
            ? MOBILE_ACTION_BUTTON_BG
            : {}),
        }}
      />
    );
  },
});
