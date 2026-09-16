// SPDX-License-Identifier: AGPL-3.0-or-later
import { THEME_MOTION_KEY } from '../../model/Redemption';
import { saveThemeMotion } from '../../utils/RedemptionStore';

/** 关闭动画后继续保留静态幻彩，持久化失败可见。 */
@Component
export struct ThemeMotionControl {
  @StorageProp(THEME_MOTION_KEY) private motionEnabled: boolean = true;
  @State private saving: boolean = false;
  @State private failed: boolean = false;

  private async save(value: boolean): Promise<void> {
    if (this.saving || value === this.motionEnabled) return;
    this.saving = true;
    this.failed = false;
    try { await saveThemeMotion(value); }
    catch (error) { this.failed = true; }
    finally { this.saving = false; }
  }

  build() {
    Column({ space: 6 }) {
      Row() {
        Text($r('app.string.iridescent_motion'))
          .fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
        Toggle({ type: ToggleType.Switch, isOn: this.motionEnabled }).enabled(!this.saving)
          .onChange((value: boolean): void => { this.save(value); })
      }.height(48).width('100%')
      Text($r('app.string.iridescent_motion_hint'))
        .fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
      if (this.failed) {
        Text($r('app.string.redemption_storage_failed')).fontSize(12).fontColor($r('app.color.error_text'))
      }
    }.width('100%')
  }
}
