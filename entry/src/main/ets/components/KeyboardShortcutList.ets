// SPDX-License-Identifier: AGPL-3.0-or-later
import { KeyboardShortcut } from '../model/KeyboardShortcuts';
import { localizedNamedResourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 与执行端共用键位声明，页面只传本上下文已经接通的操作。 */
@Component
export struct KeyboardShortcutList {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop hint: Resource = $r('app.string.keyboard_scope_hint');
  @Prop shortcuts: KeyboardShortcut[] = [];
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text(this.hint).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      ForEach(this.shortcuts, (shortcut: KeyboardShortcut) => {
        Row({ space: 应用尺寸.间距_12 }) {
          Text(localizedNamedResourceText(this.getUIContext(), this.uiLanguage, shortcut.titleKey))
            .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).layoutWeight(1)
          Text(shortcut.keys).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
            .constraintSize({ maxWidth: '52%' }).textAlign(TextAlign.End)
        }.width('100%').constraintSize({ minHeight: 36 })
      }, (shortcut: KeyboardShortcut): string => shortcut.command + ':' + shortcut.keys)
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}

