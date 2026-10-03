// SPDX-License-Identifier: AGPL-3.0-or-later
import { abilityDelegatorRegistry, TestRunner } from '@kit.TestKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { AgentDocumentStore } from '../../../main/ets/backend/agent/AgentDocumentStore';
import { AgentDocumentAccess } from '../../../main/ets/model/agent/AgentDocuments';
import { AgentToolRegistry } from '../../../main/ets/backend/agent/AgentToolRegistry';
import { registerAgentDocumentTools } from '../../../main/ets/backend/agent/AgentDocumentTools';
import { UTF8编码 } from '../../../main/ets/proto/core/utf8';

function check(value: boolean, message: string): void { if (!value) throw new Error(message); }
function fixturePdf(): string {
  const stream: string = 'BT /F1 28 Tf 72 720 Td (JIDE OCR 12345) Tj ET';
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 6 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    '<< /Length 3 >>\nstream\nq Q\nendstream'
  ];
  let content: string = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index: number = 0; index < objects.length; index++) {
    offsets.push(content.length); content += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref: number = content.length;
  content += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index: number = 1; index < offsets.length; index++) content += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  return content + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
/** @throws {Error} 只写 test cacheDir 的合成数据；失败由 onRun 报告。 */
function writeFixture(path: string, bytes: Uint8Array): void {
  const file: fs.File = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
  try {
    for (let offset: number = 0; offset < bytes.length;) {
      const count: number = fs.writeSync(file.fd, bytes.slice(offset, offset + 65536).buffer as ArrayBuffer);
      if (count <= 0) throw new Error('fixture_write_failed');
      offset += count;
    }
  } finally { fs.closeSync(file); }
}
interface PageOutput { text: string; modelNotes: string; imageAttached: boolean; warning: string; }

/** 合成资料的真实 PDF/图像/OCR 回归；不使用密钥、不读写卡库。 */
export default class DocumentTestRunner implements TestRunner {
  onPrepare(): void {}
  async onRun(): Promise<void> {
    const delegator = abilityDelegatorRegistry.getAbilityDelegator();
    const context = delegator.getAppContext();
    const conversationId: string = `document-test-${Date.now()}`;
    const store: AgentDocumentStore = new AgentDocumentStore(context);
    try {
      const original: string = `${context.cacheDir}/document-test.pdf`;
      const bytes: Uint8Array = UTF8编码(fixturePdf());
      writeFixture(original, bytes);
      const file: fs.File = fs.openSync(original, fs.OpenMode.READ_ONLY);
      try {
        check(store.stage(conversationId, file, { id: 'pdf', name: 'Synthetic.pdf', extension: '.pdf', byteSize: bytes.length,
          pageCount: 1, warningCode: '' }).pageCount === 2, 'PDF page count');
      } finally { fs.closeSync(file); }
      store.submit(conversationId, ['pdf']);
      const access: AgentDocumentAccess = new AgentDocumentAccess(store);
      access.bind(conversationId, true, true);
      const registry: AgentToolRegistry = new AgentToolRegistry();
      registerAgentDocumentTools(registry, access);
      const read = await registry.execute({ id: 'text', name: 'read_document_page', argumentsJson: '{"documentId":"pdf","page":1}' });
      check((JSON.parse(read.outputJson) as PageOutput).text.includes('12345'), 'API 21 graphics text');
      const rendered = await registry.execute({ id: 'image', name: 'read_document_page', argumentsJson: '{"documentId":"pdf","page":1,"includeImage":true}' });
      check(rendered.images !== undefined && rendered.images.length === 1, 'PDF page image');
      const imageBytes: Uint8Array = new util.Base64Helper().decodeSync(rendered.images?.[0].imageUrl.split(',')[1] ?? '');
      const imagePath: string = `${context.cacheDir}/document-test.jpg`;
      writeFixture(imagePath, imageBytes);
      const imageFile: fs.File = fs.openSync(imagePath, fs.OpenMode.READ_ONLY);
      try { store.stage(conversationId, imageFile, { id: 'scan', name: 'Scan.jpg', extension: '.jpg',
        byteSize: imageBytes.length, pageCount: 1, warningCode: '' }); } finally { fs.closeSync(imageFile); }
      store.submit(conversationId, ['scan']); access.submit(['scan']);
      access.bind(conversationId, false);
      const scan = await registry.execute({ id: 'ocr', name: 'ocr_document_page', argumentsJson: '{"documentId":"scan","page":1}' });
      check((JSON.parse(scan.outputJson) as PageOutput).text.includes('12345'), 'real image OCR');
      const pdfOcr = await registry.execute({ id: 'pdf-ocr', name: 'ocr_document_page', argumentsJson: '{"documentId":"pdf","page":1}' });
      check((JSON.parse(pdfOcr.outputJson) as PageOutput).text.includes('12345'), 'real PDF OCR');
      await registry.execute({ id: 'notes', name: 'save_document_notes', argumentsJson: '{"documentId":"pdf","page":1,"notes":"Verified test reference"}' });
      const reopened: AgentDocumentStore = new AgentDocumentStore(context);
      check((await reopened.read(conversationId, 'pdf', 1, 'text')).notes === 'Verified test reference', 'persistent notes');
      const blank = await registry.execute({ id: 'blank', name: 'read_document_page', argumentsJson: '{"documentId":"pdf","page":2}' });
      check((JSON.parse(blank.outputJson) as PageOutput).text.length === 0, 'blank page not fabricated');
      check(access.annotate(['Q', 'A'], [{ documentId: 'pdf', page: 1 }])[1].includes('p.1'), 'source annotation');
      await delegator.print('DOCUMENT_TEST_PASS: pdf_text,pdf_image,image_ocr,pdf_ocr,persistent_notes,blank_page,source_annotation');
      await delegator.finishTest('DOCUMENT_TEST_PASS', 0);
    } catch (error) {
      try { await delegator.print(`DOCUMENT_TEST_FAIL: ${(error as Error).message}`); } catch (printError) { }
      try { await delegator.finishTest('DOCUMENT_TEST_FAIL', -1); } catch (finishError) { }
    } finally {
      try { store.removeConversation(conversationId); } catch (error) { }
    }
  }
}
