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
    (!glassNavigationActive && preview && captureAllowed(true) && (sourcePanels.get(source) ?? 0) === 0), glassBackgroundSource(source));
}

// 默认取源只登记可见的整页正文。局部正文和弹窗仍可预热，供指定来源的菜单使用。
const visibleSources: Map<number, string[]> = new Map<number, string[]>();
export function currentGlassSource(ui: UIContext): string {
  if (deviceInfo.apiAvailable(23)) {
    const sources = visibleSources.get(ui.getWindowId() ?? -1);
    return sources === undefined ? '' : sources[sources.length - 1] ?? '';
  }
  return '';
}
export function glassSourceVisibility(ui: UIContext, source: string, visible: boolean, preview: boolean = false,
  pageBackdrop: boolean = true): void {
  if (deviceInfo.apiAvailable(23)) {
    if (pageBackdrop && !source.startsWith('jide-glass-dialog-source-')) {
      const key: number = ui.getWindowId() ?? -1;
      const previous: string[] = visibleSources.get(key) ?? [];
      const next: string[] = previous.filter((id: string): boolean => id !== source);
      if (visible) next.push(source);
      if (next.length > 0) visibleSources.set(key, next); else visibleSources.delete(key);
    }
    warmGlassSource(ui, source, visible && captureAllowed(preview), preview);
  }
}

export function supportsGlassBackdrop(): boolean { return deviceInfo.apiAvailable(23); }

// 原生Popup或内嵌编辑器可在正文子树内挂载弹层；沿用打开前的真实帧，避免递归采入自身。
const frozenSources: Set<string> = new Set<string>();
let glassNavigationActive: boolean = false;
export function setGlassNavigationActive(active: boolean): void {
  glassNavigationActive = active;
}
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
const panelActivityObservers: Set<(active: boolean, source: string) => void> = new Set<(active: boolean, source: string) => void>();
/** 背景拥有者随弹层冻结同一场景；只在首个打开和最后关闭时通知。 */
export function observeGlassPanelActivity(observer: (active: boolean, source: string) => void): () => void {
  panelActivityObservers.add(observer);
  observer(sourcePanels.size > 0, sourcePanels.keys().next().value ?? '');
  return (): void => { panelActivityObservers.delete(observer); };
}
function notifyGlassPanelActivity(wasActive: boolean, source: string): void {
  const active: boolean = sourcePanels.size > 0;
  if (active !== wasActive) panelActivityObservers.forEach((observer: (active: boolean, source: string) => void): void => { observer(active, source); });
}
export function setGlassSourceFreeze(source: string, freeze: boolean): void {
  if (freeze) frozenSources.add(source); else frozenSources.delete(source);
}
export function retainGlassPanel(source: string, preview: boolean = false): void {
  const wasActive: boolean = sourcePanels.size > 0;
  if (preview && source !== '') previewPanels.set(source, (previewPanels.get(source) ?? 0) + 1);
  if (source !== '') sourcePanels.set(source, (sourcePanels.get(source) ?? 0) + 1);
  notifyGlassPanelActivity(wasActive, source);
}
export function releaseGlassPanel(source: string, preview: boolean = false): void {
  const wasActive: boolean = sourcePanels.size > 0;
  if (preview) {
    const previews: number = previewPanels.get(source) ?? 0;
    if (previews <= 1) previewPanels.delete(source); else previewPanels.set(source, previews - 1);
  }
  const count: number = sourcePanels.get(source) ?? 0;
  if (count <= 1) sourcePanels.delete(source); else sourcePanels.set(source, count - 1);
  notifyGlassPanelActivity(wasActive, source);
}
export function sourceCaptureAllowed(source: string, initialFrame: boolean = false): boolean {
  // 显式预览来自原生窗口，正文源不包含该窗口；扁平模式没有预热帧，允许首次真实采集。
  const preview: boolean = (previewPanels.get(source) ?? 0) > 0;
  // 注册的页面正文源不含其兄弟弹层；尺寸/清晰度升级缺帧时允许首次采集，成功后继续冻结。
  const needsExternalFrame: boolean = initialFrame && (source === GLASS_HOME_SOURCE || source === GLASS_DECK_DETAILS_SOURCE || source.startsWith('jide-glass-dialog-source-') || source.startsWith('jide-glass-source-'));
  return !glassNavigationActive && !layoutSources.has(source) && !scrollingSources.has(source) && captureAllowed(preview) && (preview || needsExternalFrame || !((frozenSources.has(source) || source.startsWith('jide-glass-')) && (sourcePanels.get(source) ?? 0) > 0));
}

// 原生弹窗的Builder不保证继承组件Provide；菜单按仍挂载的弹窗取源，不能退回底层页面。
const mountedDialogSources: string[] = [];
const dialogBackgroundSources: Map<string, string> = new Map<string, string>();
export function glassBackgroundSource(source: string): string {
  return dialogBackgroundSources.get(source) ?? GLASS_BACKGROUND_SOURCE;
}
export function dialogGlassSourceMounted(source: string, mounted: boolean, backgroundSource: string = GLASS_BACKGROUND_SOURCE): void {
  const index: number = mountedDialogSources.indexOf(source);
  if (index >= 0) mountedDialogSources.splice(index, 1);
  if (mounted) { mountedDialogSources.push(source); dialogBackgroundSources.set(source, backgroundSource || GLASS_BACKGROUND_SOURCE); }
  else dialogBackgroundSources.delete(source);
}
export function currentPopupGlassSource(ui: UIContext): string {
  return mountedDialogSources[mountedDialogSources.length - 1] ?? currentGlassSource(ui);
}
