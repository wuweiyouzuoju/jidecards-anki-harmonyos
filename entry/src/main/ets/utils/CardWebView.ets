// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { CardWebSession, CardWebHost } from '../model/CardWebSession';
import { 媒体基地址 } from '../model/学习卡片HTML构建器';

class CardRenderProxy {
  private session: CardWebSession;
  constructor(session: CardWebSession) { this.session = session; }
  onRendered(documentId: number, revision: number, error: string): void {
    this.session.rendered(documentId, revision, error);
  }
}

/** ArkWeb adapter; completion comes from the renderer, not runJavaScript's Promise serialization. */
export class CardWebView {
  private controller: webview.WebviewController;
  private session: CardWebSession;
  constructor(controller: webview.WebviewController, shown: () => void, failed: (message: string) => void) {
    this.controller = controller;
    const host: CardWebHost = {
      load: (html: string): void => { controller.loadData(html, 'text/html', 'UTF-8', 媒体基地址, ' '); },
      evaluate: (script: string): Promise<string> => controller.runJavaScript(script),
      shown: shown,
      failed: failed
    };
    this.session = new CardWebSession(host);
  }
  /** @throws {Error} The page owns attach failures. */
  attach(): void {
    this.controller.registerJavaScriptProxy(new CardRenderProxy(this.session), 'jideCardRuntime', ['onRendered']);
  }
  /** @throws {Error} The page owns initial load failures. */
  show(html: string, key: number, side: string, scrollToAnswer: boolean = false): void {
    this.session.show(html, key, side, scrollToAnswer);
  }
  reset(): void { this.session.reset(); }
}
