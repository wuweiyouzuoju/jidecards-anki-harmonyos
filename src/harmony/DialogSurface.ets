// SPDX-License-Identifier: AGPL-3.0-or-later
import { UiTokens } from '../core/UiTokens';
import { themePalette } from '../core/Theme';
import { SurfaceViewport, SurfaceGeometry, surfaceGeometry, surfaceBodyHeight } from '../core/SurfaceLayout';
import { ActionButton } from './ActionButton';

@Component
export struct DialogSurface {
  @Prop title: string = '';
  @Prop closeLabel: string = '';
  @Prop isDark: boolean = false;
  @Prop canClose: boolean = true;
  @Prop motionStyle: string = 'restrained';
  @Prop viewport: SurfaceViewport = { width: 0, height: 0, safeTop: 0, safeBottom: 0,
    safeLeft: 0, safeRight: 0, keyboardTop: 0 };
  @State private headerHeight: number = UiTokens.controlHeight;
  onRequestClose: (() => void) | undefined = undefined;
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  private geometry(): SurfaceGeometry { return surfaceGeometry(this.viewport); }
  private close(): void { if (this.canClose) { this.onRequestClose?.(); } }

  build() {
    Stack() {
      Column().width('100%').height('100%').backgroundColor('rgba(0,0,0,0.15)')
        .onClick((): void => { this.close(); })
      Stack({ alignContent: Alignment.Center }) {
        Column({ space: UiTokens.sectionGap }) {
          Row({ space: UiTokens.fieldGap }) {
            Text(this.title).layoutWeight(1).fontSize(UiTokens.titleSize)
              .fontColor(themePalette(this.isDark).text)
            if (this.onRequestClose !== undefined && this.closeLabel.length > 0) {
              ActionButton({ label: this.closeLabel, isEnabled: this.canClose, isDark: this.isDark,
                motionStyle: this.motionStyle, onAction: (): void => { this.close(); } })
            }
          }.width('100%').onAreaChange((_oldArea: Area, area: Area): void => {
            this.headerHeight = Number(area.height);
          })
          Scroll() { Column() { this.content() }.width('100%') }
            .constraintSize({ maxHeight: surfaceBodyHeight(this.geometry().panelMaxHeight, this.headerHeight, 0) })
        }
        .width(this.geometry().panelWidth).padding(UiTokens.surfaceInset)
        .backgroundColor(themePalette(this.isDark).surface)
        .border({ width: 1, color: themePalette(this.isDark).border })
        .borderRadius(UiTokens.surfaceRadius)
        .onClick((): void => {})
      }
      .width(this.geometry().width).height(this.geometry().height)
      .position({ x: this.geometry().left, y: this.geometry().top })
      .hitTestBehavior(HitTestMode.Transparent)
    }.width('100%').height('100%')
  }
}
