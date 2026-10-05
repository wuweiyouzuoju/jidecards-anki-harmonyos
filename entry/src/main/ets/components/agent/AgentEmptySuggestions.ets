// SPDX-License-Identifier: AGPL-3.0-or-later
import { pasteboard } from '@kit.BasicServicesKit';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { showToastSafely, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { agentSuggestionKey, AGENT_SUGGESTION_COUNT, AGENT_SUGGESTION_HOLD_MS,
  AGENT_SUGGESTION_FADE_MS } from '../../model/agent/AgentSuggestions';
import type { AgentAppRecommendation } from '../../model/agent/AgentAppRecommendations';

/** 空会话的单句提示；组件独占计时器，复制只写剪贴板。 */
@Component
export struct AgentEmptySuggestions {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('visibilityChanged') isPageVisible: boolean = false;
  @State private suggestionIndex: number = 0;
  @State private textOpacity: number = 1;
  @State private contextualKeys: string[] = [];
  loadRecommendations: () => AgentAppRecommendation[] = (): AgentAppRecommendation[] => [];
  private isMounted: boolean = false;
  private isHovered: boolean = false;
  private isPressed: boolean = false;
  private isCopying: boolean = false;
  private rotationTimer: number = -1;
  private fadeTimer: number = -1;
  private rotationVersion: number = 0;

  aboutToAppear(): void {
    this.isMounted = true;
    this.suggestionIndex = Math.floor(Math.random() * AGENT_SUGGESTION_COUNT);
    this.refreshRecommendations();
    this.restartRotation();
  }

  aboutToDisappear(): void {
    this.isMounted = false;
    this.cancelRotation();
  }

  private canRotate(): boolean {
    return this.isMounted && this.isPageVisible && !this.isHovered && !this.isPressed && !this.isCopying;
  }

  private refreshRecommendations(): boolean {
    if (!this.isMounted || !this.isPageVisible) return false;
    const keys: string[] = this.loadRecommendations().slice(0, 3).map((item): string => item.promptKey);
    if (keys.join('|') === this.contextualKeys.join('|')) return false;
    this.contextualKeys = keys;
    this.suggestionIndex = 0;
    return true;
  }

  private cancelRotation(): void {
    this.rotationVersion++;
    if (this.rotationTimer >= 0) clearTimeout(this.rotationTimer);
    if (this.fadeTimer >= 0) clearTimeout(this.fadeTimer);
    this.rotationTimer = -1;
    this.fadeTimer = -1;
  }

  private restartRotation(): void {
    this.cancelRotation();
    if (!this.isMounted) return;
    this.textOpacity = 1;
    if (!this.canRotate()) return;
    const version: number = this.rotationVersion;
    this.rotationTimer = setTimeout((): void => {
      if (version !== this.rotationVersion || !this.canRotate()) return;
      this.rotationTimer = -1;
      this.textOpacity = 0;
      this.fadeTimer = setTimeout((): void => {
        if (version !== this.rotationVersion || !this.canRotate()) return;
        this.fadeTimer = -1;
        if (!this.refreshRecommendations()) {
          this.suggestionIndex = (this.suggestionIndex + 1) % (AGENT_SUGGESTION_COUNT + this.contextualKeys.length);
        }
        this.restartRotation();
      }, AGENT_SUGGESTION_FADE_MS);
    }, AGENT_SUGGESTION_HOLD_MS);
  }

  private visibilityChanged(): void {
    if (!this.isPageVisible) {
      this.isHovered = false;
      this.isPressed = false;
    }
    this.refreshRecommendations();
    this.restartRotation();
  }

  private hoverChanged(hovered: boolean): void {
    this.isHovered = hovered;
    this.restartRotation();
  }

  private touchChanged(type: TouchType): void {
    if (type === TouchType.Down) this.isPressed = true;
    else if (type === TouchType.Up || type === TouchType.Cancel) this.isPressed = false;
    else return;
    this.restartRotation();
  }

  private suggestionText(_locale: string = this.uiLanguage): string {
    const key: string = this.suggestionIndex < this.contextualKeys.length ? this.contextualKeys[this.suggestionIndex] :
      agentSuggestionKey(this.suggestionIndex - this.contextualKeys.length);
    return namedResourceText(this.getUIContext(), key);
  }

  private displayedSuggestionText(_locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), $r('app.string.ai_agent_suggestion_quote'), this.suggestionText());
  }

  private async copySuggestion(): Promise<void> {
    if (!this.isMounted || !this.isPageVisible || this.isCopying) return;
    const text: string = this.suggestionText();
    this.isCopying = true;
    this.restartRotation();
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
      if (this.isMounted && this.isPageVisible) {
        showToastSafely(this.getUIContext(), { message: $r('app.string.ai_agent_suggestion_copied') });
      }
    } catch {
      if (this.isMounted && this.isPageVisible) {
        showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copy_failed') });
      }
    } finally {
      this.isCopying = false;
      this.restartRotation();
    }
  }

  build() {
    Column() {
      Text(this.displayedSuggestionText())
        .fontSize(应用尺寸.字号_分区标题)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_secondary'))
        .textAlign(TextAlign.Center)
        .width('100%')
        .constraintSize({ maxWidth: 应用尺寸.dialogWideMaxWidth })
        .padding({ top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_12 })
        .opacity(this.textOpacity)
        .animation({ duration: AGENT_SUGGESTION_FADE_MS, curve: Curve.EaseInOut })
        .accessibilityDescription($r('app.string.ai_agent_suggestion_copy_hint'))
        .onHover((hovered: boolean): void => { this.hoverChanged(hovered); })
        .onTouch((event: TouchEvent): void => { this.touchChanged(event.type); })
        .gesture(LongPressGesture({ repeat: false, duration: 500 })
          .onAction((): void => { this.copySuggestion(); }))
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .padding({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
  }
}
