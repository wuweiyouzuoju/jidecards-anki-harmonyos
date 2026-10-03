// SPDX-License-Identifier: AGPL-3.0-or-later
import { IridescentGiftPanel } from './IridescentGiftPanel';

/** CustomDialogController 只构建 CustomDialog；普通组件供首页直接挂载。 */
@CustomDialog
export struct IridescentGiftDialog {
  controller?: CustomDialogController;

  build() {
    IridescentGiftPanel({ onClose: (): void => { this.controller?.close(); } })
  }
}
