// SPDX-License-Identifier: AGPL-3.0-or-later
import { deviceInfo } from '@kit.BasicServicesKit';
import { UIContext } from '@kit.ArkUI';
import { SharedGlassBackdrop, SharedGlassRegion, warmSharedGlassSource } from 'jide_foundation';
import { APP_FOREGROUND_KEY } from '../model/AppLifecycleState';
export const GLASS_BACKGROUND_SOURCE: string = 'jide-glass-shared-background';
export const GLASS_HOME_SOURCE: string = 'jide-glass-home-source';
export const GLASS_DECK_DETAILS_SOURCE: string = 'jide-glass-deck-details-source';
export interface GlassRegion extends SharedGlassRegion {}
function captureAllowed(preview: boolean = false): boolean {
  return (preview || AppStorage.get<string>('surface_material') === 'glass') && (AppStorage.get<boolean>(APP_FOREGROUND_KEY) ?? false);
}
/** 产品只映射偏好与生命周期；采样、模糊和折射统一由系列HAR拥有。 */
@Component
export struct GlassBackdrop {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @Prop materialOverride: string = '';
  @Prop region: GlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @Prop radius: number = 16;
  @Prop contourPath: string = '';
  @Prop role: string = 'menu';
  @Prop source: string = '';
  onReady: () => void = (): void => {};
  build() {
    SharedGlassBackdrop({ source: this.source, backgroundSource: GLASS_BACKGROUND_SOURCE, region: this.region, radius: this.radius, contourPath: this.contourPath, role: this.role === 'preview' ? 'menu' : this.role,
      active: (this.materialOverride || this.material) === 'glass' && this.foreground,
      dark: this.mode === 'dark' || (this.mode !== 'light' && this.systemDark), captureAllowed: (initialFrame: boolean = false): boolean => sourceCaptureAllowed(this.source, initialFrame),
      onReady: this.onReady })
  }
}
export function warmGlassSource(ui: UIContext, source: string, active: boolean, preview: boolean = false): void {
  warmSharedGlassSource(ui, source, active, (initialFrame: boolean = false): boolean => sourceCaptureAllowed(source, initialFrame) ||
    (preview && captureAllowed(true) && (sourcePanels.get(source) ?? 0) === 0), GLASS_BACKGROUND_SOURCE);
}

// 每个窗口只选择当前可见正文；弹窗不注册为源，叠层也不会采集自身。
const visibleSources: Map<number, string[]> = new Map<number, string[]>();
export function currentGlassSource(ui: UIContext): string {
  if (!deviceInfo.apiAvailable(23)) return '';
  const sources = visibleSources.get(ui.getWindowId() ?? -1);
  return sources === undefined ? '' : sources[sources.length - 1] ?? '';
}
export function glassSourceVisibility(ui: UIContext, source: string, visible: boolean, preview: boolean = false): void {
  if (!deviceInfo.apiAvailable(23)) return;
  const key: number = ui.getWindowId() ?? -1;
  const previous: string[] = visibleSources.get(key) ?? [];
  const next: string[] = previous.filter((id: string): boolean => id !== source);
  if (visible) next.push(source);
  if (next.length > 0) visibleSources.set(key, next); else visibleSources.delete(key);
  warmGlassSource(ui, source, visible, preview);
}

export function supportsGlassBackdrop(): boolean { return deviceInfo.apiAvailable(23); }

// 原生Popup或内嵌编辑器可在正文子树内挂载弹层；沿用打开前的真实帧，避免递归采入自身。
const frozenSources: Set<string> = new Set<string>();
const layoutSources: Map<string, number> = new Map<string, number>();
export function settleGlassSourceLayout(source: string, duration: number = 300): void {
  const previous: number | undefined = layoutSources.get(source);
  if (previous !== undefined) clearTimeout(previous);
  layoutSources.set(source, setTimeout((): void => { layoutSources.delete(source); }, duration));
}
const scrollingSources: Set<string> = new Set<string>();
/** 滚动期沿用已完成帧，让截图/合成/模糊退出手势与惯性滚动的关键路径。 */
export function setGlassSourceScrolling(source: string, scrolling: boolean): void {
  if (scrolling) scrollingSources.add(source); else scrollingSources.delete(source);
}
const sourcePanels: Map<string, number> = new Map<string, number>();
const previewPanels: Map<string, number> = new Map<string, number>();
export function setGlassSourceFreeze(source: string, freeze: boolean): void {
  if (freeze) frozenSources.add(source); else frozenSources.delete(source);
}
export function retainGlassPanel(source: string, preview: boolean = false): void {
  if (preview && source !== '') previewPanels.set(source, (previewPanels.get(source) ?? 0) + 1);
  if (source !== '') sourcePanels.set(source, (sourcePanels.get(source) ?? 0) + 1);
}
export function releaseGlassPanel(source: string, preview: boolean = false): void {
  if (preview) {
    const previews: number = previewPanels.get(source) ?? 0;
    if (previews <= 1) previewPanels.delete(source); else previewPanels.set(source, previews - 1);
  }
  const count: number = sourcePanels.get(source) ?? 0;
  if (count <= 1) sourcePanels.delete(source); else sourcePanels.set(source, count - 1);
}
export function sourceCaptureAllowed(source: string, initialFrame: boolean = false): boolean {
  // 显式预览来自原生窗口，正文源不包含该窗口；扁平模式没有预热帧，允许首次真实采集。
  const preview: boolean = (previewPanels.get(source) ?? 0) > 0;
  // 首页和牌组详情的菜单均在正文源外；缺帧时允许首次采集，成功后继续冻结。
  const needsExternalFrame: boolean = initialFrame && (source === GLASS_HOME_SOURCE || source === GLASS_DECK_DETAILS_SOURCE);
  return !layoutSources.has(source) && !scrollingSources.has(source) && captureAllowed(preview) && (preview || needsExternalFrame || !(frozenSources.has(source) && (sourcePanels.get(source) ?? 0) > 0));
}
