// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs, statfs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { UTF8编码 } from '../../proto/core/utf8';

const TEXT_PAGE_CHARS: number = 12000;
const READ_BYTES: number = 64 * 1024;

/** 本地正文逐段落盘；清单只记录页数，不把整本书加载到 JSON 或 Provider 请求。 */
export class AgentTextPageWriter {
  private folder: string;
  private pending: string = '';
  private count: number = 0;
  private hasText: boolean = false;
  constructor(folder: string) { this.folder = folder; }
  /** @throws {Error} 写入不完整时终止解析，由资料拥有者删除未发布的快照。 */
  append(text: string): void {
    if (text.trim().length > 0) this.hasText = true;
    for (let offset: number = 0; offset < text.length;) {
      const size: number = Math.min(TEXT_PAGE_CHARS - this.pending.length, text.length - offset);
      this.pending += text.slice(offset, offset + size);
      offset += size;
      if (this.pending.length === TEXT_PAGE_CHARS) {
        const code: number = this.pending.charCodeAt(this.pending.length - 1);
        // UTF-16 代理对不能分别编码到两个 UTF-8 文件。
        if (code >= 0xD800 && code <= 0xDBFF) {
          const tail: string = this.pending.slice(-1);
          this.pending = this.pending.slice(0, -1);
          this.flush(); this.pending = tail;
        } else { this.flush(); }
      }
    }
  }
  /** @throws {Error} 本地页写入失败由附件入口报告。 */
  private flush(): void {
    if (this.pending.length === 0) return;
    const path: string = `${this.folder}/text-${this.count + 1}.txt`;
    const file: fs.File = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      const bytes: Uint8Array = UTF8编码(this.pending);
      for (let offset: number = 0; offset < bytes.length;) {
        const part: Uint8Array = bytes.slice(offset);
        const written: number = fs.writeSync(file.fd, part.buffer as ArrayBuffer);
        if (written <= 0) throw new Error('document_write_failed');
        offset += written;
      }
    } finally { fs.closeSync(file); }
    this.count++; this.pending = '';
  }
  /** @throws {Error} 仅供编码探测重试；调用方必须拥有尚未发布的全部分页。 */
  reset(): void {
    this.pending = ''; this.hasText = false;
    for (let page: number = 1; page <= this.count; page++) fs.unlinkSync(`${this.folder}/text-${page}.txt`);
    this.count = 0;
  }
  /** @throws {Error} 完成最后一页写入，返回真实分段数。 */
  finish(): number { this.flush(); return this.hasText ? this.count : 0; }
}

/** @throws {Error} 流式解码全文；UTF-8 失败时重建分页后尝试 GB18030，不把前缀冒充完整文件。 */
export async function streamAgentTextFile(source: fs.File, size: number, writer: AgentTextPageWriter,
  isBinary: (text: string) => boolean): Promise<void> {
  const head: ArrayBuffer = new ArrayBuffer(Math.min(3, size));
  const headSize: number = fs.readSync(source.fd, head, { offset: 0, length: head.byteLength });
  if (headSize !== head.byteLength) throw new Error('read_failed');
  const bytes: Uint8Array = new Uint8Array(head);
  const encoding: string = bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf-16le' :
    bytes[0] === 0xFE && bytes[1] === 0xFF ? 'utf-16be' : 'utf-8';
  try { await decodeFile(source, size, writer, encoding, isBinary); }
  catch (error) {
    if (encoding !== 'utf-8' || (error as Error).message !== 'encoding_unsupported') throw error as Error;
    writer.reset();
    await decodeFile(source, size, writer, 'gb18030', isBinary);
  }
}

/** @throws {Error} 解码、短读、二进制内容或磁盘写入失败保留真实失败。 */
async function decodeFile(source: fs.File, size: number, writer: AgentTextPageWriter,
  encoding: string, isBinary: (text: string) => boolean): Promise<void> {
  const decoder: util.TextDecoder = util.TextDecoder.create(encoding, { fatal: true, ignoreBOM: false });
  let first: boolean = true;
  for (let offset: number = 0; offset < size;) {
    const buffer: ArrayBuffer = new ArrayBuffer(Math.min(READ_BYTES, size - offset));
    const read: number = fs.readSync(source.fd, buffer, { offset: offset, length: buffer.byteLength });
    if (read <= 0) throw new Error('read_failed');
    offset += read;
    let text: string;
    try { text = decoder.decodeToString(new Uint8Array(buffer, 0, read), { stream: offset < size }); }
    catch (error) { throw new Error('encoding_unsupported'); }
    if (first && text.length > 0) {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      first = false;
    }
    if (isBinary(text)) throw new Error('binary_content');
    writer.append(text);
    if (offset % (READ_BYTES * 16) === 0) await new Promise<void>((resolve): void => { setTimeout(resolve, 0); });
  }
}

/** @throws {Error} 按实际剩余磁盘预检，不以固定附件大小拒绝正常资料；后续 IO 失败仍真实上抛。 */
export async function ensureAgentDocumentSpace(path: string, required: number): Promise<void> {
  if (!Number.isFinite(required) || required < 0 || await statfs.getFreeSize(path) < required + 16 * 1024 * 1024) {
    throw new Error('document_space_insufficient');
  }
}
