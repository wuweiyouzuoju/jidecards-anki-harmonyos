// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { pdfService } from '@kit.PDFKit';
import { textRecognition } from '@kit.CoreVisionKit';
import { util } from '@kit.ArkTS';
import type { AgentDocumentInfo, AgentDocumentPage, AgentDocumentRepository } from '../../model/agent/AgentDocuments';
import { normalizeAgentDocumentText } from '../../model/agent/AgentDocumentText';
import { UTF8编码 } from '../../proto/core/utf8';

interface StoredDocument extends AgentDocumentInfo { submitted: boolean; textPages: string[]; }

/** 使用 API 12 已有的图形文字对象，避免调用 API 23 的 getTextContent。SDK 返回阅读顺序。 */
export function agentPdfPageText(page: pdfService.PdfPage): string {
  const sections: string[] = [];
  for (const object of page.getGraphicsObjects()) {
    if (object.type === pdfService.GraphicsObjectType.OBJECT_TEXT) {
      const text: pdfService.TextObject = object as pdfService.TextObject;
      if (text.text.length > 0) sections.push(text.text);
    }
  }
  return normalizeAgentDocumentText(sections.join('\n'));
}

/** @throws {Error} URI 授权期内完整复制，失败交给 stage 的导入错误边界；文件名不参与路径。 */
function copyDocumentFile(source: fs.File, size: number, path: string): void {
  const target: fs.File = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
  try {
    for (let offset: number = 0; offset < size;) {
      const buffer: ArrayBuffer = new ArrayBuffer(Math.min(65536, size - offset));
      const read: number = fs.readSync(source.fd, buffer, { offset: offset, length: buffer.byteLength });
      if (read <= 0) throw new Error('read_failed');
      let written: number = 0;
      while (written < read) {
        const count: number = fs.writeSync(target.fd, buffer.slice(written, read));
        if (count <= 0) throw new Error('read_failed');
        written += count;
      }
      offset += read;
    }
    fs.fsyncSync(target.fd);
  } finally { fs.closeSync(target); }
}

/** API 21 的持久资料区；会话拥有文档授权，逐页懒读取，缓存与原始文件分开。 */
export class AgentDocumentStore implements AgentDocumentRepository {
  private directory: string;
  constructor(context: common.Context) { this.directory = `${context.filesDir}/agent-documents`; }
  private folder(conversationId: string, id: string = ''): string {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(conversationId) || (id.length > 0 && !/^[A-Za-z0-9._-]{1,100}$/.test(id)) ||
      conversationId === '.' || conversationId === '..' || id === '.' || id === '..') throw new Error('invalid_document_id');
    return `${this.directory}/${conversationId}${id.length > 0 ? '/' + id : ''}`;
  }
  /** @throws {Error} 目录创建失败传播到导入/工具入口。 */
  private ensure(path: string): void { if (!fs.accessSync(path)) fs.mkdirSync(path, true); }
  /** @throws {Error} 原子写失败传播到导入/工具入口，不发布部分 JSON。 */
  private writeJson(path: string, value: Object): void {
    const temporary: string = `${path}.tmp`;
    const file: fs.File = fs.openSync(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      const bytes: Uint8Array = UTF8编码(JSON.stringify(value));
      for (let offset: number = 0; offset < bytes.length;) {
        const count: number = fs.writeSync(file.fd, bytes.slice(offset, offset + 65536).buffer as ArrayBuffer);
        if (count <= 0) throw new Error('document_write_failed');
        offset += count;
      }
      fs.fsyncSync(file.fd);
    } finally { fs.closeSync(file); }
    fs.renameSync(temporary, path);
  }
  /** @throws {Error} 清单 IO/格式失败传播到导入/工具入口。 */
  private manifest(conversationId: string, id: string): StoredDocument {
    const value: StoredDocument = JSON.parse(fs.readTextSync(`${this.folder(conversationId, id)}/manifest.json`)) as StoredDocument;
    if (value.id !== id || !Number.isSafeInteger(value.pageCount) || value.pageCount < 1 || !Array.isArray(value.textPages)) {
      throw new Error('document_manifest_invalid');
    }
    return value;
  }
  /** @throws {Error} PDF 打开失败传播到导入/工具入口。 */
  private openPdf(path: string): pdfService.PdfDocument {
    const document: pdfService.PdfDocument = new pdfService.PdfDocument();
    const result: pdfService.ParseResult = document.loadDocument(path, '');
    if (result !== pdfService.ParseResult.PARSE_SUCCESS) {
      try { document.releaseDocument(); } catch (error) { }
      throw new Error(result === pdfService.ParseResult.PARSE_ERROR_PASSWORD ? 'encrypted_file' : 'parse_failed');
    }
    return document;
  }
  /** @throws {Error} 完整复制或文档验证失败时，导入入口显示失败，不发布半成品。 */
  stage(conversationId: string, source: fs.File, info: AgentDocumentInfo, text: string = ''): AgentDocumentInfo {
    const folder: string = this.folder(conversationId, info.id);
    this.ensure(folder);
    copyDocumentFile(source, info.byteSize, `${folder}/original`);
    const pages: string[] = [];
    let count: number = 1;
    if (info.extension === '.pdf') {
      const document: pdfService.PdfDocument = this.openPdf(`${folder}/original`);
      try { count = document.getPageCount(); } finally { document.releaseDocument(); }
      if (count < 1) throw new Error('parse_failed');
    } else if (text.length > 0) {
      for (let offset: number = 0; offset < text.length; offset += 12000) pages.push(text.slice(offset, offset + 12000));
      count = pages.length;
    }
    const stored: StoredDocument = { id: info.id, name: info.name, extension: info.extension, byteSize: info.byteSize,
      pageCount: count, warningCode: info.warningCode, submitted: false, textPages: pages };
    this.writeJson(`${folder}/manifest.json`, stored);
    return { id: stored.id, name: stored.name, extension: stored.extension, byteSize: stored.byteSize,
      pageCount: stored.pageCount, warningCode: stored.warningCode };
  }
  /** @throws {Error} 提交标记写入失败时保留附件供用户重试，不假装已交给模型。 */
  submit(conversationId: string, ids: string[]): void {
    for (const id of ids) {
      const document: StoredDocument = this.manifest(conversationId, id);
      document.submitted = true;
      this.writeJson(`${this.folder(conversationId, id)}/manifest.json`, document);
    }
  }
  /** @throws {Error} 资料区损坏或 IO 失败交给 Runner/页面报告。 */
  list(conversationId: string): AgentDocumentInfo[] {
    const folder: string = this.folder(conversationId);
    if (!fs.accessSync(folder)) return [];
    const documents: AgentDocumentInfo[] = [];
    for (const id of fs.listFileSync(folder)) {
      const manifestPath: string = `${this.folder(conversationId, id)}/manifest.json`;
      if (!fs.accessSync(manifestPath)) continue;
      const stored: StoredDocument = this.manifest(conversationId, id);
      if (stored.submitted) documents.push({ id: stored.id, name: stored.name, extension: stored.extension,
        byteSize: stored.byteSize, pageCount: stored.pageCount, warningCode: stored.warningCode });
    }
    return documents;
  }
  /** @throws {Error} 缓存读取失败传播到页面工具，不能冒充空页。 */
  private cachedPage(folder: string, page: number): AgentDocumentPage | null {
    const path: string = `${folder}/page-${page}.json`;
    if (!fs.accessSync(path)) return null;
    return JSON.parse(fs.readTextSync(path)) as AgentDocumentPage;
  }
  /** @throws {Error} 图片编码失败传播到页面工具。 */
  private async pack(pixelMap: image.PixelMap): Promise<string> {
    const packer: image.ImagePacker = image.createImagePacker();
    try {
      const bytes: ArrayBuffer = await packer.packToData(pixelMap, { format: 'image/jpeg', quality: 85 });
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('document_image_too_large');
      return `data:image/jpeg;base64,${new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes))}`;
    } finally { await packer.release(); }
  }
  /** @throws {Error} OCR 不可用或识别失败传播到页面工具。 */
  private async ocr(pixelMap: image.PixelMap): Promise<string> {
    let ready: boolean = false;
    try {
      ready = await textRecognition.init();
      if (!ready) throw new Error('ocr_unavailable');
      const result: textRecognition.TextRecognitionResult = await textRecognition.recognizeText({ pixelMap: pixelMap });
      const text: string = normalizeAgentDocumentText(result.value);
      if (text.length === 0) throw new Error('no_extractable_text');
      return text;
    } finally { if (ready) await textRecognition.release(); }
  }
  /** @throws {Error} 页面/OCR/图像读取失败返回真实工具错误；页面可独立重试。 */
  async read(conversationId: string, id: string, pageNumber: number, mode: string): Promise<AgentDocumentPage> {
    const document: StoredDocument = this.manifest(conversationId, id);
    if (!document.submitted) throw new Error('document_not_in_session');
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > document.pageCount) throw new Error('document_page_out_of_range');
    const folder: string = this.folder(conversationId, id);
    const cached: AgentDocumentPage | null = this.cachedPage(folder, pageNumber);
    if (mode === 'text' && cached !== null) {
      if (cached.text.length === 0 && cached.warning.length === 0) cached.warning = 'no_text_use_ocr_or_image';
      return cached;
    }
    const result: AgentDocumentPage = { documentId: id, page: pageNumber, text: '', method: 'text',
      notes: cached?.notes ?? '', warning: document.warningCode };
    if (document.textPages.length > 0) {
      if (mode !== 'text') throw new Error('document_page_image_unavailable');
      result.text = document.textPages[pageNumber - 1];
    } else {
      let pdf: pdfService.PdfDocument | null = null;
      let page: pdfService.PdfPage | null = null;
      let source: image.ImageSource | null = null;
      let pixelMap: image.PixelMap | null = null;
      try {
        if (document.extension === '.pdf') {
          pdf = this.openPdf(`${folder}/original`);
          page = pdf.getPage(pageNumber - 1);
          try { result.text = agentPdfPageText(page); } catch (error) { result.warning = 'text_extraction_failed_use_image_or_ocr'; }
          if (mode !== 'text') {
            const width: number = page.getWidth();
            const height: number = page.getHeight();
            const scale: number = Math.min(3, 2400 / Math.max(width, height));
            const matrix: pdfService.PdfMatrix = new pdfService.PdfMatrix();
            matrix.x = 0; matrix.y = 0; matrix.width = Math.round(width * scale); matrix.height = Math.round(height * scale); matrix.rotate = 0;
            pixelMap = page.getCustomPagePixelMap(matrix, false, true);
          }
        } else {
          if (mode === 'text') { result.warning = 'image_requires_ocr_or_vision'; }
          else {
            source = image.createImageSource(`${folder}/original`);
            const info: image.ImageInfo = await source.getImageInfo();
            const scale: number = Math.min(1, 2400 / Math.max(info.size.width, info.size.height));
            pixelMap = await source.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(info.size.width * scale)),
              height: Math.max(1, Math.round(info.size.height * scale)) }, desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
          }
        }
        if (pixelMap !== null) {
          if (mode === 'ocr') { result.text = await this.ocr(pixelMap); result.method = 'ocr'; }
          else { result.image = { imageUrl: await this.pack(pixelMap) }; result.method = 'page_image'; }
        }
      } finally {
        if (pixelMap !== null) { try { await pixelMap.release(); } catch (error) { } }
        if (source !== null) { try { await source.release(); } catch (error) { } }
        if (page !== null) { try { page.release(); } catch (error) { } }
        if (pdf !== null) { try { pdf.releaseDocument(); } catch (error) { } }
      }
    }
    if (result.text.length === 0 && result.image === undefined && result.warning.length === 0) result.warning = 'no_text_use_ocr_or_image';
    const saved: AgentDocumentPage = { documentId: id, page: pageNumber, text: result.text,
      method: result.method, notes: result.notes, warning: result.warning };
    // 图片二进制不进入 JSON 或会话历史；需要时从原文件重新渲染。
    if (mode !== 'image' || cached === null) this.writeJson(`${folder}/page-${pageNumber}.json`, saved);
    return result;
  }
  /** @throws {Error} 笔记写入失败交给 Runner，不把模型摘要当原文。 */
  saveNotes(conversationId: string, id: string, page: number, notes: string): void {
    const folder: string = this.folder(conversationId, id);
    const saved: AgentDocumentPage | null = this.cachedPage(folder, page);
    if (saved === null) throw new Error('document_page_not_read');
    saved.notes = notes;
    this.writeJson(`${folder}/page-${page}.json`, saved);
  }
  /** @throws {Error} 删除会话时释放其资料；仅删除本服务构造的沙箱目录。 */
  removeConversation(conversationId: string): void {
    const folder: string = this.folder(conversationId);
    if (fs.accessSync(folder)) fs.rmdirSync(folder);
  }
}
