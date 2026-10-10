// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Card } from '../proto/messages/CardsMessages';
export interface BrowserRepositionScope { ids: number[]; unsupported: number; minimum: number; maximum: number; }
export async function inspectBrowserReposition(ids: number[], read: (id: number) => Promise<Card>): Promise<BrowserRepositionScope> {
  const accepted: number[] = ids.slice();
  const eligible: number[] = [];
  let minimum: number = Number.POSITIVE_INFINITY;
  let maximum: number = 0;
  for (const id of accepted) {
    const card: Card = await read(id);
    if (card.ctype === 0 || card.queue === 0) {
      eligible.push(id);
      const position: number = card.ctype === 0 && card.originalDeckId !== 0 ? card.originalDue : card.due;
      minimum = Math.min(minimum, position); maximum = Math.max(maximum, position);
    }
  }
  return { ids: eligible, unsupported: accepted.length - eligible.length,
    minimum: eligible.length === 0 ? 0 : minimum, maximum: maximum };
}
