// SPDX-License-Identifier: AGPL-3.0-or-later

/** 富文本编辑器只拥有用户正文；同步元数据和展示镜像由关联服务拥有。 */
export function noteLinkEditorFields(fields: string[]): string[] {
  return fields.map((field: string): string => field.replace(
    /<!--jide-links:[\s\S]*?-->|<!--ml-mirror:start-->[\s\S]*?<!--ml-mirror:end-->/g, ''));
}

export function restoreNoteLinkEditorFields(baseline: string[], draft: string[]): string[] {
  const content: string[] = noteLinkEditorFields(baseline);
  return draft.map((field: string, index: number): string => {
    const original: string = baseline[index] ?? '';
    if (field === content[index]) return original;
    const managed: RegExpMatchArray | null = original.match(
      /<!--jide-links:[\s\S]*?-->|<!--ml-mirror:start-->[\s\S]*?<!--ml-mirror:end-->/g);
    return field + (managed?.join('') ?? '');
  });
}

