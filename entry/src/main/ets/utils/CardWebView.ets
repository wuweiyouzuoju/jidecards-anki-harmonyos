// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { CardWebSession, CardWebHost } from '../model/CardWebSession';
import { CardWebBuffer, CardWebBufferHost, CARD_SESSION_STORAGE_SNAPSHOT, carryCardSessionStorage } from '../model/CardWebBuffer';
import { 媒体基地址 } from '../model/学习卡片HTML构建器';
import { CARD_RENDERING_SUPPORT } from '../model/CardRenderingSupport';

/** 学习与所有卡片预览共用；保留作者 HTTP 脚本、嵌套授权请求和视频播放条件。 */
export class CardWebAttributes implements AttributeModifier<WebAttribute> {
  applyNormalAttribute(instance: WebAttribute): void {
    instance.mixedMode(CARD_RENDERING_SUPPORT.web.allowHttpResources ? MixedMode.All : MixedMode.None)
      .mediaPlayGestureAccess(CARD_RENDERING_SUPPORT.web.mediaPlaybackRequiresGesture);
  }
}

class CardRenderProxy {
  private session: CardWebSession;
  constructor(session: CardWebSession) { this.session = session; }
  onRendered(documentId: number, revision: number, error: string, background: string): void {
    this.session.rendered(documentId, revision, error, background);
  }
}

/** ArkWeb adapter; completion comes from the renderer, not runJavaScript's Promise serialization. */
export class CardWebView {
  private controller: webview.WebviewController;
  private session: CardWebSession;
  private buffer: CardWebBuffer | null = null;
  private spareController: webview.WebviewController | null = null;
  private hasDisplayed: boolean = false;
  private audioEnabled: boolean = true;
  constructor(controller: webview.WebviewController, shown: (background: string, appearanceOnly: boolean) => void,
    failed: (message: string) => void, spareController: webview.WebviewController | null = null,
    switched: (slot: number) => void = (_slot: number): void => {}) {
    this.controller = controller;
    const host: CardWebHost = {
      load: (html: string): void => { controller.loadData(html, 'text/html', 'UTF-8', 媒体基地址, ' '); },
      evaluate: (script: string): Promise<string> => controller.runJavaScript(script),
      shown: shown,
      failed: failed
    };
    this.session = new CardWebSession(host);
    this.spareController = spareController;
    if (spareController !== null) {
      const port: CardWebBufferHost = {
        load: async (slot: number, html: string, isCurrent: () => boolean): Promise<void> => {
          let document: string = html;
          if (this.hasDisplayed && this.buffer !== null) {
            const storage: string = await this.controllerAt(this.buffer.activeSlot()).runJavaScript(CARD_SESSION_STORAGE_SNAPSHOT);
            if (!isCurrent()) return;
            document = carryCardSessionStorage(html, storage);
          }
          if (!isCurrent()) return;
          const target: webview.WebviewController = this.controllerAt(slot);
          target.setAudioMuted(true);
          target.onActive();
          target.loadData(document, 'text/html', 'UTF-8', 媒体基地址, ' ');
        },
        evaluate: (slot: number, script: string): Promise<string> => this.controllerAt(slot).runJavaScript(script),
        shown: (slot: number, background: string, appearanceOnly: boolean): void => {
          this.hasDisplayed = true;
          switched(slot);
          // 冻结旧视图保留其最后一帧；下一次作为备用视图时重新激活。
          try {
            this.controllerAt(1 - slot).setAudioMuted(true);
            this.controllerAt(1 - slot).onInactive();
            this.controllerAt(slot).setAudioMuted(!this.audioEnabled);
          } catch (error) { console.info(`Card inactive: ${error}`); }
          shown(background, appearanceOnly);
        },
        failed: failed
      };
      this.buffer = new CardWebBuffer(port);
    }
  }
  controllerAt(slot: number): webview.WebviewController {
    return slot === 1 && this.spareController !== null ? this.spareController : this.controller;
  }
  isRelevant(slot: number): boolean { return this.buffer === null || this.buffer.isRelevant(slot); }
  setTheme(isDark: boolean): void {
    if (this.buffer === null) this.session.setTheme(isDark);
    else this.buffer.setTheme(isDark);
  }
  setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    const slots: number[] = this.buffer === null ? [0] : [0, 1];
    for (const slot of slots) {
      try {
        this.controllerAt(slot).setAudioMuted(!(enabled && (this.buffer === null ||
          (this.hasDisplayed && this.buffer.activeSlot() === slot))));
      } catch (error) { console.info(`Card audio mute: ${error}`); }
    }
  }
  /** @throws {Error} The page owns attach failures. */
  attach(slot: number = 0): void {
    const session: CardWebSession = this.buffer === null ? this.session : this.buffer.session(slot);
    this.controllerAt(slot).registerJavaScriptProxy(new CardRenderProxy(session), 'jideCardRuntime', ['onRendered']);
  }
  /** @throws {Error} The page owns initial load failures. */
  show(html: string, key: number, side: string, scrollToAnswer: boolean = false): void {
    if (this.buffer === null) this.session.show(html, key, side, scrollToAnswer);
    else this.buffer.show(html, key, side, scrollToAnswer);
  }
  reset(): void {
    if (this.buffer === null) this.session.reset();
    else this.buffer.reset();
  }
}
