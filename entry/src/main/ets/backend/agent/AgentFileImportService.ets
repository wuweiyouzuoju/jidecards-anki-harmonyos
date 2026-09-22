// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { zlib } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { pdfService } from '@kit.PDFKit';
import { textRecognition } from '@kit.CoreVisionKit';
import {
  AGENT_IMPORT_MAX_ARCHIVE_BYTES,
  AGENT_IMPORT_MAX_CONTEXT_CHARS,
  AGENT_IMPORT_MAX_FILE_BYTES,
  AGENT_IMPORT_MAX_OCR_PAGES,
  AGENT_IMPORT_MAX_PDF_PAGES,
  AGENT_IMPORT_MAX_TEXT_BYTES,
  AgentImportedFile,
  agentFileExtension,
  isSupportedAgentDocumentFile,
  isSupportedAgentImageFile,
  isSupportedAgentTextFile
} from '../../model/agent/AgentFileImport';
import {
  agentMarkupToPlainText,
  extractAgentRtfText,
  extractAgentSharedStrings,
  extractAgentWorksheetText,
  normalizeAgentDocumentText
} from '../../model/agent/AgentDocumentText';

const READ_CHUNK_BYTES: number = 64 * 1024;
const MAX_ARCHIVE_ENTRIES: number = 2000;
const MAX_MARKUP_FILE_BYTES: number = 6 * 1024 * 1024;

interface ParsedAgentContent {
  content: string;
  warningCode: string;
}

class AgentOcrSession {
  private attempted: boolean = false;
  private ready: boolean = false;

  async recognize(pixelMap: image.PixelMap): Promise<string | null> {
    if (!this.attempted) {
      this.attempted = true;
      try {
        this.ready = await textRecognition.init();
      } catch (error) {
        this.ready = false;
      }
    }
    if (!this.ready) { return null; }
    try {
      const visionInfo: textRecognition.VisionInfo = { pixelMap: pixelMap };
      const result: textRecognition.TextRecognitionResult = await textRecognition.recognizeText(visionInfo);
      return normalizeAgentDocumentText(result.value);
    } catch (error) {
      return null;
    }
  }

  async release(): Promise<void> {
    if (!this.ready) { return; }
    try {
      await textRecognition.release();
    } catch (error) {
      // OCR 资源释放失败不改变已经完成的文件解析结果。
    }
    this.ready = false;
  }
}

function failedFile(id: string, name: string, extension: string,
  byteSize: number, errorCode: string): AgentImportedFile {
  return {
    id: id,
    name: name,
    extension: extension,
    byteSize: byteSize,
    content: '',
    errorCode: errorCode,
    warningCode: ''
  };
}

function successfulFile(id: string, name: string, extension: string,
  byteSize: number, parsed: ParsedAgentContent): AgentImportedFile {
  const oversized: boolean = parsed.content.length > AGENT_IMPORT_MAX_CONTEXT_CHARS;
  return {
    id: id,
    name: name,
    extension: extension,
    byteSize: byteSize,
    content: oversized ? parsed.content.slice(0, AGENT_IMPORT_MAX_CONTEXT_CHARS) : parsed.content,
    errorCode: '',
    warningCode: oversized ? 'content_truncated' : parsed.warningCode
  };
}

function parsedContent(content: string, warningCode: string = ''): ParsedAgentContent {
  return { content: normalizeAgentDocumentText(content), warningCode: warningCode };
}

/** @throws {Error} 附件读取或解包失败，传播到文件导入入口，禁止返回部分内容冒充成功。 */
function readFileBytes(file: fs.File, size: number): Uint8Array {
  const output: Uint8Array = new Uint8Array(size);
  let offset: number = 0;
  while (offset < size) {
    const length: number = Math.min(READ_CHUNK_BYTES, size - offset);
    const buffer: ArrayBuffer = new ArrayBuffer(length);
    const read: number = fs.readSync(file.fd, buffer, { offset: offset, length: length });
    if (read <= 0) { throw new Error('incomplete_file_read'); }
    output.set(new Uint8Array(buffer, 0, read), offset);
    offset += read;
  }
  return output;
}

function decodeWithEncoding(bytes: Uint8Array, encoding: string): string {
  const options: util.TextDecoderOptions = { fatal: true, ignoreBOM: false };
  const decoder: util.TextDecoder = util.TextDecoder.create(encoding, options);
  return decoder.decodeToString(bytes);
}

function decodeText(bytes: Uint8Array): string {
  let content: string = '';
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    content = decodeWithEncoding(bytes, 'utf-16le');
  } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    content = decodeWithEncoding(bytes, 'utf-16be');
  } else {
    try {
      content = decodeWithEncoding(bytes, 'utf-8');
    } catch (error) {
      content = decodeWithEncoding(bytes, 'gb18030');
    }
  }
  if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) { content = content.slice(1); }
  return content;
}

function decodeTextPrefix(bytes: Uint8Array): string {
  let end: number = bytes.length;
  let lastError: Error = new Error('encoding_unsupported');
  while (end > 0 && bytes.length - end <= 4) {
    try {
      return decodeText(bytes.slice(0, end));
    } catch (error) {
      lastError = error as Error;
      end -= 1;
    }
  }
  throw lastError;
}

function looksLikeBinary(content: string): boolean {
  if (content.indexOf('\u0000') >= 0) { return true; }
  let controlCount: number = 0;
  for (let index: number = 0; index < content.length; index++) {
    const code: number = content.charCodeAt(index);
    if ((code >= 0 && code < 9) || (code > 13 && code < 32)) { controlCount += 1; }
  }
  return controlCount > Math.max(2, Math.floor(content.length / 100));
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
function readTextFromOpenFile(file: fs.File, size: number, extension: string): ParsedAgentContent {
  const readSize: number = Math.min(size, AGENT_IMPORT_MAX_TEXT_BYTES);
  const bytes: Uint8Array = readFileBytes(file, readSize);
  let content: string = decodeTextPrefix(bytes);
  if (looksLikeBinary(content)) { throw new Error('binary_content'); }
  if (extension === '.html' || extension === '.htm' || extension === '.xml') {
    content = agentMarkupToPlainText(content);
  } else if (extension === '.rtf') {
    content = extractAgentRtfText(content);
  }
  return parsedContent(content, size > readSize ? 'content_truncated' : '');
}

function pathExists(path: string): boolean {
  try {
    return fs.accessSync(path);
  } catch (error) {
    return false;
  }
}

function deletePathRecursively(path: string): void {
  if (!pathExists(path)) { return; }
  try {
    if (fs.statSync(path).isDirectory()) {
      const names: string[] = fs.listFileSync(path);
      for (const name of names) { deletePathRecursively(`${path}/${name}`); }
      fs.rmdirSync(path);
    } else {
      fs.unlinkSync(path);
    }
  } catch (error) {
    // cacheDir 会由系统回收；清理失败不能掩盖主解析结果。
  }
}

/** @throws {Error} 附件读取或解包失败，传播到文件导入入口，禁止返回部分内容冒充成功。 */
function copyOpenFileToPath(source: fs.File, size: number, targetPath: string): void {
  const target: fs.File = fs.openSync(
    targetPath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
  try {
    let offset: number = 0;
    while (offset < size) {
      const length: number = Math.min(READ_CHUNK_BYTES, size - offset);
      const buffer: ArrayBuffer = new ArrayBuffer(length);
      const read: number = fs.readSync(source.fd, buffer, { offset: offset, length: length });
      if (read <= 0) { throw new Error('incomplete_file_read'); }
      let written: number = 0;
      while (written < read) {
        const remaining: ArrayBuffer = buffer.slice(written, read);
        const count: number = fs.writeSync(target.fd, remaining, { length: remaining.byteLength });
        if (count <= 0) { throw new Error('incomplete_file_write'); }
        written += count;
      }
      offset += read;
    }
  } finally {
    fs.closeSync(target);
  }
}

/** @throws {Error} 附件读取或解包失败，传播到文件导入入口，禁止返回部分内容冒充成功。 */
function readSandboxText(path: string): string {
  const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
  try {
    const size: number = fs.statSync(file.fd).size;
    if (size <= 0) { return ''; }
    if (size > MAX_MARKUP_FILE_BYTES) { throw new Error('archive_too_large'); }
    return decodeText(readFileBytes(file, size));
  } finally {
    fs.closeSync(file);
  }
}

/** @throws {Error} 附件读取或解包失败，传播到文件导入入口，禁止返回部分内容冒充成功。 */
function collectFiles(path: string, output: string[]): void {
  if (output.length >= MAX_ARCHIVE_ENTRIES) { throw new Error('archive_too_many_entries'); }
  const names: string[] = fs.listFileSync(path);
  for (const name of names) {
    const child: string = `${path}/${name}`;
    if (fs.statSync(child).isDirectory()) {
      collectFiles(child, output);
    } else {
      output.push(child);
      if (output.length >= MAX_ARCHIVE_ENTRIES) { throw new Error('archive_too_many_entries'); }
    }
  }
}

function sortedFilesContaining(files: string[], segment: string, suffix: string): string[] {
  const result: string[] = [];
  for (const path of files) {
    const lower: string = path.toLocaleLowerCase();
    if (lower.indexOf(segment) >= 0 && lower.endsWith(suffix)) { result.push(path); }
  }
  result.sort();
  return result;
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
function combineMarkupFiles(files: string[], titlePrefix: string): ParsedAgentContent {
  const sections: string[] = [];
  let total: number = 0;
  let truncated: boolean = false;
  for (let index: number = 0; index < files.length; index++) {
    const text: string = agentMarkupToPlainText(readSandboxText(files[index]));
    if (text.length === 0) { continue; }
    const section: string = `${titlePrefix} ${index + 1}\n${text}`;
    const remaining: number = AGENT_IMPORT_MAX_CONTEXT_CHARS - total;
    if (remaining <= 0) { truncated = true; break; }
    sections.push(section.slice(0, remaining));
    total += Math.min(section.length, remaining);
    if (section.length > remaining) { truncated = true; break; }
  }
  return parsedContent(sections.join('\n\n'), truncated ? 'content_truncated' : '');
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
function parseDocx(unpacked: string, files: string[]): ParsedAgentContent {
  const primary: string = `${unpacked}/word/document.xml`;
  if (!pathExists(primary)) { throw new Error('parse_failed'); }
  const sections: string[] = [agentMarkupToPlainText(readSandboxText(primary))];
  const extras: string[] = [];
  for (const path of files) {
    const lower: string = path.toLocaleLowerCase();
    if ((lower.indexOf('/word/header') >= 0 || lower.indexOf('/word/footer') >= 0 ||
      lower.endsWith('/word/footnotes.xml') || lower.endsWith('/word/endnotes.xml') ||
      lower.endsWith('/word/comments.xml')) && lower.endsWith('.xml')) {
      extras.push(path);
    }
  }
  extras.sort();
  for (const path of extras) {
    const text: string = agentMarkupToPlainText(readSandboxText(path));
    if (text.length > 0) { sections.push(text); }
  }
  return parsedContent(sections.join('\n\n'));
}

/** @throws {Error} 幻灯片读取失败，由单文件导入入口转换为失败状态。 */
function parsePptx(files: string[]): ParsedAgentContent {
  const slides: string[] = sortedFilesContaining(files, '/ppt/slides/slide', '.xml');
  const filtered: string[] = [];
  for (const path of slides) {
    if (path.toLocaleLowerCase().indexOf('/_rels/') < 0) { filtered.push(path); }
  }
  if (filtered.length === 0) { throw new Error('parse_failed'); }
  return combineMarkupFiles(filtered, '幻灯片');
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
function parseXlsx(unpacked: string, files: string[]): ParsedAgentContent {
  let shared: string[] = [];
  const sharedPath: string = `${unpacked}/xl/sharedStrings.xml`;
  if (pathExists(sharedPath)) { shared = extractAgentSharedStrings(readSandboxText(sharedPath)); }
  const sheets: string[] = sortedFilesContaining(files, '/xl/worksheets/sheet', '.xml');
  if (sheets.length === 0) { throw new Error('parse_failed'); }
  const sections: string[] = [];
  let total: number = 0;
  let truncated: boolean = false;
  for (let index: number = 0; index < sheets.length; index++) {
    const body: string = extractAgentWorksheetText(readSandboxText(sheets[index]), shared);
    if (body.length === 0) { continue; }
    const section: string = `工作表 ${index + 1}\n${body}`;
    const remaining: number = AGENT_IMPORT_MAX_CONTEXT_CHARS - total;
    if (remaining <= 0) { truncated = true; break; }
    sections.push(section.slice(0, remaining));
    total += Math.min(section.length, remaining);
    if (section.length > remaining) { truncated = true; break; }
  }
  return parsedContent(sections.join('\n\n'), truncated ? 'content_truncated' : '');
}

/** @throws {Error} 附件读取或解包失败，传播到文件导入入口，禁止返回部分内容冒充成功。 */
async function parseZipDocument(context: common.UIAbilityContext, source: fs.File,
  size: number, extension: string, id: string): Promise<ParsedAgentContent> {
  const root: string = `${context.cacheDir}/ai-agent-import-${id}`;
  const zipPath: string = `${root}/source.zip`;
  const unpacked: string = `${root}/unpacked`;
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(unpacked);
    copyOpenFileToPath(source, size, zipPath);
    const originalSize: number = await zlib.getOriginalSize(zipPath);
    if (originalSize > AGENT_IMPORT_MAX_ARCHIVE_BYTES) { throw new Error('archive_too_large'); }
    await zlib.decompressFile(zipPath, unpacked);
    const files: string[] = [];
    collectFiles(unpacked, files);
    if (extension === '.docx') { return parseDocx(unpacked, files); }
    if (extension === '.pptx') { return parsePptx(files); }
    if (extension === '.xlsx') { return parseXlsx(unpacked, files); }
    const contentPath: string = `${unpacked}/content.xml`;
    if ((extension === '.odt' || extension === '.ods' || extension === '.odp') && pathExists(contentPath)) {
      return parsedContent(agentMarkupToPlainText(readSandboxText(contentPath)));
    }
    if (extension === '.epub') {
      const htmlFiles: string[] = [];
      for (const path of files) {
        const lower: string = path.toLocaleLowerCase();
        if (lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) {
          htmlFiles.push(path);
        }
      }
      htmlFiles.sort();
      return combineMarkupFiles(htmlFiles, '章节');
    }
    throw new Error('parse_failed');
  } finally {
    deletePathRecursively(root);
  }
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
async function parseBook(context: common.UIAbilityContext, source: fs.File,
  size: number, extension: string, id: string): Promise<ParsedAgentContent> {
  if (!canIUse('SystemCapability.Reader.ReaderService.BookParser')) {
    throw new Error('readerkit_unavailable');
  }
  const path: string = `${context.cacheDir}/ai-agent-book-${id}${extension}`;
  try {
    copyOpenFileToPath(source, size, path);
    const readerKit: ESObject = await import('@kit.ReaderKit');
    const handler: ESObject = await readerKit.bookParser.getDefaultHandler(path);
    const spines: ESObject[] = handler.getSpineList();
    const sections: string[] = [];
    let total: number = 0;
    let truncated: boolean = false;
    for (let index: number = 0; index < spines.length; index++) {
      const raw: string = await handler.getSpineItemContent(spines[index].index);
      const text: string = agentMarkupToPlainText(raw);
      if (text.length === 0) { continue; }
      const section: string = `章节 ${index + 1}\n${text}`;
      const remaining: number = AGENT_IMPORT_MAX_CONTEXT_CHARS - total;
      if (remaining <= 0) { truncated = true; break; }
      sections.push(section.slice(0, remaining));
      total += Math.min(section.length, remaining);
      if (section.length > remaining) { truncated = true; break; }
    }
    return parsedContent(sections.join('\n\n'), truncated ? 'content_truncated' : '');
  } finally {
    deletePathRecursively(path);
  }
}

async function parseImage(source: fs.File, ocr: AgentOcrSession): Promise<ParsedAgentContent> {
  let imageSource: image.ImageSource | null = null;
  let pixelMap: image.PixelMap | null = null;
  try {
    imageSource = image.createImageSource(source.fd);
    const info: image.ImageInfo = await imageSource.getImageInfo();
    let width: number = info.size.width;
    let height: number = info.size.height;
    const longest: number = Math.max(width, height);
    if (longest > 2400) {
      width = Math.max(1, Math.round(width * 2400 / longest));
      height = Math.max(1, Math.round(height * 2400 / longest));
    }
    const desiredSize: image.Size = { width: width, height: height };
    const options: image.DecodingOptions = {
      desiredSize: desiredSize,
      desiredPixelFormat: image.PixelMapFormat.RGBA_8888
    };
    pixelMap = await imageSource.createPixelMap(options);
    const content: string | null = await ocr.recognize(pixelMap);
    if (content === null) { throw new Error('ocr_unavailable'); }
    if (content.length === 0) { throw new Error('no_extractable_text'); }
    return parsedContent(content, 'ocr_used');
  } finally {
    if (pixelMap !== null) {
      try { await pixelMap.release(); } catch (error) { }
    }
    if (imageSource !== null) {
      try { await imageSource.release(); } catch (error) { }
    }
  }
}

/** @throws {Error} 读取或解包失败，由单文件导入入口转换为失败状态。 */
async function parsePdf(context: common.UIAbilityContext, source: fs.File,
  size: number, id: string, ocr: AgentOcrSession): Promise<ParsedAgentContent> {
  const path: string = `${context.cacheDir}/ai-agent-pdf-${id}.pdf`;
  const document: pdfService.PdfDocument = new pdfService.PdfDocument();
  let loaded: boolean = false;
  try {
    copyOpenFileToPath(source, size, path);
    const result: pdfService.ParseResult = document.loadDocument(path, '');
    if (result === pdfService.ParseResult.PARSE_ERROR_PASSWORD) { throw new Error('encrypted_file'); }
    if (result !== pdfService.ParseResult.PARSE_SUCCESS) { throw new Error('parse_failed'); }
    loaded = true;
    const pageCount: number = document.getPageCount();
    const limit: number = Math.min(pageCount, AGENT_IMPORT_MAX_PDF_PAGES);
    const sections: string[] = [];
    let total: number = 0;
    let ocrPages: number = 0;
    let unreadablePages: number = 0;
    let usedOcr: boolean = false;
    let truncated: boolean = pageCount > limit;
    for (let index: number = 0; index < limit; index++) {
      const page: pdfService.PdfPage = document.getPage(index);
      let text: string = normalizeAgentDocumentText(page.getTextContent());
      if (text.length === 0 && ocrPages < AGENT_IMPORT_MAX_OCR_PAGES) {
        let pixelMap: image.PixelMap | null = null;
        try {
          pixelMap = page.getPagePixelMap();
          const recognized: string | null = await ocr.recognize(pixelMap);
          ocrPages += 1;
          if (recognized !== null && recognized.length > 0) {
            text = recognized;
            usedOcr = true;
          }
        } catch (error) {
          // 该页仍可记为未读取，继续处理其余页面。
        } finally {
          if (pixelMap !== null) {
            try { await pixelMap.release(); } catch (error) { }
          }
        }
      }
      if (text.length === 0) { unreadablePages += 1; continue; }
      const section: string = `第 ${index + 1} 页\n${text}`;
      const remaining: number = AGENT_IMPORT_MAX_CONTEXT_CHARS - total;
      if (remaining <= 0) { truncated = true; break; }
      sections.push(section.slice(0, remaining));
      total += Math.min(section.length, remaining);
      if (section.length > remaining) { truncated = true; break; }
    }
    const content: string = normalizeAgentDocumentText(sections.join('\n\n'));
    if (content.length === 0) {
      if (ocrPages > 0) { throw new Error('no_extractable_text'); }
      throw new Error('ocr_unavailable');
    }
    let warningCode: string = '';
    if (truncated) {
      warningCode = 'content_truncated';
    } else if (unreadablePages > 0) {
      warningCode = 'partial_content';
    } else if (usedOcr) {
      warningCode = 'ocr_used';
    }
    return parsedContent(content, warningCode);
  } finally {
    if (loaded) {
      try { document.releaseDocument(); } catch (error) { }
    }
    deletePathRecursively(path);
  }
}

function errorCodeOf(error: Error, knownText: boolean): string {
  const message: string = error.message;
  if (message === 'binary_content' || message === 'archive_too_large' ||
    message === 'archive_too_many_entries' || message === 'encrypted_file' ||
    message === 'ocr_unavailable' || message === 'no_extractable_text' ||
    message === 'readerkit_unavailable' || message === 'parse_failed') {
    return message === 'archive_too_many_entries' ? 'archive_too_large' : message;
  }
  if (knownText && message === 'encoding_unsupported') { return 'encoding_unsupported'; }
  return knownText ? 'encoding_unsupported' : 'unsupported_type';
}

async function parseSelectedFile(context: common.UIAbilityContext, uri: string,
  index: number, ocr: AgentOcrSession): Promise<AgentImportedFile> {
  const id: string = `import-${Date.now()}-${index}`;
  let file: fs.File | null = null;
  let name: string = `file-${index + 1}`;
  let extension: string = '';
  let byteSize: number = 0;
  try {
    file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    name = file.name.length > 0 ? file.name : name;
    extension = agentFileExtension(name);
    const stat: fs.Stat = fs.statSync(file.fd);
    byteSize = stat.size;
    if (byteSize <= 0) { return failedFile(id, name, extension, byteSize, 'empty_file'); }
    if (byteSize > AGENT_IMPORT_MAX_FILE_BYTES) {
      return failedFile(id, name, extension, byteSize, 'file_too_large');
    }
    try {
      let parsed: ParsedAgentContent;
      if (isSupportedAgentTextFile(name)) {
        parsed = readTextFromOpenFile(file, byteSize, extension);
      } else if (isSupportedAgentImageFile(name)) {
        parsed = await parseImage(file, ocr);
      } else if (extension === '.pdf') {
        parsed = await parsePdf(context, file, byteSize, id, ocr);
      } else if (extension === '.epub' || extension === '.mobi' || extension === '.azw' ||
        extension === '.azw3') {
        try {
          parsed = await parseBook(context, file, byteSize, extension, id);
        } catch (error) {
          if (extension !== '.epub') { throw new Error((error as Error).message); }
          parsed = await parseZipDocument(context, file, byteSize, extension, id);
        }
      } else if (isSupportedAgentDocumentFile(name)) {
        parsed = await parseZipDocument(context, file, byteSize, extension, id);
      } else if (extension === '.doc' || extension === '.xls' || extension === '.ppt') {
        return failedFile(id, name, extension, byteSize, 'legacy_office');
      } else {
        parsed = readTextFromOpenFile(file, byteSize, extension);
        parsed.warningCode = 'plain_text_detected';
      }
      if (parsed.content.length === 0) {
        return failedFile(id, name, extension, byteSize, 'no_extractable_text');
      }
      return successfulFile(id, name, extension, byteSize, parsed);
    } catch (error) {
      return failedFile(id, name, extension, byteSize,
        errorCodeOf(error as Error, isSupportedAgentTextFile(name)));
    }
  } catch (error) {
    return failedFile(id, name, extension, byteSize, 'read_failed');
  } finally {
    if (file !== null) {
      try { fs.closeSync(file); } catch (error) { }
    }
  }
}

/** 选择器 URI 是临时授权，必须在 select 返回后立即逐个读取。 */
export async function selectAndParseAgentFiles(
  context: common.UIAbilityContext,
  maxSelectNumber: number
): Promise<AgentImportedFile[]> {
  const options: picker.DocumentSelectOptions = new picker.DocumentSelectOptions();
  options.maxSelectNumber = Math.max(1, maxSelectNumber);
  const documentPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(context);
  const uris: string[] = await documentPicker.select(options);
  const result: AgentImportedFile[] = [];
  const ocr: AgentOcrSession = new AgentOcrSession();
  try {
    for (let index: number = 0; index < uris.length; index++) {
      result.push(await parseSelectedFile(context, uris[index], index, ocr));
    }
  } finally {
    await ocr.release();
  }
  return result;
}
