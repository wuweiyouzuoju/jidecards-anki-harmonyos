// SPDX-License-Identifier: AGPL-3.0-or-later
export interface SharedMenuRect { left: number; top: number; width: number; height: number; }
export interface SharedMenuScope {
  readonly id: number;
  clip: SharedMenuRect | null;
  offset: number;
  scroll: (delta: number) => void;
}
export interface SharedMenuTarget {
  scope: SharedMenuScope;
  rect: SharedMenuRect;
  offset: number;
  layer: number;
  available: () => boolean;
  highlight: (active: boolean) => void;
  select: () => void;
  enter: () => void;
  branch: boolean;
}
export interface SharedMenuRouter {
  attach(scope: SharedMenuScope): void;
  detach(scope: SharedMenuScope): void;
  register(target: SharedMenuTarget): void;
  remove(target: SharedMenuTarget): void;
}
let nextScope: number = 0;
export function sharedMenuScope(): SharedMenuScope {
  return { id: ++nextScope, clip: null, offset: 0, scroll: (_delta: number): void => {} };
}
export interface SharedMenuGlyph { letter: string; color: ResourceColor; }
export interface SharedMenuTheme {
  material: string; dark: boolean; foreground: boolean; reducedMotion: boolean; supported: boolean;
  panelOpacity: number; lineColor: ResourceColor; text: ResourceColor; secondaryText: ResourceColor;
  danger: ResourceColor; iconFill: ResourceColor; hover: ResourceColor; accent: string;
}
export function sharedMenuTheme(): SharedMenuTheme {
  return { material: 'flat', dark: false, foreground: true, reducedMotion: false, supported: false,
    panelOpacity: 94, lineColor: '#CFD7E3', text: '#18202B', secondaryText: '#64748B',
    danger: '#B42318', iconFill: '#667085', hover: '#F1F5F9', accent: '#2F5FD0' };
}
export interface SharedToolbarMenuBounds { left: number; top: number; width: number; }
export class SharedMenuTokens {
  static readonly itemHeight: number = 44;
  static readonly horizontalPadding: number = 10;
  static readonly panelInset: number = 20;
  static readonly textSize: number = 15;
  static readonly radius: number = 18;
  static readonly toolbarRadius: number = 22;
  static readonly gap: number = 8;
  static readonly pointerDepth: number = 6;
  static readonly pointerSpan: number = 20;
}
