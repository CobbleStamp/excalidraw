/**
 * Containment: moving a rectangle, ellipse, diamond or polygon also moves
 * every element whose outline lies fully inside it, with no setup step.
 * "Inside" is decided by geometry alone, ignoring stacking order, so dragging
 * an element out of a container releases it and dragging one in makes it
 * follow.
 */
import { arrayToMap } from "@excalidraw/common";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { GlobalPoint, Radians } from "@excalidraw/math";

import { getElementAbsoluteCoords } from "./bounds";
import { addElementsToFrame, removeElementsFromFrame } from "./frame";
import { getElementsInGroup } from "./groups";
import { getPolygonPoints, isPointInsidePolygonPoints } from "./polygon";
import {
  isFrameLikeElement,
  isFreeDrawElement,
  isLinearElement,
} from "./typeChecks";

import type {
  ElementsMap,
  ElementsMapOrArray,
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "./types";

/**
 * How many points approximate an ellipse's outline. With 64, the outline
 * between two samples bulges at most ~0.12% of the radius past them.
 */
const ELLIPSE_OUTLINE_POINT_COUNT = 64;

/** Tolerance, in scene units, so an outline touching the edge counts as inside. */
const EDGE_TOLERANCE = 0.5;

/** Whether an element can carry other elements along when it moves. */
export const isContainerShape = (element: ExcalidrawElement): boolean =>
  !element.isDeleted &&
  (element.type === "rectangle" ||
    element.type === "ellipse" ||
    element.type === "diamond" ||
    element.type === "polygon");

const getCenter = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): GlobalPoint => {
  const [, , , , centerX, centerY] = getElementAbsoluteCoords(
    element,
    elementsMap,
  );
  return pointFrom<GlobalPoint>(centerX, centerY);
};

const rotateAboutCenter = (
  point: GlobalPoint,
  center: GlobalPoint,
  angle: Radians,
): GlobalPoint => pointRotateRads(point, center, angle);

/** The points that trace an element's outline, in scene coordinates. */
export const getOutlinePoints = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): GlobalPoint[] => {
  const center = getCenter(element, elementsMap);

  if (isLinearElement(element) || isFreeDrawElement(element)) {
    const toScenePoint = (point: readonly [number, number]): GlobalPoint =>
      rotateAboutCenter(
        pointFrom<GlobalPoint>(element.x + point[0], element.y + point[1]),
        center,
        element.angle,
      );
    return element.points.map(toScenePoint);
  }

  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;

  if (element.type === "ellipse") {
    const outline: GlobalPoint[] = [];
    for (let index = 0; index < ELLIPSE_OUTLINE_POINT_COUNT; index++) {
      const theta = (2 * Math.PI * index) / ELLIPSE_OUTLINE_POINT_COUNT;
      outline.push(
        rotateAboutCenter(
          pointFrom<GlobalPoint>(
            center[0] + halfWidth * Math.cos(theta),
            center[1] + halfHeight * Math.sin(theta),
          ),
          center,
          element.angle,
        ),
      );
    }
    return outline;
  }

  const corners: [number, number][] =
    element.type === "polygon"
      ? getPolygonPoints(element).map(([x, y]) => [
          x - halfWidth,
          y - halfHeight,
        ])
      : element.type === "diamond"
      ? [
          [0, -halfHeight],
          [halfWidth, 0],
          [0, halfHeight],
          [-halfWidth, 0],
        ]
      : [
          [-halfWidth, -halfHeight],
          [halfWidth, -halfHeight],
          [halfWidth, halfHeight],
          [-halfWidth, halfHeight],
        ];
  const toScenePoint = ([offsetX, offsetY]: [number, number]): GlobalPoint =>
    rotateAboutCenter(
      pointFrom<GlobalPoint>(center[0] + offsetX, center[1] + offsetY),
      center,
      element.angle,
    );
  return corners.map(toScenePoint);
};

/**
 * Whether a scene point lies inside (or on the edge of) a container shape.
 * Sharp-cornered geometry: a point in the trimmed corner of a rounded shape
 * counts as inside. Cheaper than collision.ts's ray-cast `isPointInElement`,
 * which matters because every outline point of every candidate is tested.
 */
const isPointInsideContainer = (
  point: GlobalPoint,
  container: ExcalidrawElement,
  containerCenter: GlobalPoint,
): boolean => {
  // undo the container's rotation, so the test runs in its own frame
  const local = rotateAboutCenter(
    point,
    containerCenter,
    -container.angle as Radians,
  );
  const halfWidth = container.width / 2 + EDGE_TOLERANCE;
  const halfHeight = container.height / 2 + EDGE_TOLERANCE;
  const offsetX = Math.abs(local[0] - containerCenter[0]);
  const offsetY = Math.abs(local[1] - containerCenter[1]);

  if (container.type === "ellipse") {
    return (offsetX / halfWidth) ** 2 + (offsetY / halfHeight) ** 2 <= 1;
  }
  if (container.type === "diamond") {
    return offsetX / halfWidth + offsetY / halfHeight <= 1;
  }
  if (container.type === "polygon") {
    return isPointInsidePolygonPoints(
      getPolygonPoints(container),
      [
        local[0] - containerCenter[0] + container.width / 2,
        local[1] - containerCenter[1] + container.height / 2,
      ],
      EDGE_TOLERANCE,
    );
  }
  return offsetX <= halfWidth && offsetY <= halfHeight;
};

/** Whether `element`'s whole outline lies inside `container`'s shape. */
export const isOutlineInsideContainer = (
  element: ExcalidrawElement,
  container: ExcalidrawElement,
  elementsMap: ElementsMap,
): boolean => {
  if (element.id === container.id || !isContainerShape(container)) {
    return false;
  }
  const containerCenter = getCenter(container, elementsMap);
  const isInside = (point: GlobalPoint): boolean =>
    isPointInsideContainer(point, container, containerCenter);
  const outline = getOutlinePoints(element, elementsMap);
  return outline.length > 0 && outline.every(isInside);
};

/**
 * The elements that move along with `movingElements` because they lie inside
 * a moving container, judged at the positions in `elementsMap`. Nested
 * contents are included, since whatever is inside an inner container is also
 * inside the outer one.
 */
export const getContainedElements = (
  movingElements: readonly NonDeletedExcalidrawElement[],
  allElements: readonly NonDeletedExcalidrawElement[],
  elementsMap: ElementsMap,
): NonDeletedExcalidrawElement[] => {
  const containers = movingElements.filter(isContainerShape);
  if (containers.length === 0) {
    return [];
  }
  const movingIds = new Set(movingElements.map((element) => element.id));

  const isEligible = (element: NonDeletedExcalidrawElement): boolean =>
    !movingIds.has(element.id) &&
    !element.isDeleted &&
    // locked elements move with their container, as locked frame children
    // move with their frame (owner decision, excalidraw-web)
    // bound text already moves with its own container
    !("containerId" in element && element.containerId) &&
    !isFrameLikeElement(element);

  const isInsideAMovingContainer = (
    element: NonDeletedExcalidrawElement,
  ): boolean =>
    containers.some(
      (container) =>
        container.frameId === element.frameId &&
        isOutlineInsideContainer(element, container, elementsMap),
    );

  const contained = new Set(
    allElements.filter(isEligible).filter(isInsideAMovingContainer),
  );

  // Drop elements that would be separated from the rest of their group, and
  // lines attached to something that isn't moving (their endpoint keeps
  // following that element instead). Repeat until nothing changes, since
  // dropping one element can break another's group.
  const containedIds = new Set(Array.from(contained, (element) => element.id));
  const isMovingOrContained = (id: string): boolean =>
    movingIds.has(id) || containedIds.has(id);

  let changed = true;
  while (changed) {
    changed = false;
    for (const element of Array.from(contained)) {
      const outermostGroupId = element.groupIds[element.groupIds.length - 1];
      const splitsGroup =
        outermostGroupId !== undefined &&
        getElementsInGroup<NonDeletedExcalidrawElement>(
          allElements,
          outermostGroupId,
        ).some((member) => !isMovingOrContained(member.id));
      const attachedToSomethingStill =
        isLinearElement(element) &&
        [element.startBinding, element.endBinding].some(
          (binding) => binding && !isMovingOrContained(binding.elementId),
        );
      if (splitsGroup || attachedToSomethingStill) {
        contained.delete(element);
        containedIds.delete(element.id);
        changed = true;
      }
    }
  }

  return Array.from(contained);
};

const keptSizeHoldersCache = new WeakMap<
  ElementsMap,
  Map<ExcalidrawElement["id"], NonDeletedExcalidrawElement[]>
>();

/**
 * For each element held by containers that keep their size (`keepsSize`),
 * those containers, outermost first: what such a container holds, by the
 * rule that decides what moves with it, is drawn clipped to its outline.
 * Worked out once per `elementsMap`.
 */
export const getKeptSizeHolders = (
  elementsMap: ElementsMap,
): Map<ExcalidrawElement["id"], NonDeletedExcalidrawElement[]> => {
  const cached = keptSizeHoldersCache.get(elementsMap);
  if (cached) {
    return cached;
  }
  const holders = new Map<
    ExcalidrawElement["id"],
    NonDeletedExcalidrawElement[]
  >();
  const allElements = Array.from(elementsMap.values()).filter(
    (element): element is NonDeletedExcalidrawElement => !element.isDeleted,
  );
  const containers = allElements.filter(
    (element) => element.keepsSize && isContainerShape(element),
  );
  // larger containers first, so an element's list runs outermost first
  containers.sort((a, b) => b.width * b.height - a.width * a.height);
  for (const container of containers) {
    for (const held of getContainedElements(
      [container],
      allElements,
      elementsMap,
    )) {
      holders.set(held.id, [...(holders.get(held.id) ?? []), container]);
    }
  }
  keptSizeHoldersCache.set(elementsMap, holders);
  return holders;
};

/**
 * After a drag, puts each carried-along element in the same frame as the moved
 * container it sits in, so a container's contents enter and leave frames with
 * it. Frame membership of the moved (selected) elements is settled first by
 * the usual pointer-up logic.
 */
export const syncContainedFrameMembership = <T extends ElementsMapOrArray>(
  allElements: T,
  movedElements: readonly ExcalidrawElement[],
  containedElements: readonly ExcalidrawElement[],
): T => {
  if (containedElements.length === 0) {
    return allElements;
  }
  const elementsMap = arrayToMap(allElements) as ElementsMap;
  const latest = (element: ExcalidrawElement): ExcalidrawElement =>
    elementsMap.get(element.id) ?? element;
  const movedContainers = movedElements.map(latest).filter(isContainerShape);

  const toAddByFrameId = new Map<string, ExcalidrawElement[]>();
  const toRemove = new Set<ExcalidrawElement>();
  for (const element of containedElements.map(latest)) {
    const holder = movedContainers.find((container) =>
      isOutlineInsideContainer(element, container, elementsMap),
    );
    if (!holder || holder.frameId === element.frameId) {
      continue;
    }
    if (holder.frameId) {
      const joining = toAddByFrameId.get(holder.frameId) ?? [];
      joining.push(element);
      toAddByFrameId.set(holder.frameId, joining);
    } else {
      toRemove.add(element);
    }
  }

  if (toRemove.size > 0) {
    removeElementsFromFrame(toRemove, elementsMap);
  }
  let result = allElements;
  for (const [frameId, joining] of toAddByFrameId) {
    const frame = elementsMap.get(frameId);
    if (frame && isFrameLikeElement(frame)) {
      result = addElementsToFrame(result, joining, frame);
    }
  }
  return result;
};
