// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export function encodeCreateBackup(folder: string, force: boolean): Uint8Array {
  const writer = new 协议写入器();
  if (folder !== '') writer.写入字符串(1, folder);
  if (force) writer.写入布尔(2, true);
  writer.写入布尔(3, true);
  return writer.转为字节();
}

/** 字段号以 UPSTREAM.lock 的 Anki 26.05 config.proto 为准。 */
export enum ReviewPreferenceField { Rollover, LearnAheadSecs, TimeLimitSecs, ShowRemaining, ShowIntervals }

export interface ReviewPreferenceEdit {
  field: ReviewPreferenceField;
  value: number;
}

export class ReviewPreferences {
  rollover: number = 0;
  learnAheadSecs: number = 0;
  timeLimitSecs: number = 0;
  showRemaining: boolean = false;
  showIntervals: boolean = false;
}

export function preferenceSection(field: ReviewPreferenceField): number {
  return field === ReviewPreferenceField.Rollover || field === ReviewPreferenceField.LearnAheadSecs ? 1 : 2;
}

export function preferenceTag(field: ReviewPreferenceField): number {
  switch (field) {
    case ReviewPreferenceField.Rollover: return 2;
    case ReviewPreferenceField.LearnAheadSecs: return 3;
    case ReviewPreferenceField.ShowRemaining: return 3;
    case ReviewPreferenceField.ShowIntervals: return 4;
    case ReviewPreferenceField.TimeLimitSecs: return 5;
    default: throw new Error('invalid_review_preference');
  }
}

export function validatePreferenceEdit(edit: ReviewPreferenceEdit): void {
  preferenceTag(edit.field);
  const max: number = edit.field === ReviewPreferenceField.Rollover ? 23 :
    (edit.field === ReviewPreferenceField.ShowRemaining || edit.field === ReviewPreferenceField.ShowIntervals ? 1 : 4294967295);
  if (!Number.isInteger(edit.value) || edit.value < 0 || edit.value > max) {
    throw new Error('invalid_review_preference_value');
  }
}

/** 只解码本功能读取的字段；proto3 缺省值为 0/false，不套用本机默认偏好。 */
export function decodeReviewPreferences(bytes: Uint8Array): ReviewPreferences {
  const result: ReviewPreferences = new ReviewPreferences();
  const reader = new 协议读取器(bytes);
  while (!reader.已读完) {
    const tag = reader.读取标签()!;
    if ((tag.字段号 === 1 || tag.字段号 === 2) && tag.线类型 === 2) {
      const nested = new 协议读取器(reader.读取字节());
      while (!nested.已读完) {
        const child = nested.读取标签()!;
        if (child.线类型 === 0 && tag.字段号 === 1 && child.字段号 === 2) result.rollover = nested.读取变长整数();
        else if (child.线类型 === 0 && tag.字段号 === 1 && child.字段号 === 3) result.learnAheadSecs = nested.读取变长整数();
        else if (child.线类型 === 0 && tag.字段号 === 2 && child.字段号 === 3) result.showRemaining = nested.读取布尔();
        else if (child.线类型 === 0 && tag.字段号 === 2 && child.字段号 === 4) result.showIntervals = nested.读取布尔();
        else if (child.线类型 === 0 && tag.字段号 === 2 && child.字段号 === 5) result.timeLimitSecs = nested.读取变长整数();
        else nested.跳过字段(child.线类型);
      }
    } else reader.跳过字段(tag.线类型);
  }
  return result;
}

/** 原始消息上局部替换：未编辑字段、未知字段和其他子消息逐字节保留。 */
export function patchReviewPreferences(bytes: Uint8Array, edits: ReviewPreferenceEdit[]): Uint8Array {
  for (const edit of edits) validatePreferenceEdit(edit);
  const writer = new 协议写入器();
  const reader = new 协议读取器(bytes);
  const sections: number[] = [];
  const payloads: Uint8Array[] = [];
  while (!reader.已读完) {
    const start: number = reader.当前位置;
    const tag = reader.读取标签()!;
    if (tag.线类型 === 2 && edits.some((edit: ReviewPreferenceEdit): boolean => preferenceSection(edit.field) === tag.字段号)) {
      const payload: Uint8Array = reader.读取字节();
      const index: number = sections.indexOf(tag.字段号);
      if (index < 0) { sections.push(tag.字段号); payloads.push(payload); }
      else {
        const merged = new 协议写入器();
        merged.写入原始字节(payloads[index]); merged.写入原始字节(payload);
        payloads[index] = merged.转为字节();
      }
    } else {
      reader.跳过字段(tag.线类型);
      writer.写入原始字节(reader.截取片段(start));
    }
  }
  for (const section of [1, 2]) {
    const changes: ReviewPreferenceEdit[] = edits.filter((edit: ReviewPreferenceEdit): boolean => preferenceSection(edit.field) === section);
    if (changes.length === 0) continue;
    const index: number = sections.indexOf(section);
    // Core setter 会写整个子消息；缺少读取结果时拒绝写入，避免清空其他字段。
    if (index < 0) throw new Error('missing_preferences_section');
    const nested = new 协议读取器(payloads[index]);
    const updated = new 协议写入器();
    while (!nested.已读完) {
      const start: number = nested.当前位置;
      const tag = nested.读取标签()!;
      nested.跳过字段(tag.线类型);
      if (!(tag.线类型 === 0 && changes.some((edit: ReviewPreferenceEdit): boolean => preferenceTag(edit.field) === tag.字段号))) {
        updated.写入原始字节(nested.截取片段(start));
      }
    }
    for (const edit of changes) updated.写入变长整数(preferenceTag(edit.field), edit.value);
    writer.写入字节(section, updated.转为字节());
  }
  return writer.转为字节();
}
