// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';
import { 笔记服务 } from '../笔记服务';
import { AgentScope } from './AgentScope';
import { AgentToolRegistry, AgentReadToolHandler } from './AgentToolRegistry';
import { AgentDocumentStore } from './AgentDocumentStore';
import { AgentDocumentAccess, AgentDocumentInfo } from '../../model/agent/AgentDocuments';
import { agentNoteMediaItems, agentLocalMediaFilename, decodeAgentNoteMediaArguments,
  agentNoteMediaTools, AgentNoteMediaArguments, AgentNoteMediaItem } from '../../model/agent/AgentNoteMedia';
import { AGENT_IMPORT_MAX_FILE_BYTES, AGENT_IMPORT_MAX_VIDEO_BYTES,
  agentFileExtension, isSupportedAgentImageFile, isSupportedAgentVideoFile } from '../../model/agent/AgentFileImport';

class NoteMediaReadHandler implements AgentReadToolHandler {
  private tools: AgentNoteMediaTools;
  private name: string;
  constructor(tools: AgentNoteMediaTools, name: string) { this.tools = tools; this.name = name; }
  cancel(): void { this.tools.cancel(); }
  /** @throws {Error} 读取失败交给 Runner，不返回伪成功。 */
  execute(json: string): Promise<string> { return this.tools.execute(this.name, json); }
}

/** 卡库媒体只有经过已发现笔记的引用才能读取；资料区拥有会话快照。 */
export class AgentNoteMediaTools {
  private context: common.UIAbilityContext;
  private scope: AgentScope;
  private store: AgentDocumentStore;
  private access: AgentDocumentAccess;
  private generation: number = 0;
  private sequence: number = 0;
  private notes: 笔记服务 = new 笔记服务();
  constructor(context: common.UIAbilityContext, scope: AgentScope, store: AgentDocumentStore, access: AgentDocumentAccess) {
    this.context = context; this.scope = scope; this.store = store; this.access = access;
  }
  register(registry: AgentToolRegistry): void {
    for (const tool of agentNoteMediaTools()) registry.registerRead(tool.name, new NoteMediaReadHandler(this, tool.name));
  }
  cancel(): void { this.generation++; }
  /** @throws {Error} 失效引用、范围、文件和 IO 错误保留真实失败。 */
  async execute(name: string, json: string): Promise<string> {
    const args: AgentNoteMediaArguments = decodeAgentNoteMediaArguments(name, json);
    const conversationId: string = this.access.currentConversationId();
    const version: number = this.generation;
    this.scope.assertReadableNoteIds([args.noteId]);
    const fields: string[] = (await this.notes.获取笔记(args.noteId)).fields;
    if (version !== this.generation || conversationId !== this.access.currentConversationId()) throw new Error('cancelled');
    this.scope.assertReadableNoteIds([args.noteId]);
    if (args.fieldOrd !== undefined && args.fieldOrd >= fields.length) throw new Error('note_media_field_out_of_range');
    const items: AgentNoteMediaItem[] = agentNoteMediaItems(fields).filter(
      (item: AgentNoteMediaItem): boolean => args.fieldOrd === undefined || item.fieldOrd === args.fieldOrd);
    if (name === 'list_note_media') {
      return JSON.stringify({ noteId: args.noteId, media: items.slice(0, 100), total: items.length,
        truncated: items.length > 100, instruction: 'Import the selected reference, then read the returned documentId before drafting.' });
    }
    const item: AgentNoteMediaItem | undefined = items.find((entry: AgentNoteMediaItem): boolean =>
      entry.fieldOrd === args.fieldOrd && entry.mediaIndex === args.mediaIndex);
    if (item === undefined || item.filename !== args.expectedFilename) throw new Error('note_media_reference_changed');
    const filename: string = agentLocalMediaFilename(item.filename);
    if (!item.local || filename === '') throw new Error('note_media_external_or_invalid');
    if (item.kind === 'image' ? !isSupportedAgentImageFile(filename) : !isSupportedAgentVideoFile(filename)) {
      throw new Error('note_media_format_unsupported');
    }
    if (this.store.list(conversationId).length >= 30) throw new Error('note_media_document_limit');
    const path: string = `${this.context.filesDir}/collection.media/${filename}`;
    if (fs.lstatSync(path).isSymbolicLink()) throw new Error('note_media_external_or_invalid');
    const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
    try {
      const stat: fs.Stat = fs.statSync(file.fd);
      const limit: number = item.kind === 'video' ? AGENT_IMPORT_MAX_VIDEO_BYTES : AGENT_IMPORT_MAX_FILE_BYTES;
      if (!stat.isFile() || stat.size <= 0 || stat.size > limit) throw new Error('note_media_file_size_invalid');
      this.sequence++;
      const document: AgentDocumentInfo = this.store.stage(conversationId, file,
        { id: `note-${args.noteId}-${Date.now()}-${this.sequence}`, name: filename, extension: agentFileExtension(filename),
          byteSize: stat.size, pageCount: 1, warningCode: '' });
      this.store.submit(conversationId, [document.id]);
      this.access.submit([document.id]);
      return JSON.stringify({ status: 'media_available', noteId: args.noteId, fieldOrd: item.fieldOrd,
        mediaIndex: item.mediaIndex, documentId: document.id, name: document.name, kind: item.kind,
        instruction: item.kind === 'video' ? 'Use read_video_frames; audio is not transcribed.' :
          'Use read_document_page includeImage=true with a vision model, or ocr_document_page.' });
    } finally { fs.closeSync(file); }
  }
}
