// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NoteLinkRow, NoteLinkView } from './NoteLinks';

export interface NoteLinkGraphEdge { source: number; target: number; }
export interface NoteLinkGraph { nodes: NoteLinkRow[]; edges: NoteLinkGraphEdge[]; }

/** Share one node for reciprocal links while retaining both directed edges. */
export function noteLinkGraph(center: NoteLinkRow, view: NoteLinkView): NoteLinkGraph {
  const nodes: NoteLinkRow[] = [center];
  const edges: NoteLinkGraphEdge[] = [];
  const indices = new Map<string, number>([[center.guid, 0]]);
  const index = (row: NoteLinkRow): number => {
    const existing = indices.get(row.guid);
    if (existing !== undefined) return existing;
    const next = nodes.length;
    indices.set(row.guid, next);
    nodes.push(row);
    return next;
  };
  for (const row of view.outgoing) edges.push({ source: 0, target: index(row) });
  for (const row of view.incoming) edges.push({ source: index(row), target: 0 });
  return { nodes, edges };
}
