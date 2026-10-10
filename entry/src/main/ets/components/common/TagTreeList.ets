// SPDX-License-Identifier: AGPL-3.0-or-later
import { TagRow } from '../../model/NoteTags';
import { DirectoryRow, DirectoryView, directoryRow } from '../../model/DirectoryTree';
import { DirectoryTree } from './DirectoryTree';
import { resourceText } from '../../utils/UiFeedback';

/** 标签领域适配；行几何、滚动与交互委托公共目录组件。 */
@Component
export struct TagTreeList {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop rows: TagRow[] = [];
  @Prop query: string = '';
  @Prop isInteractive: boolean = true;
  @Prop listHeight: number = 260;
  onSelect: (name: string) => void = (_name: string): void => {};
  onToggle: (name: string) => void = (_name: string): void => {};
  onLongPress: (name: string) => void = (_name: string): void => {};
  onViewChanged: (view: DirectoryView | null) => void = (_view: DirectoryView | null): void => {};
  private directoryRows(_locale: string = this.uiLanguage): DirectoryRow[] {
    return this.rows.map((tag: TagRow): DirectoryRow => {
      const row: DirectoryRow = directoryRow(tag.fullName, tag.fullName, tag.selection);
      row.name = tag.name; row.level = tag.level; row.hasChildren = tag.hasChildren; row.collapsed = tag.collapsed;
      if (tag.selection >= 0) row.stateLabel = resourceText(this.getUIContext(), tag.selection === 1 ?
        $r('app.string.tags_state_all') : tag.selection === 2 ? $r('app.string.tags_state_some') : $r('app.string.tags_state_none'));
      return row;
    });
  }
  build() {
    DirectoryTree({ rows: this.directoryRows(), listHeight: this.listHeight, isInteractive: this.isInteractive,
      searchable: false, query: this.query, localExpansion: false, revealSelection: false, framed: false,
      selectionMode: this.rows.some((row: TagRow): boolean => row.selection >= 0) ? 'multiple' : 'none',
      onSelect: this.onSelect, onToggle: this.onToggle, onLongPress: this.onLongPress, onViewChanged: this.onViewChanged })
  }
}
