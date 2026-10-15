// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NoteFieldImage } from './NoteImageDraft';
import type { NoteFieldAudio } from './NoteAudioDraft';

/** Core 的 newFields 按新 ord 指向旧 ord；未映射字段不会混入其它字段。 */
export function mapEditorFields(fields: string[], mapping: number[]): string[] {
  return mapping.map((old: number): string => old >= 0 ? fields[old] ?? '' : '');
}
export function mapEditorImages(images: NoteFieldImage[], mapping: number[]): NoteFieldImage[] {
  const result: NoteFieldImage[] = [];
  mapping.forEach((old: number, index: number): void => {
    if (old < 0) return;
    images.filter((item: NoteFieldImage): boolean => item.fieldIndex === old).forEach((item: NoteFieldImage): void => {
      result.push({ id: result.length + 1, fieldIndex: index, uri: item.uri, filename: item.filename,
        reference: item.reference, kind: item.kind });
    });
  });
  return result;
}
export function mapEditorAudios(audios: NoteFieldAudio[], mapping: number[]): NoteFieldAudio[] {
  const result: NoteFieldAudio[] = [];
  mapping.forEach((old: number, index: number): void => {
    if (old < 0) return;
    audios.filter((item: NoteFieldAudio): boolean => item.fieldIndex === old).forEach((item: NoteFieldAudio): void => {
      result.push({ id: result.length + 1, fieldIndex: index, uri: item.uri, filename: item.filename,
        reference: item.reference, label: item.label, temporary: item.temporary });
    });
  });
  return result;
}
