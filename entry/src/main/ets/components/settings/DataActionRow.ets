// SPDX-License-Identifier: AGPL-3.0-or-later
import { SettingsActionRow } from '../common/SettingsActionRow';

/** 数据管理与备份入口共用行几何；水平边距由外层卡片/弹窗提供。 */
@Component
export struct DataActionRow {
  @Prop title: ResourceStr = '';
  @Prop hint: ResourceStr = '';
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop isInteractive: boolean = true;
  @Prop showHelp: boolean = false;
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};
  build() {
    SettingsActionRow({ title: this.title, hint: this.hint, icon: this.icon,
      isInteractive: this.isInteractive, showHelp: this.showHelp,
      onHelp: this.onHelp, onAction: this.onAction })
  }
}
