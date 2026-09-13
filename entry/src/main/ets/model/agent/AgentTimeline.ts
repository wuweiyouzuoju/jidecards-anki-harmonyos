// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ChangeDraft, DraftOperation } from './AgentTypes';

/** 展示顺序独立于协议上下文；引用只定位本轮已有工具或草稿，不触发执行。 */
export interface AgentTimelineBlock {
  id: number;
  kind: string;
  text: string;
  refId: string;
  index: number;
  indexes: number[];
  toolName: string;
  images: string[];
}

/** 连续同类文本才合并，跨工具、图片或另一类输出后保留新位置。 */
export function appendAgentTimelineText(blocks: AgentTimelineBlock[], kind: string, text: string): void {
  if (text.length === 0) { return; }
  const last: AgentTimelineBlock | undefined = blocks[blocks.length - 1];
  if (last !== undefined && last.kind === kind) { last.text += text; return; }
  const block: AgentTimelineBlock = appendAgentTimelineReference(blocks, kind, '');
  block.text = text;
}

/** 工具开始、完成和草稿确认在同一位置更新，后续文本不被重新分组。 */
export function appendAgentTimelineReference(blocks: AgentTimelineBlock[], kind: string,
  refId: string): AgentTimelineBlock {
  const found: AgentTimelineBlock | undefined = refId.length === 0 ? undefined :
    blocks.find((block: AgentTimelineBlock): boolean => block.refId === refId && block.kind === kind);
  if (found !== undefined) { return found; }
  const block: AgentTimelineBlock = {
    id: blocks.length === 0 ? 0 : blocks[blocks.length - 1].id + 1,
    kind: kind, text: '', refId: refId, index: -1, indexes: [], toolName: '', images: []
  };
  blocks.push(block);
  return block;
}

/** 克隆流式块，避免旧 @State 快照随下一个事件一起改变。 */
export function cloneAgentTimeline(blocks: AgentTimelineBlock[]): AgentTimelineBlock[] {
  return blocks.map((block: AgentTimelineBlock): AgentTimelineBlock => ({
    id: block.id, kind: block.kind, text: block.text, refId: block.refId, index: block.index,
    indexes: block.indexes.slice(), toolName: block.toolName, images: block.images.slice()
  }));
}

interface PartialJsonString { text: string; end: number; }

/** 只解码已经收到的字符串前缀；未闭合转义留待后续事件，不补造 JSON 内容。 */
function readPartialJsonString(value: string, start: number): PartialJsonString {
  let text: string = '';
  let index: number = start + 1;
  while (index < value.length) {
    const char: string = value[index];
    if (char === '"') { return { text: text, end: index + 1 }; }
    if (char !== '\\') { text += char; index++; continue; }
    const escapeLength: number = value[index + 1] === 'u' ? 6 : 2;
    if (index + escapeLength > value.length) { break; }
    try { text += JSON.parse('"' + value.slice(index, index + escapeLength) + '"') as string; }
    catch (error) { break; }
    index += escapeLength;
  }
  return { text: text, end: value.length };
}

/** 参数预览只读取制卡字段和改卡正文；解析失败不能影响真正的工具校验。 */
export function agentDraftProgressText(toolName: string, argumentsJson: string): string {
  let value: string = argumentsJson.slice(0, 131072);
  const output: string[] = [];
  if (toolName === 'propose_update_notes') {
    const nested: RegExpMatchArray | null = value.match(new RegExp('"fieldUpdatesJson"\\s*:\\s*"'));
    if (nested === null || nested.index === undefined) { return ''; }
    value = readPartialJsonString(value, nested.index + nested[0].length - 1).text;
    const after: RegExp = new RegExp('"after"\\s*:\\s*"', 'g');
    let match: RegExpExecArray | null = after.exec(value);
    while (match !== null && output.length < 100) {
      const part: PartialJsonString = readPartialJsonString(value, match.index + match[0].length - 1);
      output.push(part.text); after.lastIndex = part.end; match = after.exec(value);
    }
  } else if (toolName === 'create_flashcards') {
    const fields: RegExp = new RegExp('"fields"\\s*:\\s*\\[', 'g');
    let match: RegExpExecArray | null = fields.exec(value);
    while (match !== null && output.length < 100) {
      let index: number = match.index + match[0].length;
      while (index < value.length && output.length < 100) {
        while (index < value.length && (' \n\r\t,'.includes(value[index]))) { index++; }
        if (value[index] !== '"') { break; }
        const part: PartialJsonString = readPartialJsonString(value, index);
        output.push(part.text); index = part.end;
      }
      fields.lastIndex = index; match = fields.exec(value);
    }
  }
  return output.filter((text: string): boolean => text.length > 0).join('\n\n').slice(0, 20000);
}

export interface AgentContentPart { kind: string; text: string; }

/** 图片跟随所属字段；纯图片修改放在未匹配列表，不丢失也不重复展示。 */
export function agentDraftOperationImages(draft: ChangeDraft, operationIndex: number): string[] {
  const urls: string[] = [];
  for (const attachment of draft.imageAttachments ?? []) {
    const firstIndex: number = draft.operations.findIndex((operation: DraftOperation): boolean =>
      operation.noteId === attachment.noteId && operation.fieldOrd === attachment.fieldOrd);
    if (firstIndex === operationIndex && attachment.candidate !== undefined &&
      attachment.candidate.thumbnailUrl.startsWith('https://')) {
      urls.push(attachment.candidate.thumbnailUrl);
    }
  }
  return urls;
}

/** Markdown 图片保留在原正文位置，只允许网络 HTTPS 图片。 */
export function agentContentParts(text: string): AgentContentPart[] {
  const parts: AgentContentPart[] = [];
  const pattern: RegExp = new RegExp('!\\[[^\\]]*\\]\\((https://[^\\s)]+)\\)', 'g');
  let offset: number = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    if (match.index > offset) { parts.push({ kind: 'text', text: text.slice(offset, match.index) }); }
    parts.push({ kind: 'image', text: match[1] });
    offset = match.index + match[0].length; match = pattern.exec(text);
  }
  if (offset < text.length) { parts.push({ kind: 'text', text: text.slice(offset) }); }
  return parts;
}
