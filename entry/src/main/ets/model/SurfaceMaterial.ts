// SPDX-License-Identifier: AGPL-3.0-or-later
export const DEFAULT_SURFACE_MATERIAL: string = 'glass';
export const GLASS_SUGGESTION_HANDLED_KEY: string = 'glass_suggestion_handled_v1';
export const GLASS_SUGGESTION_PENDING_KEY: string = 'glass_suggestion_pending';
export const SURFACE_MATERIAL_KEY: string = 'surface_material';
export const SURFACE_MATERIALS: string[] = ['flat', 'glass'];
export function isSurfaceMaterial(value: string): boolean { return SURFACE_MATERIALS.includes(value); }
export function surfaceMaterialTitleKey(value: string): string { return value === 'glass' ? 'surface_material_glass' : 'surface_material_flat'; }
