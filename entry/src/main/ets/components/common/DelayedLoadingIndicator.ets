// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 短暂加载不闪进度圈；慢请求保留反馈，卸载即取消延迟任务。 */
@Component
export struct DelayedLoadingIndicator {
  @Prop tint: ResourceColor = $r('app.color.text_secondary');
  @State private shown: boolean = false;
  private timer: number = -1;

  aboutToAppear(): void {
    this.timer = setTimeout((): void => { this.shown = true; this.timer = -1; }, 250);
  }

  aboutToDisappear(): void {
    if (this.timer !== -1) clearTimeout(this.timer);
    this.timer = -1;
  }

  build() {
    LoadingProgress()
      .width(应用尺寸.加载指示器尺寸).height(应用尺寸.加载指示器尺寸)
      .color(this.tint).visibility(this.shown ? Visibility.Visible : Visibility.Hidden)
  }
}
