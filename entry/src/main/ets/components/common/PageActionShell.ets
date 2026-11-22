// SPDX-License-Identifier: AGPL-3.0-or-later
import { WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';
import { PAGE_TOOLBAR_SCOPE, PageToolbarActionScope } from '../../model/PageToolbarActions';

/** 普通页面保留原顶部操作；侧栏仅由主页和牌组详情自行呈现。 */
@Component
export struct PageActionShell {
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @Prop surface: string = '';
  @Consume(PAGE_TOOLBAR_SCOPE) private scope: PageToolbarActionScope = new PageToolbarActionScope();
  @BuilderParam content: () => void = this.empty;
  @Builder private empty(): void {}
  aboutToAppear(): void { this.scope.enabled = false; this.scope.mounted = false; }
  aboutToDisappear(): void { this.scope.dispose(); }
  build() {
    Stack() { this.content() }
      .width('100%').height('100%')
      .padding({ left: this.safeLeft, right: this.safeRight })
  }
}
