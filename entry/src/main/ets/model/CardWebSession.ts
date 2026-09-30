// SPDX-License-Identifier: AGPL-3.0-or-later
import { CARD_REVIEWER_RUNTIME } from './CardReviewerRuntime';

export interface CardWebHost {
  load(html: string): void;
  evaluate(script: string): Promise<string>;
  shown(): void;
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

  constructor(host: CardWebHost) { this.host = host; }

  reset(): void {
    this.documentId += 1;
    this.key = -1;
    this.inFlight = 0;
    this.pending = null;
  }

  /** @throws {Error} Initial Web loading failed; the owning page handles the failure. */
  show(html: string, key: number, side: string, scrollToAnswer: boolean = false): void {
    const content: CardWebContent = { html: html, side: side, scrollToAnswer: scrollToAnswer, revision: ++this.revision };
    if (this.key !== key) {
      this.reset();
      this.key = key;
      this.inFlight = content.revision;
      const bootstrap: string = `${CARD_REVIEWER_RUNTIME}\nwindow.__jideCardReviewer.start(${this.documentId},${content.revision},${JSON.stringify(side)},${scrollToAnswer});`;
      try {
        this.host.load(html.replace('<head>', `<head><script>${bootstrap}</script>`));
      } catch (error) {
        this.reset();
        throw error;
      }
    } else {
      this.pending = content;
      this.flush();
    }
  }

  rendered(documentId: number, revision: number, error: string): void {
    if (documentId !== this.documentId || revision !== this.inFlight || this.inFlight === 0) return;
    this.inFlight = 0;
    if (error !== '') {
      this.reset();
      this.host.failed(error);
    } else if (this.pending !== null) {
      this.flush();
    } else {
      this.host.shown();
    }
  }

  private flush(): void {
    if (this.inFlight !== 0 || this.pending === null) return;
    const content: CardWebContent = this.pending;
    this.pending = null;
    this.inFlight = content.revision;
    const documentId: number = this.documentId;
    const script: string = `window.__jideCardReviewer.update(${documentId},${content.revision},${JSON.stringify(content.html)},${JSON.stringify(content.side)},${content.scrollToAnswer});`;
    try {
      this.host.evaluate(script).catch((error: Error): void => {
        this.rendered(documentId, content.revision, String(error));
      });
    } catch (error) {
      this.rendered(documentId, content.revision, String(error));
    }
  }
}
