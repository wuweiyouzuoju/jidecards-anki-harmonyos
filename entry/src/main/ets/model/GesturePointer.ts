// SPDX-License-Identifier: AGPL-3.0-or-later
export interface GesturePointer {
  id: number;
  localX: number;
  localY: number;
}

/** fingerList 按触点 ID 排列，非空数组仍可能有空槽；优先使用紧凑的 fingerInfos。 */
export function gesturePointer(fingerInfos: GesturePointer[] | undefined,
  fingerList: GesturePointer[] | undefined, pointerId: number = -1): GesturePointer | null {
  const lists: GesturePointer[][] = [fingerInfos ?? [], fingerList ?? []];
  for (const list of lists) {
    for (let index: number = 0; index < list.length; index++) {
      const point: GesturePointer | undefined = list[index];
      if (point !== undefined && Number.isFinite(point.id) && point.id >= 0 &&
        Number.isFinite(point.localX) && Number.isFinite(point.localY) &&
        (pointerId < 0 || point.id === pointerId)) return point;
    }
  }
  return null;
}
