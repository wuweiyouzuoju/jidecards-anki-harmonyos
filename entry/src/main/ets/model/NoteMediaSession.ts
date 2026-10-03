// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NoteFieldImage } from './NoteImageDraft';
import { replaceNoteImageSource } from './NoteImageDraft';
import type { NoteFieldAudio } from './NoteAudioDraft';
import { noteAudioParts, replaceNoteAudioPart } from './NoteAudioDraft';
import { noteMediaParts, replaceNoteMediaPart } from './NoteMediaParts';

/** 弹层独立草稿；确认后移交表单，取消只清理本次新增的缓存。 */
export class NoteMediaSession {
  value: string;
  images: NoteFieldImage[];
  audios: NoteFieldAudio[];
  private fieldIndex: number;
  private sequence: number = 0;
  private token: string;
  private originalAudios: NoteFieldAudio[];
  private createdAudios: NoteFieldAudio[] = [];

  constructor(value: string, fieldIndex: number, images: NoteFieldImage[], audios: NoteFieldAudio[], token: string) {
    this.value = value; this.fieldIndex = fieldIndex; this.token = token;
    this.images = images.map((item: NoteFieldImage): NoteFieldImage => ({ id: item.id,
      fieldIndex: item.fieldIndex, uri: item.uri, filename: item.filename, reference: item.reference }));
    this.audios = audios.map((item: NoteFieldAudio): NoteFieldAudio => ({ id: item.id,
      fieldIndex: item.fieldIndex, uri: item.uri, filename: item.filename, label: item.label,
      temporary: item.temporary, reference: item.reference }));
    this.originalAudios = this.audios.slice();
    this.sequence = Math.max(0, ...images.map((item: NoteFieldImage): number => item.id),
      ...audios.map((item: NoteFieldAudio): number => item.id));
  }

  private nextReference(kind: string): string { return `jidecards-draft:${this.token}-${kind}-${++this.sequence}`; }

  addImage(uri: string, partIndex: number = -1, pendingId: number = -1): void {
    const part = noteMediaParts(this.value)[partIndex];
    if (partIndex >= 0 && (part === undefined || part.kind !== 'image')) return;
    const reference: string = partIndex >= 0 ? replaceNoteImageSource(part.text, this.nextReference('image')) : '';
    const pendingIndex: number = this.images.findIndex((item: NoteFieldImage): boolean => item.id === pendingId);
    this.removeImage(partIndex, pendingId);
    const item: NoteFieldImage = { id: ++this.sequence, fieldIndex: this.fieldIndex, uri: uri, filename: '',
      reference: reference === '' ? undefined : reference };
    if (pendingIndex >= 0 && partIndex < 0) this.images.splice(pendingIndex, 0, item);
    else this.images = this.images.concat([item]);
    if (partIndex >= 0) this.value = this.value.slice(0, part.start) + reference + this.value.slice(part.start);
  }

  removeImage(partIndex: number, pendingId: number = -1): void {
    const part = noteMediaParts(this.value)[partIndex];
    if (part !== undefined && part.kind === 'image') {
      this.images = this.images.filter((item: NoteFieldImage): boolean => item.reference !== part.text);
      this.value = replaceNoteMediaPart(this.value, partIndex, '');
    } else if (pendingId >= 0) this.images = this.images.filter((item: NoteFieldImage): boolean => item.id !== pendingId);
  }

  addAudio(uri: string, label: string, temporary: boolean, partIndex: number = -1, pendingId: number = -1): void {
    const part = noteAudioParts(this.value)[partIndex];
    if (partIndex >= 0 && (part === undefined || part.filename === '')) return;
    const reference: string = partIndex >= 0 ? `[sound:${this.nextReference('audio')}]` : '';
    const item: NoteFieldAudio = { id: ++this.sequence, fieldIndex: this.fieldIndex, uri: uri, filename: '',
      label: label, temporary: temporary, reference: reference === '' ? undefined : reference };
    const pendingIndex: number = this.audios.findIndex((audio: NoteFieldAudio): boolean => audio.id === pendingId);
    if (partIndex >= 0) {
      this.audios = this.audios.filter((audio: NoteFieldAudio): boolean => audio.reference !== part.text);
      this.value = replaceNoteAudioPart(this.value, partIndex, reference);
    } else if (pendingId >= 0) this.audios = this.audios.filter((audio: NoteFieldAudio): boolean => audio.id !== pendingId);
    if (pendingIndex >= 0 && partIndex < 0) this.audios.splice(pendingIndex, 0, item);
    else this.audios = this.audios.concat([item]);
    this.createdAudios.push(item);
  }

  changeValue(value: string): void {
    this.value = value;
    this.audios = this.audios.filter((item: NoteFieldAudio): boolean => item.reference === undefined || value.indexOf(item.reference) >= 0);
    this.images = this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined || value.indexOf(item.reference) >= 0);
  }

  removeAudio(id: number): void { this.audios = this.audios.filter((item: NoteFieldAudio): boolean => item.id !== id); }

  audioCleanup(committed: boolean): NoteFieldAudio[] {
    const candidates: NoteFieldAudio[] = committed ? this.originalAudios.concat(this.createdAudios) : this.createdAudios;
    return candidates.filter((item: NoteFieldAudio): boolean => !committed ||
      !this.audios.some((kept: NoteFieldAudio): boolean => kept.uri === item.uri));
  }
}
