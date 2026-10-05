// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenuItem } from './MenuItem';

export interface ActionMenuListItem {
  id: string;
  label: ResourceStr;
  icon?: ResourceStr;
  iconTint?: ResourceColor;
  available?: boolean;
  selected?: boolean;
  destructive?: boolean;
}

/** 平面动作菜单共用条目渲染；宿主提供唯一 ID、完整文案及业务回调。 */
@Component
export struct ActionMenuList {
  @Prop items: ActionMenuListItem[] = [];
  onSelect: (id: string) => void = (_id: string): void => {};

  private selectEntry(id: string): void {
    // 按当前列表校验，显隐或禁用变化后的迟到点击不能执行旧动作。
    const item: ActionMenuListItem | undefined = this.items.find((entry: ActionMenuListItem): boolean => entry.id === id);
    if (item === undefined || item.available === false) return;
    this.onSelect(item.id);
  }

  build() {
    Column() {
      ForEach(this.items, (item: ActionMenuListItem, index: number) => {
        AnchoredMenuItem({ label: item.label, icon: item.icon, iconTint: item.iconTint,
          available: item.available !== false, selected: item.selected === true, divider: index > 0,
          destructive: item.destructive === true,
          onSelect: (): void => { this.selectEntry(item.id); } })
      }, (item: ActionMenuListItem): string => item.id)
    }.width('100%')
  }
}
