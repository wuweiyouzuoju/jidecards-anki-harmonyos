// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeNoteTextEntities } from './NoteRichText';
/** v1 transport shared with desktop/anki-note-links/domain.py. HTML is a derived view. */
export const NOTE_LINK_MARKER: string = '<!--jide-links:v1:';
export const NOTE_LINK_SUPPORT = {
  version: 1, identity: 'Anki note GUID', storage: 'note field', field: '关联',
  legacy: 'ml-mirror-row[data-guid]', navigation: 'read-only preview; retains study state',
  editing: 'outgoing links and global target aliases; incoming links derived locally',
  entryPoints: ['editor outer wheel reference card', 'new and existing note editor below tags', 'study more menu', 'card preview toolbar'],
  inlineReferences: 'selection or caret; local display text; saved atomically with note; no schema preparation required',
    inlineAppearance: 'current theme container background; no added underline',
    search: 'shared live search field; 200ms debounce; input remains editable; selected reference text fixed below results',
  agentAccess: 'UI observation; user controls own edits'
};
export interface NoteLinkData { v: number; guid: string; targets: string[]; alias: string; }
export interface NoteLinkNode { noteId: number; guid: string; title: string; metadata: string; }
export interface NoteLinkTarget { noteId: number; guid: string; title: string; cardIds: number[]; }
export interface NoteLinkRow { guid: string; label: string; alias: string; noteId: number; cardIds: number[]; }
export interface NoteLinkView { guid: string; outgoing: NoteLinkRow[]; incoming: NoteLinkRow[]; }

export function emptyNoteLinks(guid: string): NoteLinkData { return { v: 1, guid: guid, targets: [], alias: '' }; }
export function linkEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function linkPlain(text: string): string {
  const plain: string = text.replace(/<[^>]*>/g, '');
  return decodeNoteTextEntities(plain) ?? plain;
}
/** Only formatting survives; event handlers and resource-bearing attributes never do. */
export function sanitizeLinkAlias(html: string): string {
  const cleaned: string = html.replace(/<(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  return cleaned.replace(/<[^>]*>/g, (token: string): string => {
    if (/^<\/?(?:div|p|li)\b/i.test(token)) return '<br>';
    const match: RegExpMatchArray | null = token.match(/^<(\/?)(b|strong|i|em|u|s|del|mark|sub|sup|code|br|span|font)\b([^>]*)>$/i);
    if (match === null) return '';
    const tag: string = match[2].toLowerCase();
    if (match[1] === '/') return tag === 'br' ? '' : '</' + tag + '>';
    const styleMatch: RegExpMatchArray | null = match[3].match(/\bstyle\s*=\s*["']([^"']*)["']/i);
    const styles: string[] = [];
    for (const rule of (styleMatch?.[1] ?? '').split(';')) {
      const colon: number = rule.indexOf(':');
      const key: string = rule.substring(0, colon).trim().toLowerCase();
      const value: string = rule.substring(colon + 1).trim();
      if (/^(color|background-color|font-weight|font-style|text-decoration(?:-line|-color|-style)?)$/.test(key) &&
        /^[a-zA-Z0-9#(),.%\s-]+$/.test(value) && !/url|expression|javascript/i.test(value)) styles.push(key + ':' + value);
    }
    const color: RegExpMatchArray | null = match[3].match(/\bcolor\s*=\s*["']([a-zA-Z0-9#(),.% -]+)["']/i);
    if (tag === 'font' && color !== null) styles.push('color:' + color[1]);
    return '<' + tag + (styles.length ? ' style="' + linkEscape(styles.join(';')) + '"' : '') + '>';
  });
}
export function parseNoteLinks(field: string, guid: string): NoteLinkData | null {
  const start: number = field.indexOf(NOTE_LINK_MARKER);
  if (start < 0) {
    if (field.includes('<!--jide-links:')) throw new Error('Unsupported note links version');
    return null;
  }
  const end: number = field.indexOf('-->', start);
  if (end < 0 || field.indexOf('<!--jide-links:', start + NOTE_LINK_MARKER.length) >= 0) throw new Error('Invalid note links metadata');
  const data: NoteLinkData = JSON.parse(decodeURIComponent(field.substring(start + NOTE_LINK_MARKER.length, end))) as NoteLinkData;
  if (data.v !== 1 || data.guid !== guid || !Array.isArray(data.targets) || typeof data.alias !== 'string' ||
    data.targets.some((target: string): boolean => typeof target !== 'string' || target === '' || target === guid) ||
    new Set<string>(data.targets).size !== data.targets.length) throw new Error('Unsupported or damaged note links metadata');
  return data;
}
export function serializeNoteLinks(data: NoteLinkData): string {
  return NOTE_LINK_MARKER + encodeURIComponent(JSON.stringify(data)) + '-->';
}
export function noteLinkView(guid: string, nodes: NoteLinkNode[], targets: NoteLinkTarget[]): NoteLinkView {
  const records: Map<string, NoteLinkData> = new Map<string, NoteLinkData>();
  for (const node of nodes) {
    const data: NoteLinkData | null = parseNoteLinks(node.metadata, node.guid);
    if (data !== null) records.set(node.guid, data);
  }
  const outgoing: string[] = records.get(guid)?.targets ?? [];
  const incoming: string[] = nodes.filter((node: NoteLinkNode): boolean => records.get(node.guid)?.targets.includes(guid) ?? false)
    .map((node: NoteLinkNode): string => node.guid);
  const row = (target: string): NoteLinkRow => {
    const resolved: NoteLinkTarget | undefined = targets.find((item: NoteLinkTarget): boolean => item.guid === target);
    const alias: string = records.get(target)?.alias ?? '';
    return { guid: target, label: linkPlain(alias) || resolved?.title || target, alias: alias,
      noteId: resolved?.noteId ?? 0, cardIds: resolved?.cardIds ?? [] };
  };
  return { guid: guid, outgoing: outgoing.map(row), incoming: incoming.map(row) };
}
export function renderNoteLinkMirror(view: NoteLinkView, limit: number = 30): string {
  let remaining: number = limit;
  const section = (label: string, rows: NoteLinkRow[]): string => rows.length === 0 ? '' :
    '<div class="jide-links-label" style="opacity:.45;font-size:11px;margin:8px 2px 5px 11px">' + label + '</div>' + rows.map((row: NoteLinkRow): string => {
      if (remaining-- <= 0) return '';
      return '<div class="ml-mirror-row" style="display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:8px;background:rgba(127,127,127,.13);margin:0 0 4px;cursor:pointer" data-guid="' + linkEscape(row.guid) + '" data-nid="' + row.noteId +
      '" onclick="mlxGo(event)" role="link" tabindex="0">' +
      '<span style="flex:1 1 auto;min-width:0">' + (row.alias ? sanitizeLinkAlias(row.alias) : linkEscape(row.label)) + '</span><span aria-hidden="true">↗</span></div>';
    }).join('');
  if (view.outgoing.length + view.incoming.length === 0) return '';
  const body: string = section('我引用', view.outgoing) + section('引用我', view.incoming);
  return '<!--ml-mirror:start--><div class="ml-mirror" style="margin:10px 0;padding:9px 10px 6px;border-radius:12px;background:rgba(127,127,127,.09);border:1px solid rgba(127,127,127,.17);font-size:14px;line-height:1.45;overflow-wrap:anywhere;text-align:left">' +
    '<div style="font-weight:600">关联卡片 · ' + (view.outgoing.length + view.incoming.length) + '</div>' + body +
    (remaining < 0 ? '<div class="jide-links-more">+' + -remaining + '</div>' : '') + '</div><!--ml-mirror:end-->';
}
export function updateNoteLinkField(field: string, data: NoteLinkData, mirror: string): string {
  // Unknown versions are not overwritten. Preserve all user content outside our marked blocks.
  if (field.includes('<!--jide-links:') && !field.includes(NOTE_LINK_MARKER)) throw new Error('Unsupported note links version');
  if (field.includes(NOTE_LINK_MARKER)) parseNoteLinks(field, data.guid);
  const own: string = field.replace(/<!--jide-links:v1:[\s\S]*?-->/g, '')
    .replace(/<!--ml-mirror:start-->[\s\S]*?<!--ml-mirror:end-->/g, '');
  return own + serializeNoteLinks(data) + mirror;
}
