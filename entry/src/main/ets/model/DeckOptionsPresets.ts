// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigsForUpdateView } from '../proto/messages/DeckConfigMessages';
import { copyDeckConfig } from './DeckConfigSave';
import { encodeDeckConfig } from '../proto/messages/DeckConfigMessages';

export interface DeckOptionsPresetEntry { key: string; config: DeckConfig; useCount: number; }
/** 预设增删改与字段草稿一起保存，切换预设保留未提交修改；Core 分配新预设的 ID。 */
export class DeckOptionsPresets {
  entries: DeckOptionsPresetEntry[];
  selectedKey: string;
  removedIds: number[] = [];
  assignmentsChanged: boolean = false;
  private nextKey: number = 1;
  private view: DeckConfigsForUpdateView;
  private originals: DeckConfig[];

  constructor(view: DeckConfigsForUpdateView) {
    this.view = view;
    this.entries = view.allConfigs.filter((entry, index, all) => all.findIndex(item => item.config.id === entry.config.id) === index)
      .map(entry => ({ key: String(entry.config.id), config: copyDeckConfig(entry.config), useCount: entry.useCount }));
    this.originals = view.allConfigs.map(entry => copyDeckConfig(entry.config));
    this.selectedKey = String(view.currentDeck?.configId);
    this.current();
  }
  current(): DeckOptionsPresetEntry {
    const entry = this.entries.find(item => item.key === this.selectedKey);
    if (entry === undefined) throw new Error('deck config not found');
    return entry;
  }
  stage(draft: DeckConfig): void { this.current().config = copyDeckConfig(draft); }
  select(key: string, draft: DeckConfig): void {
    if (!this.entries.some(item => item.key === key)) throw new Error('deck config not found');
    this.stage(draft);
    if (key !== this.selectedKey) this.assignmentsChanged = true;
    this.selectedKey = key;
  }
  rename(name: string, draft: DeckConfig): void {
    const unique = this.uniqueName(name, true);
    this.stage(draft); this.current().config.name = unique;
  }
  add(name: string, draft: DeckConfig, clone: boolean): void {
    const unique = this.uniqueName(name, false);
    const source = clone ? draft : this.view.defaults;
    if (source === null || source.config === null) throw new Error('default deck config unavailable');
    const config = copyDeckConfig(source); config.id = 0; config.name = unique; config.mtimeSecs = 0; config.usn = 0;
    this.stage(draft);
    const key = 'new_' + String(this.nextKey++);
    this.entries.push({ key, config, useCount: 0 }); this.selectedKey = key; this.assignmentsChanged = true;
  }
  remove(draft: DeckConfig): void {
    if (this.current().config.id === 1) throw new Error('cannot remove default preset');
    this.stage(draft);
    const index = this.entries.findIndex(item => item.key === this.selectedKey);
    const id = this.current().config.id;
    if (id !== 0) this.removedIds.push(id);
    this.entries.splice(index, 1);
    this.selectedKey = this.entries[Math.max(0, index - 1)].key; this.assignmentsChanged = true;
  }
  modifiedExceptCurrent(): DeckConfig[] {
    return this.entries.filter(entry => entry.key !== this.selectedKey && this.changed(entry.config))
      .map(entry => copyDeckConfig(entry.config));
  }
  private changed(config: DeckConfig): boolean {
    const original = this.originals.find(item => item.id === config.id);
    if (original === undefined || config.id === 0) return true;
    const before = encodeDeckConfig(original); const after = encodeDeckConfig(config);
    return before.length !== after.length || before.some((value, index) => value !== after[index]);
  }
  private uniqueName(name: string, excludeCurrent: boolean): string {
    const base = name.trim(); if (base === '') throw new Error('preset name required');
    let value = base; let suffix = 2;
    while (this.entries.some(item => item.config.name === value && (!excludeCurrent || item.key !== this.selectedKey))) value = base + ' ' + String(suffix++);
    // Adding a preset must also avoid the selected preset's name.
    return value;
  }
}
