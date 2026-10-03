// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PressFeedback } from '../../utils/PressFeedback';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { ScrollTailFollower, ScrollTailChange } from '../../model/ScrollTailFollower';
import { AgentMarkdownText } from './AgentMarkdownText';
import { hasAgentMath } from '../../model/agent/AgentMath';

/** 思考独立于工具详情；稳定挂载，内部滚动不推走用户正在阅读的对话。 */
@Component
export struct AgentReasoning {
  @Prop title: ResourceStr = '';
  @Prop @Watch('contentChanged') text: string = '';
  @Prop @Watch('expansionChanged') expanded: boolean = true;
  onToggle: () => void = (): void => {};
  onReadingOlder: () => void = (): void => {};
  onFollowingLatest: () => void = (): void => {};
  private scroller: Scroller = new Scroller();
  private readonly tailFollower: ScrollTailFollower = new ScrollTailFollower(
    (): void => { this.scroller.scrollEdge(Edge.Bottom); },
    (): boolean => this.expanded);

  aboutToDisappear(): void {
    this.tailFollower.dispose();
  }

  private expansionChanged(): void {
    if (this.expanded) this.tailFollower.resume();
    else this.tailFollower.cancelPending();
  }

  private contentChanged(): void {
    this.tailFollower.queue();
  }

  private didScroll(_xOffset: number, yOffset: number, state: ScrollState): void {
    const change: ScrollTailChange = this.tailFollower.didScroll(yOffset, state !== ScrollState.Idle,
      this.scroller.isAtEnd());
    if (change === 'paused') this.onReadingOlder();
    else if (change === 'resumed') this.onFollowingLatest();
  }

  build() {
    Column({ space: 应用尺寸.间距_4 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        DisclosureChevron({ tint: $r('app.color.text_secondary') })
          .rotate({ angle: this.expanded ? 90 : 0 })
          .animation({ duration: 150, curve: Curve.EaseOut }).flexShrink(0)
        Text(this.title).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).layoutWeight(1)
      }.width('100%').constraintSize({ minHeight: 应用尺寸.按钮高度 })
        .attributeModifier(new PressFeedback()).onClick((): void => { this.onToggle(); })
      if (this.expanded) {
        Scroll(this.scroller) {
          Column() {
            if (hasAgentMath(this.text)) {
              AgentMarkdownText({ text: this.text, textColor: $r('app.color.text_secondary'),
                fontSize: 应用尺寸.字号_正文_小 })
            } else {
              Text(this.text).fontSize(应用尺寸.字号_正文_小).lineHeight(22)
                .fontColor($r('app.color.text_secondary')).width('100%').copyOption(CopyOptions.LocalDevice)
            }
          }.width('100%')
            .padding({ left: 32, right: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
            .onAreaChange((): void => { this.contentChanged(); })
        }.width('100%').constraintSize({ maxHeight: 200 }).align(Alignment.TopStart)
          .scrollBar(BarState.Auto)
          .nestedScroll({ scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
          .onAreaChange((): void => { this.contentChanged(); })
          .onDidScroll((xOffset: number, yOffset: number, state: ScrollState): void => {
            this.didScroll(xOffset, yOffset, state);
          })
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
