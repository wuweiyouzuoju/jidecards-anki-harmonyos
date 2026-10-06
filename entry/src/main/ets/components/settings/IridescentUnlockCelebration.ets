// SPDX-License-Identifier: AGPL-3.0-or-later
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { THEME_MOTION_KEY, themeDefinition } from '../../model/ThemeCatalog';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PrimaryActionButton } from '../common/PrimaryActionButton';

interface UnlockSpark {
  x: number;
  y: number;
  angle: number;
  color: string;
}

/** 成功落盘后的一次性礼物动效；只提交原生动画目标，不持有定时器或兑换状态。 */
@Component
export struct IridescentUnlockCelebration {
  @StorageProp(THEME_MOTION_KEY) @Watch('settleMotion') private motion: boolean = true;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('settleMotion') private foreground: boolean = false;
  @State private revealed: boolean = false;
  @State private burst: boolean = false;
  onUse: () => void = (): void => {};
  private mounted: boolean = false;
  private played: boolean = false;
  private readonly colors: string[] = themeDefinition('iridescent').lightActionColors;
  private readonly sparks: UnlockSpark[] = [
    { x: -94, y: -48, angle: -35, color: this.colors[0] },
    { x: -62, y: -76, angle: 20, color: this.colors[1] },
    { x: -12, y: -82, angle: 65, color: this.colors[2] },
    { x: 54, y: -70, angle: -25, color: this.colors[0] },
    { x: 94, y: -36, angle: 40, color: this.colors[2] },
    { x: 102, y: 26, angle: 75, color: this.colors[1] },
    { x: 66, y: 66, angle: -50, color: this.colors[0] },
    { x: 12, y: 78, angle: 35, color: this.colors[2] },
    { x: -52, y: 68, angle: 80, color: this.colors[1] },
    { x: -100, y: 22, angle: -20, color: this.colors[2] }
  ];

  private revealGift(): void {
    this.mounted = true;
    if (this.played) return;
    this.played = true;
    if (!this.motion || !this.foreground) {
      this.revealed = true;
      this.burst = true;
      return;
    }
    this.getUIContext().animateTo({ duration: 560, curve: Curve.FastOutSlowIn }, (): void => {
      this.revealed = true;
    });
    this.getUIContext().animateTo({ duration: 1400, curve: Curve.EaseOut }, (): void => {
      this.burst = true;
    });
  }

  /** 关闭动态效果或进入后台时直接落到静态礼物，不在回前台后重复庆祝。 */
  private settleMotion(): void {
    if (!this.mounted || !this.played || (this.motion && this.foreground)) return;
    this.getUIContext().animateTo({ duration: 0 }, (): void => {
      this.revealed = true;
      this.burst = true;
    });
  }

  aboutToDisappear(): void { this.mounted = false; }

  @Builder
  private giftArtwork() {
    Stack() {
      Image($rawfile('themes/iridescent_cloud_0.png')).width(180).height(160)
        .translate({ x: -30, y: -12 }).opacity(this.revealed ? 0.65 : 0)
        .scale({ x: this.revealed ? 1 : 0.6, y: this.revealed ? 1 : 0.6 })
      Image($rawfile('themes/iridescent_cloud_2.png')).width(180).height(160)
        .translate({ x: 34, y: 12 }).opacity(this.revealed ? 0.65 : 0)
        .scale({ x: this.revealed ? 1 : 0.6, y: this.revealed ? 1 : 0.6 })
      Circle().width(140).height(140).fill(Color.Transparent).stroke(this.colors[1]).strokeWidth(2)
        .scale({ x: this.burst ? 1.45 : 0.45, y: this.burst ? 1.45 : 0.45 })
        .opacity(this.burst ? 0 : 0.65)
      ForEach(this.sparks, (spark: UnlockSpark) => {
        Rect().width(5).height(10).radiusWidth(2).radiusHeight(2).fill(spark.color)
          .translate({ x: this.burst ? spark.x : 0, y: this.burst ? spark.y : 0 })
          .rotate({ angle: this.burst ? spark.angle : 0 })
          .opacity(this.burst ? 0 : 1)
      }, (_spark: UnlockSpark, index: number): string => index.toString())
      Stack() {
        Column() {}.width(96).height(96).borderRadius(48)
          .linearGradient({ angle: 135, colors: [[this.colors[0], 0], [this.colors[1], 0.5], [this.colors[2], 1]] })
        Path().commands('M24 2 L30 18 L46 24 L30 30 L24 46 L18 30 L2 24 L18 18 Z')
          .width(48).height(48).fill('#FFFFFF')
      }
      .scale({ x: this.revealed ? 1 : 0.55, y: this.revealed ? 1 : 0.55 })
      .rotate({ angle: this.revealed ? 0 : -18 })
      .opacity(this.revealed ? 1 : 0)
    }
    .width('100%').height(180).clip(true)
    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }

  build() {
    Column({ space: 应用尺寸.间距_16 }) {
      this.giftArtwork()
      Column({ space: 应用尺寸.间距_12 }) {
        Text($r('app.string.redemption_iridescent_unlocked_title'))
          .fontSize(应用尺寸.字号_分区标题).fontWeight(FontWeight.Bold)
          .fontColor(this.colors[1]).textAlign(TextAlign.Center).width('100%')
        Text($r('app.string.redemption_iridescent_unlocked_body'))
          .fontSize(应用尺寸.字号_正文).lineHeight(22)
          .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center).width('100%')
      }
      .width('100%').opacity(this.revealed ? 1 : 0)
      .translate({ y: this.revealed ? 0 : 12 })
      PrimaryActionButton({ label: $r('app.string.redemption_use_theme'), tint: this.colors[1],
        onAction: this.onUse })
    }
    .width('100%')
    .onAppear((): void => { this.revealGift(); })
  }
}
