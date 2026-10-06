// SPDX-License-Identifier: AGPL-3.0-or-later
import { CardWebSession } from './CardWebSession';
import type { CardWebHost } from './CardWebSession';

export interface CardWebBufferHost {
  load(slot: number, html: string, isCurrent: () => boolean): Promise<void>;
  evaluate(slot: number, script: string): Promise<string>;
  shown(slot: number, background: string): void;
  failed(message: string): void;
}

/** 新文档在备用 Web 完成后才换画面；同卡翻面保留原 document/window。 */
export class CardWebBuffer {
  private host: CardWebBufferHost;
  private sessions: CardWebSession[] = [];
  private visible: number = 0;
  private hasShown: boolean = false;
  private requestedSlot: number = 0;
  private requestedKey: number = -1;
  private generation: number = 0;

  constructor(host: CardWebBufferHost) {
    this.host = host;
    for (let slot: number = 0; slot < 2; slot++) {
      const index: number = slot;
      const port: CardWebHost = {
        load: (html: string): void => {
          const generation: number = this.generation;
          const isCurrent: () => boolean = (): boolean => generation === this.generation && this.isRelevant(index);
          host.load(index, html, isCurrent).catch((error: Error): void => {
            if (!isCurrent()) return;
            this.sessions[index].reset();
            host.failed(String(error));
          });
        },
        evaluate: (script: string): Promise<string> => host.evaluate(index, script),
        shown: (background: string): void => { this.complete(index, background); },
        failed: (message: string): void => { if (this.isRelevant(index)) host.failed(message); }
      };
      this.sessions.push(new CardWebSession(port));
    }
  }

  session(slot: number): CardWebSession { return this.sessions[slot]; }
  activeSlot(): number { return this.visible; }
  isRelevant(slot: number): boolean { return this.requestedKey !== -1 && slot === this.requestedSlot; }

  reset(): void {
    this.generation += 1;
    for (const session of this.sessions) session.reset();
    this.requestedKey = -1;
  }

  show(html: string, key: number, side: string, scrollToAnswer: boolean = false): void {
    if (this.requestedKey !== key) {
      this.reset();
      this.requestedSlot = this.hasShown ? 1 - this.visible : 0;
      this.requestedKey = key;
    }
    try {
      this.sessions[this.requestedSlot].show(html, key, side, scrollToAnswer);
    } catch (error) { this.host.failed(String(error)); }
  }

  private complete(slot: number, background: string): void {
    if (!this.isRelevant(slot)) return;
    this.visible = slot;
    this.hasShown = true;
    this.host.shown(slot, background);
  }
}

// 两个 Web 有各自的 sessionStorage，换卡前复制到新文档的最前面，保持模板跨卡缓存。
export const CARD_SESSION_STORAGE_SNAPSHOT: string = `(function(){
  var values=[];
  try { for(var i=0;i<sessionStorage.length;i++){var key=sessionStorage.key(i);values.push([key,sessionStorage.getItem(key)]);} }
  catch(error) { return null; }
  return values;
})()`;

export function carryCardSessionStorage(html: string, serialized: string): string {
  const source: string = JSON.stringify(serialized).replace(/</g, '\\u003c');
  const script: string = `(function(){try{
    var values=JSON.parse(${source});
    if(typeof values==='string') values=JSON.parse(values);
    if(!Array.isArray(values)) return;
    if(!values.every(function(pair){return Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&typeof pair[1]==='string';})) return;
    sessionStorage.clear();
    values.forEach(function(pair){sessionStorage.setItem(pair[0],pair[1]);});
  }catch(error){}})();`;
  return html.replace('<head>', `<head><script>${script}</script>`);
}
