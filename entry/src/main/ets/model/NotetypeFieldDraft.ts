// SPDX-License-Identifier: AGPL-3.0-or-later
export interface NotetypeFieldDraft { ord: number | null; name: string; }

/** ord 是原字段身份；新顺序由数组位置表达，新字段必须用 null。 */
export function serializeNotetypeFields(original: Object[], fields: NotetypeFieldDraft[]): Object[] {
  const result: Object[] = [];
  const seen: number[] = [];
  for (const field of fields) {
    let source: Record<string, Object | null> = {};
    if (field.ord !== null) {
      if (seen.indexOf(field.ord) >= 0) throw new Error('Duplicate field identity');
      seen.push(field.ord);
      const found: Object | undefined = original.find((item: Object): boolean =>
        (item as Record<string, Object>)['ord'] === field.ord);
      if (found === undefined) throw new Error('Missing original field');
      source = JSON.parse(JSON.stringify(found)) as Record<string, Object | null>;
    }
    source['name'] = field.name;
    source['ord'] = field.ord;
    result.push(source);
  }
  return result;
}
