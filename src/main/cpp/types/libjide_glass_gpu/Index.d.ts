// SPDX-License-Identifier: AGPL-3.0-or-later
export const create: (surfaceId: bigint) => number;
export const upload: (handle: number, rgba: ArrayBuffer, width: number, height: number, bgra: boolean) => boolean;
/** size, source(xywh,r), target(xywh,r), progress, origin(xy), frame(xywh), dark, density */
export const draw: (handle: number, uniforms: Float64Array) => boolean;
export const destroy: (handle: number) => void;
