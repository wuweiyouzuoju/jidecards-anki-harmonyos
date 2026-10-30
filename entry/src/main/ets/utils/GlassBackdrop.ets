// SPDX-License-Identifier: AGPL-3.0-or-later
import { deviceInfo } from '@kit.BasicServicesKit';
import { UIContext } from '@kit.ArkUI';
import { SharedGlassBackdrop, SharedGlassRegion, warmSharedGlassSource } from 'jide_foundation';
import { APP_FOREGROUND_KEY } from '../model/AppLifecycleState';
export const GLASS_HOME_SOURCE: string = 'jide-glass-home-source';
export interface GlassRegion extends SharedGlassRegion {}
function captureAllowed(): boolean {
  return AppStorage.get<string>('surface_material') === 'glass' && (AppStorage.get<boolean>(APP_FOREGROUND_KEY) ?? false);
}
/** 产品只映射偏好与生命周期；采样、模糊和折射统一由系列HAR拥有。 */
@Component
export struct GlassBackdrop {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @Prop region: GlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @Prop radius: number = 16;
  @Prop contourPath: string = '';
  @Prop role: string = 'menu';
  @Prop source: string = '';
  onReady: () => void = (): void => {};
  build() {
    SharedGlassBackdrop({ source: this.source, region: this.region, radius: this.radius, contourPath: this.contourPath, role: this.role,
      active: this.material === 'glass' && this.foreground,
      dark: this.mode === 'dark' || (this.mode !== 'light' && this.systemDark), captureAllowed: (): boolean => sourceCaptureAllowed(this.source),
      onReady: this.onReady })
  }
}
export function warmGlassSource(ui: UIContext, source: string, active: boolean): void {
  warmSharedGlassSource(ui, source, active, (): boolean => sourceCaptureAllowed(source));
}

// 每个窗口只选择当前可见正文；弹窗不注册为源，叠层也不会采集自身。
const visibleSources: Map<number, string[]> = new Map<number, string[]>();
export function currentGlassSource(ui: UIContext): string {
  if (!deviceInfo.apiAvailable(23)) return '';
  const sources = visibleSources.get(ui.getWindowId() ?? -1);
  return sources === undefined ? '' : sources[sources.length - 1] ?? '';
}
export function glassSourceVisibility(ui: UIContext, source: string, visible: boolean): void {
  if (!deviceInfo.apiAvailable(23)) return;
  const key: number = ui.getWindowId() ?? -1;
  const previous: string[] = visibleSources.get(key) ?? [];
  const next: string[] = previous.filter((id: string): boolean => id !== source);
  if (visible) next.push(source);
  if (next.length > 0) visibleSources.set(key, next); else visibleSources.delete(key);
  warmGlassSource(ui, source, visible);
}

export function supportsGlassBackdrop(): boolean { return deviceInfo.apiAvailable(23); }

// 原生Popup或内嵌编辑器可在正文子树内挂载弹层；沿用打开前的真实帧，避免递归采入自身。
const frozenSources: Set<string> = new Set<string>();
const sourcePanels: Map<string, number> = new Map<string, number>();
export function setGlassSourceFreeze(source: string, freeze: boolean): void {
  if (freeze) frozenSources.add(source); else frozenSources.delete(source);
}
export function retainGlassPanel(source: string): void {
  if (source !== '') sourcePanels.set(source, (sourcePanels.get(source) ?? 0) + 1);
}
export function releaseGlassPanel(source: string): void {
  const count: number = sourcePanels.get(source) ?? 0;
  if (count <= 1) sourcePanels.delete(source); else sourcePanels.set(source, count - 1);
}
function sourceCaptureAllowed(source: string): boolean {
  return captureAllowed() && !(frozenSources.has(source) && (sourcePanels.get(source) ?? 0) > 0);
}
