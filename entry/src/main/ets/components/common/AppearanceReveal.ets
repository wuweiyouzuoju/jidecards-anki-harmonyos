// SPDX-License-Identifier: AGPL-3.0-or-later
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { THEME_MOTION_KEY, themeDefinition } from '../../model/ThemeCatalog';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { prefersReducedMotion } from '../../utils/ReducedMotion';
interface UnlockSpark {
  x: number;
  y: number;
  angle: number;
  colorIndex: number;
}

/** 复用原幻彩礼物动效：一次浮现与粒子散开，后台或关闭动画时落到静态结果。 */
@Component
export struct AppearanceReveal {
  @StorageProp(THEME_MOTION_KEY) @Watch('settleMotion') private motion: boolean = true;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('settleMotion') private foreground: boolean = false;
  @State private revealed: boolean = false;
  @State private burst: boolean = false;
  private mounted: boolean = false;
  private played: boolean = false;
  @Prop colors: string[] = themeDefinition('iridescent').lightActionColors;
  @Prop gift: boolean = false;
  @Prop label: ResourceStr = '';
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  private readonly sparks: UnlockSpark[] = [
    { x: -94, y: -48, angle: -35, colorIndex: 0 },
    { x: -62, y: -76, angle: 20, colorIndex: 1 },
    { x: -12, y: -82, angle: 65, colorIndex: 2 },
    { x: 54, y: -70, angle: -25, colorIndex: 0 },
    { x: 94, y: -36, angle: 40, colorIndex: 2 },
    { x: 102, y: 26, angle: 75, colorIndex: 1 },
    { x: 66, y: 66, angle: -50, colorIndex: 0 },
    { x: 12, y: 78, angle: 35, colorIndex: 2 },
    { x: -52, y: 68, angle: 80, colorIndex: 1 },
    { x: -100, y: 22, angle: -20, colorIndex: 2 }
  ];

  private revealGift(): void {
    this.mounted = true;
    if (this.played) return;
    this.played = true;
    if (!this.motion || !this.foreground || prefersReducedMotion(this.getUIContext())) {
      this.revealed = true;
      this.burst = true;
      return;
    }
    this.getUIContext().animateTo({ duration: 560, curve: Curve.FastOutSlowIn }, (): void => {
      this.revealed = true;
    });
    this.getUIContext().animateTo({ duration: 1400, delay: 120, curve: Curve.EaseOut }, (): void => {
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
      if (this.gift) {
      Image($rawfile('themes/iridescent_cloud_0.png')).width(180).height(160)
        .translate({ x: -30, y: -12 }).opacity(this.revealed ? 0.45 : 0)
        .scale({ x: this.revealed ? 1 : 0.6, y: this.revealed ? 1 : 0.6 })
      Image($rawfile('themes/iridescent_cloud_2.png')).width(180).height(160)
        .translate({ x: 34, y: 12 }).opacity(this.revealed ? 0.45 : 0)
        .scale({ x: this.revealed ? 1 : 0.6, y: this.revealed ? 1 : 0.6 })
      }
      Circle().width(140).height(140).fill(Color.Transparent).stroke(this.colors[1]).strokeWidth(1)
        .scale({ x: this.burst ? 1.35 : 0.65, y: this.burst ? 1.35 : 0.65 })
        .opacity(this.burst ? 0 : 0.4)
      ForEach(this.sparks, (spark: UnlockSpark) => {
        Rect().width(5).height(10).radiusWidth(2).radiusHeight(2).fill(this.colors[spark.colorIndex])
          .translate({ x: this.burst ? spark.x : spark.x * 0.38, y: this.burst ? spark.y : spark.y * 0.38 })
          .rotate({ angle: this.burst ? spark.angle : 0 })
          .scale({ x: this.burst ? 0.5 : 0.85, y: this.burst ? 0.5 : 0.85 })
          .opacity(this.burst ? 0 : 0.85)
      }, (_spark: UnlockSpark, index: number): string => index.toString())
      Stack() {
        if (this.gift) {
        Column() {}.width(96).height(96).borderRadius(48)
          .linearGradient({ angle: 135, colors: [[this.colors[0], 0], [this.colors[1], 0.5], [this.colors[2], 1]] })
        Path().commands('M24 2 L30 18 L46 24 L30 30 L24 46 L18 30 L2 24 L18 18 Z')
          .width(48).height(48).fill('#FFFFFF')
        } else {
          Column({ space: 10 }) {
            Text(this.label).fontSize(20).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
            Row().width('80%').height(6).backgroundColor(this.colors[0]).opacity(0.3).borderRadius(3)
            Row().width('55%').height(6).backgroundColor(this.colors[1]).opacity(0.16).borderRadius(3)
          }.alignItems(HorizontalAlign.Start).padding(20).width('76%')
            .attributeModifier(SeriesVisual.surfaceFor('glass', SeriesVisual.isDark(this.themeMode, this.systemDark), this.colors[0]))
            .borderRadius(20).clip(true)
        }
      }
      .scale({ x: this.revealed ? 1 : 0.82, y: this.revealed ? 1 : 0.82 })
      .rotate({ angle: this.revealed ? 0 : -8 })
      .translate({ y: this.revealed ? 0 : 8 })
      .opacity(this.revealed ? 1 : 0)
    }
    .width('100%').height(180).clip(true)
    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }

  build() {
    Column() { this.giftArtwork() }.width('100%')
      .onAppear((): void => { this.revealGift(); })
  }
}
