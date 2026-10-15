// SPDX-License-Identifier: AGPL-3.0-or-later
import { KeyboardShortcut } from '../model/KeyboardShortcuts';
import { 字段帮助面板 } from './字段帮助面板';
import { KeyboardShortcutList } from './KeyboardShortcutList';
import { appInterface } from '../backend/AppInterfaceService';
import { KeyCode } from '@kit.InputKit';

@Component
export struct KeyboardShortcutHelp {
  @Prop scope: string = 'home';
  @Prop shortcuts: KeyboardShortcut[] = [];
  onClose: () => void = (): void => {};
  aboutToAppear(): void {
    appInterface.observe({ surface: this.scope + '_shortcuts', sectionId: '', selectedId: '', optionIds: [], optionLabels: [],
      busy: false, controlsComplete: true,
      items: [{ id: 'close', title: '', titleKey: 'done', enabled: true, selected: false }],
      values: [{ id: 'bindings', value: JSON.stringify(this.shortcuts) }] });
  }
  aboutToDisappear(): void { appInterface.leave(this.scope + '_shortcuts'); }
  @Builder
  private body() { KeyboardShortcutList({ shortcuts: this.shortcuts, hint: this.scope === 'home' ? $r('app.string.keyboard_home_scope_hint') :
    this.scope === 'study' ? $r('app.string.keyboard_study_scope_hint') : $r('app.string.keyboard_scope_hint') }) }
  build() {
    字段帮助面板({ 标题: $r('app.string.keyboard_shortcuts_title'), 内容: (): void => { this.body(); }, onClose: this.onClose })
      .onKeyPreIme((event: KeyEvent): boolean => {
        if (event.keyCode === KeyCode.KEYCODE_ESCAPE && event.type === KeyType.Down) { this.onClose(); return true; }
        return false;
      })
  }
}
