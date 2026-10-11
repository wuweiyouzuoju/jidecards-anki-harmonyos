// SPDX-License-Identifier: AGPL-3.0-or-later
import { noteMediaParts, noteImageSourceAttribute } from '../NoteMediaParts';
import { decodeNoteTextEntities } from '../NoteRichText';
import type { ProviderFunctionTool } from './ProviderProtocol';

export interface AgentNoteMediaItem { fieldOrd: number; mediaIndex: number; kind: string; filename: string; local: boolean; }
export interface AgentNoteMediaArguments { noteId: number; fieldOrd?: number; mediaIndex?: number; expectedFilename?: string; }

/** 只允许 collection.media 的平面文件；百分号编码与 HTML 实体在路径检查前解码。 */
export function agentLocalMediaFilename(value: string): string {
  let filename: string = value;
  try { filename = decodeURIComponent(filename); } catch (error) { }
  if (filename === '' || filename.length > 512 || filename === '.' || filename === '..' ||
    new RegExp('[/\\\\:\\x00-\\x1f\\x7f?#]').test(filename)) return '';
  return filename;
}
function readableMediaName(value: string): string {
  return new RegExp('^data:', 'i').test(value) ? '[inline media omitted]' : value.slice(0, 512);
}

export function agentNoteMediaItems(fields: string[]): AgentNoteMediaItem[] {
  const result: AgentNoteMediaItem[] = [];
  for (let fieldOrd: number = 0; fieldOrd < fields.length; fieldOrd++) {
    const items: AgentNoteMediaItem[] = [];
    for (const part of noteMediaParts(fields[fieldOrd])) {
      if (part.kind === 'image' || part.kind === 'video') items.push({ fieldOrd: fieldOrd,
        mediaIndex: items.length, kind: part.kind, filename: readableMediaName(part.filename),
        local: agentLocalMediaFilename(part.filename) !== '' });
    }
    // 导入模板可能使用 HTML video/source，而 Anki 标准引用使用 sound。
    const markup: string = fields[fieldOrd].replace(new RegExp('<!--[\\s\\S]*?-->|<(script|style)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>', 'gi'), '');
    const videos: RegExp = new RegExp('<video\\b[^>]*>[\\s\\S]*?<\\/video\\s*>|<video\\b[^>]*\\/?>', 'gi');
    let video: RegExpExecArray | null = videos.exec(markup);
    while (video !== null) {
      const tags: RegExp = new RegExp('<(?:video|source)\\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', 'gi');
      let tag: RegExpExecArray | null = tags.exec(video[0]);
      while (tag !== null) {
        const src = noteImageSourceAttribute(tag[0].replace(new RegExp('^<(video|source)', 'i'), '<img'));
        if (src !== undefined) {
          const filename: string = decodeNoteTextEntities(src.value) ?? src.value;
          items.push({ fieldOrd: fieldOrd, mediaIndex: items.length, kind: 'video', filename: readableMediaName(filename),
            local: agentLocalMediaFilename(filename) !== '' });
        }
        tag = tags.exec(video[0]);
      }
      video = videos.exec(markup);
    }
    result.push(...items);
  }
  return result;
}

export function decodeAgentNoteMediaArguments(name: string, json: string): AgentNoteMediaArguments {
  const value: AgentNoteMediaArguments = JSON.parse(json) as AgentNoteMediaArguments;
  const keys: string[] = name === 'list_note_media' ? ['noteId', 'fieldOrd'] :
    ['noteId', 'fieldOrd', 'mediaIndex', 'expectedFilename'];
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key: string): boolean => !keys.includes(key)) ||
    !Number.isSafeInteger(value.noteId) || value.noteId <= 0 ||
    (value.fieldOrd !== undefined && (!Number.isSafeInteger(value.fieldOrd) || value.fieldOrd < 0)) ||
    (name === 'import_note_media' && (value.fieldOrd === undefined ||
      !Number.isSafeInteger(value.mediaIndex) || (value.mediaIndex ?? -1) < 0 ||
      typeof value.expectedFilename !== 'string' || value.expectedFilename.length === 0))) {
    throw new Error('note_media_arguments_invalid');
  }
  return value;
}

export function isAgentNoteMediaTool(name: string): boolean {
  return name === 'list_note_media' || name === 'import_note_media';
}
export function agentNoteMediaTools(): ProviderFunctionTool[] {
  const note: string = '"noteId":{"type":"integer","minimum":1},"fieldOrd":{"type":"integer","minimum":0}';
  const rules: string = 'Use only note IDs discovered in this session. List media before importing one. ' +
    'Pass its exact fieldOrd/mediaIndex/filename; stale references fail. Import makes a read-only conversation snapshot, ' +
    'not a card-library write. Read returned documentId with read_document_page/OCR or read_video_frames before making cards. ' +
    'Never infer image or video contents from filenames; external URLs are not downloaded.';
  return [
    { name: 'list_note_media', description: '列出已发现笔记字段中的已有图片和视频引用；返回字段、媒体序号和本地可读性，不读取画面。',
      parametersJson: `{"type":"object","properties":{${note}},"required":["noteId"],"additionalProperties":false}`,
      exampleArgumentsJson: '{"noteId":1700000000000}', rules: rules },
    { name: 'import_note_media', description: '读取已有卡库图片或视频为当前会话资料；随后可理解图片、OCR 或视频按时间取帧制卡，不修改原笔记。',
      parametersJson: `{"type":"object","properties":{${note},"mediaIndex":{"type":"integer","minimum":0},"expectedFilename":{"type":"string","minLength":1}},"required":["noteId","fieldOrd","mediaIndex","expectedFilename"],"additionalProperties":false}`,
      exampleArgumentsJson: '{"noteId":1700000000000,"fieldOrd":0,"mediaIndex":0,"expectedFilename":"diagram.png"}', rules: rules }
  ];
}
