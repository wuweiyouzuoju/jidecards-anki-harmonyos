// SPDX-License-Identifier: AGPL-3.0-or-later
import { CARD_REVIEWER_RUNTIME } from './CardReviewerRuntime';
import { applyCardTheme, buildCardAppearance } from './学习卡片HTML构建器';

export interface CardWebHost {
  load(html: string): void;
  evaluate(script: string): Promise<string>;
  shown(background: string, appearanceOnly: boolean): void;
  failed(message: string): void;
}

interface CardWebContent {
  html: string;
  side: string;
  scrollToAnswer: boolean;
  revision: number;
}

/** One document per card load, shared by its two sides. Serializes updates until the browser acknowledges them. */
export class CardWebSession {
  private host: CardWebHost;
  private documentId: number = 0;
  private key: number = -1;
  private revision: number = 0;
  private inFlight: number = 0;
  private pending: CardWebContent | null = null;
  private theme: boolean | null = null;
  private pendingTheme: boolean = false;
  private contentUnpublished: boolean = false;

  constructor(host: CardWebHost) { this.host = host; }

  reset(): void {
    this.documentId += 1;
    this.key = -1;
    this.inFlight = 0;
    this.pending = null;
    this.pendingTheme = false;
    this.contentUnpublished = false;
  }

  /** 主题与翻面共用确认队列；只改外观时不能重跑模板或清空用户输入。 */
  setTheme(isDark: boolean): void {
    if (this.theme === isDark) return;
    this.theme = isDark;
    if (this.key === -1) return;
    this.pendingTheme = true;
    this.flush();
  }

  /** @throws {Error} Initial Web loading failed; the owning page handles the failure. */
  show(html: string, key: number, side: string, scrollToAnswer: boolean = false): void {
    const content: CardWebContent = { html: html, side: side, scrollToAnswer: scrollToAnswer, revision: ++this.revision };
    if (this.key !== key) {
      this.reset();
      this.key = key;
      this.contentUnpublished = true;
      this.inFlight = content.revision;
      const bootstrap: string = `${CARD_REVIEWER_RUNTIME}\nwindow.__jideCardReviewer.start(${this.documentId},${content.revision},${JSON.stringify(side)},${scrollToAnswer});`;
      try {
        const themed: string = this.theme === null ? html : applyCardTheme(html, this.theme);
        this.host.load(themed.replace('<head>', `<head><script>${bootstrap}</script>`));
      } catch (error) {
        this.reset();
        throw error;
      }
    } else {
      this.contentUnpublished = true;
      this.pending = content;
      this.flush();
    }
  }

  rendered(documentId: number, revision: number, error: string, background: string = ''): void {
    if (documentId !== this.documentId || revision !== this.inFlight || this.inFlight === 0) return;
    this.inFlight = 0;
    if (error !== '') {
      this.reset();
      this.host.failed(error);
    } else if (this.pending !== null || this.pendingTheme) {
      this.flush();
    } else {
      const appearanceOnly: boolean = !this.contentUnpublished;
      this.contentUnpublished = false;
      this.host.shown(new RegExp('^#[0-9a-fA-F]{6}$').test(background) ? background : '', appearanceOnly);
    }
  }

  private flush(): void {
    if (this.inFlight !== 0 || (this.pending === null && !this.pendingTheme)) return;
    const content: CardWebContent | null = this.pending;
    this.pending = null;
    this.pendingTheme = false;
    const version: number = content === null ? ++this.revision : content.revision;
    this.inFlight = version;
    const documentId: number = this.documentId;
    let script: string;
    if (content === null) {
      const dark: boolean = this.theme === true;
      script = `window.__jideCardReviewer.setTheme(${documentId},${version},${dark},${JSON.stringify(buildCardAppearance(dark))});`;
    } else {
      const html: string = this.theme === null ? content.html : applyCardTheme(content.html, this.theme);
      script = `window.__jideCardReviewer.update(${documentId},${version},${JSON.stringify(html)},${JSON.stringify(content.side)},${content.scrollToAnswer});`;
    }
    try {
      this.host.evaluate(script).catch((error: Error): void => {
        this.rendered(documentId, version, String(error));
      });
    } catch (error) {
      this.rendered(documentId, version, String(error));
    }
  }
}
