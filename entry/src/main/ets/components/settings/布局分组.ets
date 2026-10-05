// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { resourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';

import { 加载学习布局模式, 保存学习布局模式, 学习布局模式 } from '../../model/学习布局存储';
import { 设置分组卡片 } from './设置分组卡片';
import { STUDY_LAYOUT_MODES, STUDY_GRIP_AVAILABILITY_KEY, StudyGripAvailability,
  studyLayoutIndex, studyGripHintKey } from '../../model/StudyLayout';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';

// ========================================================
// @块ID UI-LAYOUT-001
// @名称 学习页布局分组
//
// @作用
// 提供底部固定 / 浮动可拖 / 智感握姿三种学习页布局模式切换，
// 首页进度移至常规，评分振动移至复习；这里只保留复习界面的布局。
// 当前布局模式 = null 表示加载中；加载失败回退 'bottom'。
// 切换后立即生效（下次进入学习页）。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
//
// @输出
// 渲染布局分组卡片；用户选择模式时持久化并更新当前布局模式；
//
// @副作用
// 调用 加载学习布局模式 / 保存学习布局模式 读写本地持久化；
// 持久化失败仅丢失下次启动后的值，不回滚 UI。
// ========================================================
@Component
export struct 布局分组 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 是否深色: boolean = false;
  // ⓘ 上抛：点击布局行的 ⓘ 时，由父级（设置面板）弹出 字段帮助面板
  打开说明回调: (标题: Resource, 正文: Resource) => void = (标题: Resource, 正文: Resource): void => {};

  // B12-Y5 2026-07-29 修复 Bug 1：@StorageProp('themeMode') 让主题模式切换直接触发重 build，
  // 不依赖 @Prop 是否深色 传播（aurora 主题 主色按钮背景 深浅色相同，@StorageLink 可能不触发）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  @State private 当前布局模式: 学习布局模式 | null = null;
  @StorageProp(STUDY_GRIP_AVAILABILITY_KEY) private gripAvailability: StudyGripAvailability = 'unchecked';
  async aboutToAppear(): Promise<void> {
    // 失败回退到 'bottom'（默认），保证 chip 一直可选。
    try {
      this.当前布局模式 = await 加载学习布局模式();
    } catch (error) {
      this.当前布局模式 = 'bottom';
    }
  }

  private 取本地化文本(资源: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源);
  }

  /** 学习页布局模式的本地化标签。 */
  private 布局模式标签(模式: 学习布局模式): string {
    if (模式 === 'smart') {
      return this.取本地化文本($r('app.string.settings_study_layout_smart'));
    }
    if (模式 === 'float') {
      return this.取本地化文本($r('app.string.settings_study_layout_float'));
    }
    return this.取本地化文本($r('app.string.settings_study_layout_bottom'));
  }

  /** 顺序与 STUDY_LAYOUT_MODES 相同。 */
  private 布局模式选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.settings_study_layout_bottom')) },
      { value: this.取本地化文本($r('app.string.settings_study_layout_float')) },
      { value: this.取本地化文本($r('app.string.settings_study_layout_smart')) }
    ];
  }

  /** 加载中使用默认选项。 */
  private 布局模式索引(): number {
    return studyLayoutIndex(this.当前布局模式);
  }

  private gripHint(_locale: string = this.uiLanguage): string {
    return namedResourceText(this.getUIContext(), studyGripHintKey(this.gripAvailability));
  }

  /** 切换布局模式：乐观更新 UI + 异步持久化；持久化失败仅丢失下次启动后的值，不回滚 UI。 */
  private async 切换布局(模式: 学习布局模式): Promise<void> {
    if (this.当前布局模式 === 模式) {
      return;
    }
    this.当前布局模式 = 模式;
    try {
      await 保存学习布局模式(模式);
    } catch (error) {
      // 持久化失败可接受：UI 已切换，下次启动会回退到上次保存的值。
    }
  }

  // ========================================================
  // @块ID UI-LAYOUT-002
  // @名称 分组头部
  //
  // @作用
  // 渲染详情页的静态设置分区。
  //
  // @副作用
  // ========================================================
  build() {
    设置分组卡片({
      groupId: 'study_layout',
      是否深色: this.是否深色
    }) {
      Column({ space: 8 }) {
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'study_layout', this.uiLanguage),
            showHelp: true,
            onHelp: (): void => {
              this.打开说明回调($r('app.string.settings_study_layout_row'), $r('app.string.settings_study_layout_help'));
            }, options: this.布局模式选项(), selectedIndex: this.布局模式索引(),
            value: this.当前布局模式 !== null ? this.布局模式标签(this.当前布局模式) :
              this.取本地化文本($r('app.string.settings_study_layout_bottom')),
            onSelect: (索引: number): void => {
              if (索引 >= 0 && 索引 < STUDY_LAYOUT_MODES.length) this.切换布局(STUDY_LAYOUT_MODES[索引]);
            } })
          if (this.当前布局模式 === 'smart') {
            Text(this.gripHint())
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
          }
      }
      .width('100%')
    }
  }
}
