// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../../model/ThemeCatalog';
import {
  ThemeBackgroundPose, initialThemeBackgroundPoses, nextThemeBackgroundPoses, sampleThemeBackgroundPoses, DEFAULT_BACKGROUND_CYCLE_MS
} from '../../model/ThemeBackgroundMotion';
import { APP_FOREGROUND_KEY, THEME_MOTION_KEY } from '../../model/Redemption';
import { 颜色键 } from '../../model/颜色主题';

/**
 * 透明彩雾纹理由系统合成平移、缩放和淡化，ArkTS 每轮只提交一次目标。
 * Invariants: 不使用逐帧状态回调、实时渐变或色相滤镜；固定底色不参与运动。
 * 生命周期失效使旧 onFinish 无效，暂停采样只发生一次。
 */
@Component
export struct ThemeBackground {
  @Prop @Watch('updatePlayback') transitionActive: boolean = false;
  @StorageProp(THEME_VISUALS_KEY) @Watch('updatePlayback') private visual: ThemeDefinition = themeDefinition('aurora');
  @StorageProp(THEME_MOTION_KEY) @Watch('updatePlayback') private motion: boolean = true;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('updatePlayback') private foreground: boolean = false;
  @StorageProp(颜色键.页面底色微染) private baseColor: string = '#e9eef7';
  @State private poses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private fromPoses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private toPoses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private visible: boolean = false;
  private running: boolean = false;
  private mounted: boolean = false;
  private generation: number = 0;
  private startedAt: number = 0;
  private cycleDuration: number = DEFAULT_BACKGROUND_CYCLE_MS;

  /** 重复可见通知不重启当前轮次，关闭开关时保留当下画面。 */
  private updatePlayback(): void {
    if (!this.mounted) return;
    if (this.visual.backgroundTextures.length === 0 || !this.motion || !this.foreground || !this.visible || this.transitionActive) {
      this.pauseMotion();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.advanceMotion();
  }

  /** 回调只在一轮结束时执行，帧间插值完全交给系统渲染。 */
  private advanceMotion(): void {
    if (!this.mounted || !this.running) return;
    const generation: number = ++this.generation;
    this.fromPoses = this.poses;
    this.toPoses = nextThemeBackgroundPoses();
    this.startedAt = Date.now();
    this.cycleDuration = this.visual.backgroundCycleMs;
    this.getUIContext().animateTo({
      duration: this.cycleDuration, curve: Curve.EaseInOut,
      expectedFrameRateRange: { min: 30, max: 60, expected: 60 },
      onFinish: (): void => {
        if (this.mounted && this.running && generation === this.generation) this.advanceMotion();
      }
    }, (): void => { this.poses = this.toPoses; });
  }

  private pauseMotion(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    const frozen: ThemeBackgroundPose[] = sampleThemeBackgroundPoses(this.fromPoses, this.toPoses, (Date.now() - this.startedAt) * DEFAULT_BACKGROUND_CYCLE_MS / this.cycleDuration);
    this.getUIContext().animateTo({ duration: 0 }, (): void => { this.poses = frozen; });
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.visible = false;
    this.running = false;
    this.generation++;
  }

  build() {
    Stack() {
      ForEach(this.visual.backgroundTextures, (texture: string, index: number) => {
        Image($rawfile(texture))
          .width('130%').height('130%').objectFit(ImageFit.Fill).draggable(false)
          .translate({ x: `${this.poses[index].x * 100}%`, y: `${this.poses[index].y * 100}%` })
          .scale({ x: this.poses[index].scale, y: this.poses[index].scale })
          .opacity(this.poses[index].opacity)
      }, (texture: string): string => texture)
    }
    .width('100%').height('100%').backgroundColor(this.baseColor).clip(true)
    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
    .onAppear((): void => { this.mounted = true; this.updatePlayback(); })
    .onVisibleAreaChange([0, 1], (visible: boolean, ratio: number): void => {
      this.visible = visible && ratio > 0;
      this.updatePlayback();
    })
  }
}
