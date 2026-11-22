// SPDX-License-Identifier: AGPL-3.0-or-later
import { display } from '@kit.ArkUI';
import { configureSharedGlassBlur } from 'jide_foundation';
import { APPEARANCE_ELEMENTS_KEY, APPEARANCE_ELEMENTS_PREVIEW_KEY, APPEARANCE_ELEMENTS_ACTIVE_KEY,
  alignedOutlineWidth, AppearanceElementStyle, elementStyleFor, parseElementStyle } from '../model/AppearanceElements';
let resolvedRaw: string = '';
let resolvedStyle: AppearanceElementStyle = parseElementStyle('');
/** 同一帧大量控件共享同一不可变偏好文本，只校验一次；预览/保存变化立即失效。 */
function resolveElementStyle(raw: string): AppearanceElementStyle {
  if (raw !== resolvedRaw) {
    const style: AppearanceElementStyle = parseElementStyle(raw);
    resolvedRaw = raw; resolvedStyle = style;
  }
  return resolvedStyle;
}
export function activeElementStyle(): AppearanceElementStyle {
  const style: AppearanceElementStyle = resolveElementStyle(AppStorage.get<string>(APPEARANCE_ELEMENTS_ACTIVE_KEY) ?? '');
  // 对外仍返回独立快照，调用方不能修改共享解析结果。
  return { text: style.text, moduleOutline: style.moduleOutline, outline: style.outline,
    background: style.background, radius: style.radius, width: style.width,
    moduleRadius: style.moduleRadius, moduleWidth: style.moduleWidth, blur: style.blur };
}
export function publishElementStyle(dark: boolean): AppearanceElementStyle {
  const raw: string = AppStorage.get<string>(APPEARANCE_ELEMENTS_PREVIEW_KEY) || AppStorage.get<string>(APPEARANCE_ELEMENTS_KEY) || '';
  const style: AppearanceElementStyle = elementStyleFor(raw, dark);
  AppStorage.setOrCreate<string>(APPEARANCE_ELEMENTS_ACTIVE_KEY, JSON.stringify(style));
  configureSharedGlassBlur(style.blur / 50);
  return style;
}
/** 仅普通正文、容器线和页面背景参与覆盖，评分/错误/禁用色保留各自语义。 */
export function appearanceElementColor(raw: string, name: string, fallback: string | Resource): string | Resource {
  const style: AppearanceElementStyle = resolveElementStyle(raw);
  const value: string = name.startsWith('text_') ? (style.text === '' ? '' : name === 'text_primary' ? style.text : (name === 'text_secondary' ? '#B8' : '#99') + style.text.slice(1)) : name === 'surface_page' ? style.background : style.outline;
  return value || fallback;
}
export function elementRadius(radius: number, role: string = 'control'): number {
  const style = activeElementStyle();
  const custom: number = role === 'module' ? style.moduleRadius : style.radius;
  return custom < 0 ? radius : custom;
}
export function elementBorder(options: BorderOptions, role: string = 'control'): BorderOptions {
  const custom: AppearanceElementStyle = activeElementStyle();
  const color: string = role === 'module' ? custom.moduleOutline : custom.outline;
  const width: number = role === 'module' ? custom.moduleWidth : custom.width;
  // 普通线宽/线色只能调整已有轮廓，不能开启原本无边框的表面。
  if (options.width === 0 && (role !== 'module' || width <= 0)) {
    return { width: 0, color: color || options.color };
  }
  return { width: width < 0 ? options.width : pixelAlignedOutline(width), color: color || options.color };
}
export function elementBlur(base: number): number { return base * activeElementStyle().blur / 50; }

/** 显式危险色、白色按钮字等由调用方拥有，只替换默认正文资源。 */
export function appearanceTextColor(raw: string, fallback: ResourceColor): ResourceColor {
  if (typeof fallback !== 'object') return fallback;
  const resource: Resource = fallback as Resource;
  const keys: string[] = ['text_primary', 'text_secondary', 'text_tertiary'];
  const resources: Resource[] = [$r('app.color.text_primary'), $r('app.color.text_secondary'), $r('app.color.text_tertiary')];
  for (let index: number = 0; index < resources.length; index++) {
    if (resource.id === resources[index].id) return appearanceElementColor(raw, keys[index], resource);
  }
  return fallback;
}

export function appearanceElementRadius(raw: string, fallback: number): number {
  const radius: number = resolveElementStyle(raw).radius;
  return radius < 0 ? fallback : radius;
}

export function appearanceModuleBorder(raw: string): BorderOptions {
  const custom: AppearanceElementStyle = resolveElementStyle(raw);
  const mode: string = AppStorage.get<string>('themeMode') ?? 'system';
  const dark: boolean = mode === 'dark' || mode === 'system' && (AppStorage.get<boolean>('systemDarkMode') ?? false);
  const glass: boolean = AppStorage.get<string>('surface_material') === 'glass';
  const originalWidth: number = dark ? glass ? 0.8 : 1 : 0;
  const width: number = custom.moduleWidth < 0 ? originalWidth : custom.moduleWidth;
  return { width: custom.moduleWidth < 0 ? width : pixelAlignedOutline(width),
    color: custom.moduleOutline || (dark && glass ? '#22FFFFFF' : $r('app.color.surface_border')) };
}

export function pixelAlignedOutline(width: number): number {
  try { return alignedOutlineWidth(width, display.getDefaultDisplaySync().densityPixels); }
  catch (error) { return width; }
}

export function appearanceModuleRadius(raw: string, fallback: number): number {
  const radius: number = resolveElementStyle(raw).moduleRadius;
  return radius < 0 ? fallback : radius;
}
