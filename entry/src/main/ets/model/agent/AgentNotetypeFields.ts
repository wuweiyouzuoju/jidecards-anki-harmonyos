// SPDX-License-Identifier: AGPL-3.0-or-later
interface FieldPatch {
  fieldOrd: number; sticky?: boolean; rtl?: boolean; font?: string; size?: number; description?: string;
  plainText?: boolean; collapsed?: boolean; excludeFromSearch?: boolean;
}
interface LegacyFieldNotetype { flds: Record<string, Object>[]; sortf: number; }
interface StockOrigin { type: number; originalStockKind: number; }
/** 恢复会重置字段结构；禁止借 forceKind 将普通与填空类型互换。 */
export function agentRestoreStockKind(before: string, forceKind?: number): number {
  const current: StockOrigin = JSON.parse(before) as StockOrigin;
  const kind: number = forceKind ?? current.originalStockKind - 1;
  if (!Number.isInteger(kind) || kind < 0 || kind > 5) throw new Error('unknown_original_stock_kind');
  if ((kind === 4 ? 1 : 0) !== current.type) throw new Error('restore_kind_mismatch');
  return kind;
}
/** 从真实类型复制；只替换可编辑元数据，绝不改变 ord/id/name 或丢弃外部属性。 */
export function patchAgentNotetypeFields(before: string, json: string, sortIndex?: number): string {
  const type: LegacyFieldNotetype = JSON.parse(before) as LegacyFieldNotetype;
  const patches: FieldPatch[] = JSON.parse(json) as FieldPatch[];
  if (type === null || !Array.isArray(type.flds) || type.flds.length === 0 || !Array.isArray(patches) ||
    patches.length > type.flds.length || (patches.length === 0 && sortIndex === undefined)) throw new Error('invalid_notetype_fields');
  const seen: Set<number> = new Set<number>();
  const allowed: string[] = ['fieldOrd', 'sticky', 'rtl', 'font', 'size', 'description', 'plainText', 'collapsed', 'excludeFromSearch'];
  for (const patch of patches) {
    if (patch === null || typeof patch !== 'object' || !Number.isInteger(patch.fieldOrd) || patch.fieldOrd < 0 ||
      patch.fieldOrd >= type.flds.length || seen.has(patch.fieldOrd) || Object.keys(patch).length < 2 ||
      Object.keys(patch).some((key: string): boolean => !allowed.includes(key))) throw new Error('invalid_notetype_fields');
    seen.add(patch.fieldOrd);
    const target: Record<string, Object> = type.flds[patch.fieldOrd];
    const raw: Record<string, Object> = JSON.parse(JSON.stringify(patch)) as Record<string, Object>;
    for (const key of Object.keys(raw)) {
      if (key === 'fieldOrd') continue;
      const value: Object = raw[key];
      if (key === 'font' || key === 'description') {
        if (typeof value !== 'string' || value.length > (key === 'font' ? 200 : 2000)) throw new Error('invalid_notetype_fields');
      } else if (key === 'size') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200) throw new Error('invalid_notetype_fields');
      } else if (typeof value !== 'boolean') throw new Error('invalid_notetype_fields');
      target[key] = value;
    }
  }
  if (sortIndex !== undefined) {
    if (!Number.isInteger(sortIndex) || sortIndex < 0 || sortIndex >= type.flds.length) throw new Error('invalid_sort_field');
    type.sortf = sortIndex;
  }
  return JSON.stringify(type);
}

export interface NotetypeFieldPreview { title: string; before: string; after: string; }
export function agentNotetypeFieldPreview(before: string, after: string, text: (key: string) => string): NotetypeFieldPreview[] {
  const oldType: LegacyFieldNotetype = JSON.parse(before) as LegacyFieldNotetype;
  const newType: LegacyFieldNotetype = JSON.parse(after) as LegacyFieldNotetype;
  const rows: NotetypeFieldPreview[] = [];
  const label = (value: Object | undefined): string => typeof value === 'boolean' ?
    text(value ? 'agent_value_on' : 'agent_value_off') : value === undefined ? text('agent_controls_default') : String(value);
  for (let ordinal: number = 0; ordinal < newType.flds.length; ordinal++) {
    const oldField: Record<string, Object> = oldType.flds[ordinal];
    const newField: Record<string, Object> = newType.flds[ordinal];
    for (const key of ['sticky', 'rtl', 'font', 'size', 'description', 'plainText', 'collapsed', 'excludeFromSearch']) {
      if (oldField[key] !== newField[key]) rows.push({ title: String(newField['name']) + ' · ' + text('agent_field_' + key),
        before: label(oldField[key]), after: label(newField[key]) });
    }
  }
  if (oldType.sortf !== newType.sortf) rows.push({ title: text('agent_field_sort'),
    before: String(oldType.flds[oldType.sortf]['name']), after: String(newType.flds[newType.sortf]['name']) });
  return rows;
}
interface NotetypeLayout { flds: Record<string, Object>[]; tmpls: Record<string, Object>[]; }
export function agentNotetypeLayout(json: string): string[] {
  const value: NotetypeLayout = JSON.parse(json) as NotetypeLayout;
  return [value.flds.map((field: Record<string, Object>): string => String(field['name'])).join(', '),
    value.tmpls.map((template: Record<string, Object>): string => String(template['name'])).join(', ')];
}

interface RestoredTemplate { name: string; qfmt: string; afmt: string; }
interface RestoredNotetype { css: string; flds: Record<string, Object>[]; tmpls: RestoredTemplate[]; }
/** Core 会分配字段/模板身份；只校验标准结构及渲染定义，不要求随机 ID 相同。 */
export function agentStockRestoreMatches(savedJson: string, stockJson: string): boolean {
  const saved: RestoredNotetype = JSON.parse(savedJson) as RestoredNotetype;
  const stock: RestoredNotetype = JSON.parse(stockJson) as RestoredNotetype;
  return saved.css === stock.css &&
    JSON.stringify(saved.flds.map((field: Record<string, Object>): Object => field['name'])) ===
      JSON.stringify(stock.flds.map((field: Record<string, Object>): Object => field['name'])) &&
    JSON.stringify(saved.tmpls.map((template: RestoredTemplate): RestoredTemplate =>
      ({ name: template.name, qfmt: template.qfmt, afmt: template.afmt }))) ===
      JSON.stringify(stock.tmpls.map((template: RestoredTemplate): RestoredTemplate =>
        ({ name: template.name, qfmt: template.qfmt, afmt: template.afmt })));
}
