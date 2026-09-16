// SPDX-License-Identifier: AGPL-3.0-or-later
import { CustomTransition } from '../utils/自定义转场';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

import { 加载学习提醒设置, 保存学习提醒设置, 提醒项, 生成提醒项ID } from '../model/学习提醒存储';
import { 刷新学习提醒, 首次引导通知设置 } from '../model/学习提醒服务';
import { 设置面板色板_取 } from '../utils/设置面板配色';
import { 颜色键 } from '../model/颜色主题';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 提醒编辑面板 } from '../components/提醒编辑面板';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { 统一空态 } from '../components/common/统一空态';

// ========================================================
// @块ID UI-STUDY-REMINDER-PAGE-001
// @名称 学习提醒页（NavDestination 列表页）
//
// @作用
// 从首页"更多"菜单点"提醒"推入的独立页面。
// 列表式展示所有提醒项，每项有独立开关。
// 右上角"+"按钮 push 新建提醒编辑页。
// 点击卡片（非开关区域）push 编辑提醒页。
//
// @前置条件
// - module.json5 已声明 ohos.permission.PUBLISH_AGENT_REMINDER 权限
// - AGC 后台已通过"代理提醒"权限审核
// ========================================================

@Component
export struct 学习提醒页 {
  @State private 转场透明度: number = 1;
  private pathStack?: NavPathStack;

  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  @StorageLink(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（提醒列表滚到底时最后一项需完整滚出导航条区域）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  @State private 主题模式值: 主题模式 = 'system';

  @State private 是否深色: boolean = false;
  @State private 提醒项列表: 提醒项[] = [];
  @State private 操作中: boolean = false;
  @State private 错误信息: string = '';
  @State private 已加载: boolean = false;
  // 新建/编辑共用的磨砂弹层（与创建牌组面板同款风格）
  @State private 显示编辑面板: boolean = false;
  @State private 面板是否新建: boolean = true;
  @State private 面板目标ID: number = -1;
  @State private 面板初始小时: number = 6;
  @State private 面板初始分钟: number = 0;
  @State private 面板初始标题: string = '';
  @State private 面板初始内容: string = '';
  @State private 面板保存中: boolean = false;
  @State private 面板错误: string = '';

  async aboutToAppear(): Promise<void> {
    CustomTransition.getInstance().注册NavParam('ReminderPage',
      (isPush: boolean, isExit: boolean): void => { this.转场透明度 = isExit ? 1 : 0; },
      (isPush: boolean, isExit: boolean): void => { this.转场透明度 = isExit ? 0 : 1; }
    );
    this.是否深色 = 解析是否深色(this.主题模式值, this.系统暗黑模式);
    await this.加载列表();
  }

  private async 加载列表(): Promise<void> {
    const 设置 = await 加载学习提醒设置();
    this.提醒项列表 = 设置.提醒项列表;
    this.已加载 = true;
  }

  aboutToDisappear(): void {
    CustomTransition.getInstance().注销NavParam('ReminderPage');
  }

  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  private 格式化时间(小时: number, 分钟: number): string {
    const h: string = 小时 < 10 ? `0${小时}` : `${小时}`;
    const m: string = 分钟 < 10 ? `0${分钟}` : `${分钟}`;
    return `${h}:${m}`;
  }

  private 预览内容(项: 提醒项): string {
    const 模板: string = 项.内容.length > 0 ? 项.内容 : '今日待学习 {{待学}} 张，待复习 {{待复习}} 张';
    return 模板
      .replace('{{待学}}', 'X')
      .replace('{{待复习}}', 'Y');
  }

  private 预览标题(项: 提醒项): string {
    return 项.标题.length > 0 ? 项.标题 : 'jidecards 学习提醒';
  }

  private async 切换单项开关(项ID: number, 值: boolean): Promise<void> {
    const 新列表: 提醒项[] = [];
    for (let i: number = 0; i < this.提醒项列表.length; i++) {
      if (this.提醒项列表[i].唯一ID === 项ID) {
        新列表.push({
          唯一ID: this.提醒项列表[i].唯一ID,
          小时: this.提醒项列表[i].小时,
          分钟: this.提醒项列表[i].分钟,
          标题: this.提醒项列表[i].标题,
          内容: this.提醒项列表[i].内容,
          开启: 值
        });
      } else {
        新列表.push(this.提醒项列表[i]);
      }
    }
    this.提醒项列表 = 新列表;
    await 保存学习提醒设置(this.提醒项列表);
    await this.重新发布();
  }

  private async 重新发布(): Promise<void> {
    this.操作中 = true;
    this.错误信息 = '';
    try {
      await 刷新学习提醒();
    } catch (错误) {
      this.错误信息 = 错误 instanceof Error ? 错误.message : `${错误}`;
    } finally {
      this.操作中 = false;
    }
  }

  private 新建提醒(): void {
    // 新建走磨砂弹层（时间 + 标题 + 内容），默认早上 6 点
    this.面板是否新建 = true;
    this.面板目标ID = -1;
    this.面板初始小时 = 6;
    this.面板初始分钟 = 0;
    this.面板初始标题 = '';
    this.面板初始内容 = '';
    this.面板错误 = '';
    this.显示编辑面板 = true;
  }

  private 编辑提醒(项: 提醒项): void {
    this.面板是否新建 = false;
    this.面板目标ID = 项.唯一ID;
    this.面板初始小时 = 项.小时;
    this.面板初始分钟 = 项.分钟;
    this.面板初始标题 = 项.标题;
    this.面板初始内容 = 项.内容;
    this.面板错误 = '';
    this.显示编辑面板 = true;
  }

  // 弹层确认：新建追加 / 编辑替换 → 落盘 → 发布；首个提醒保存成功后首次拉起系统通知设置页
  private async 弹层确认(小时: number, 分钟: number, 标题: string, 内容: string): Promise<void> {
    if (this.面板保存中) {
      return;
    }
    this.面板保存中 = true;
    this.面板错误 = '';
    try {
      let 新列表: 提醒项[] = [];
      let 已替换: boolean = false;
      for (let i: number = 0; i < this.提醒项列表.length; i++) {
        const 原: 提醒项 = this.提醒项列表[i];
        if (原.唯一ID === this.面板目标ID) {
          新列表.push({
            唯一ID: 原.唯一ID,
            小时: 小时,
            分钟: 分钟,
            标题: 标题,
            内容: 内容,
            开启: 原.开启
          });
          已替换 = true;
        } else {
          新列表.push(原);
        }
      }
      if (!已替换) {
        新列表.push({
          唯一ID: 生成提醒项ID(),
          小时: 小时,
          分钟: 分钟,
          标题: 标题,
          内容: 内容,
          开启: true
        });
      }
      await 保存学习提醒设置(新列表);
      await 刷新学习提醒();
      this.提醒项列表 = 新列表;
      this.显示编辑面板 = false;
      await 首次引导通知设置();
    } catch (错误) {
      this.面板错误 = 错误 instanceof Error ? 错误.message : `${错误}`;
    } finally {
      this.面板保存中 = false;
    }
  }

  // 弹层删除：过滤目标项 → 落盘 → 重发布
  private async 弹层删除(): Promise<void> {
    if (this.面板保存中) {
      return;
    }
    this.面板保存中 = true;
    this.面板错误 = '';
    try {
      const 新列表: 提醒项[] = [];
      for (let i: number = 0; i < this.提醒项列表.length; i++) {
        if (this.提醒项列表[i].唯一ID !== this.面板目标ID) {
          新列表.push(this.提醒项列表[i]);
        }
      }
      await 保存学习提醒设置(新列表);
      await 刷新学习提醒();
      this.提醒项列表 = 新列表;
      this.显示编辑面板 = false;
    } catch (错误) {
      this.面板错误 = 错误 instanceof Error ? 错误.message : `${错误}`;
    } finally {
      this.面板保存中 = false;
    }
  }

  private 返回(): void {
    if (this.pathStack !== undefined && this.pathStack.size() > 0) {
      this.pathStack.pop();
    }
  }

  @Builder
  private 顶部条() {
    Stack() {
      // 左返回 + 右新建按钮，铺满
      Row() {
        按下态按钮({
          文案: $r('app.string.study_back'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.返回(); }
        })
        Blank()
          .hitTestBehavior(HitTestMode.Transparent)
        按下态按钮({
          文案: $r('app.string.reminder_list_create_button'),
          字色: this.动作主色,
          themeText: true,
          点击回调: (): void => { this.新建提醒(); }
        })
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
    })
    .backgroundColor(this.页面底色微染值)
    .alignContent(Alignment.Center)
  }

  @Builder
  private 提醒项卡片(项: 提醒项) {
    Row() {
      // 左侧可点击区域：时间 + 文案（点击进编辑弹层）
      Row() {
        // 左侧时间大字
        Column() {
          Text() { ThemeTextSpans(this.格式化时间(项.小时, 项.分钟), [], this.getUIContext()) }
            .fontSize(28)
            .fontWeight(FontWeight.Bold)
            .fontColor(项.开启 ? this.解析主色按钮背景() : 设置面板色板_取(this.是否深色).弱化文字)
        }
        .alignItems(HorizontalAlign.Center)
        .width(90)

        // 中间文案
        Column() {
          Text(this.预览标题(项))
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(项.开启 ? 设置面板色板_取(this.是否深色).主文字 : 设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .width('100%')
          Text(this.预览内容(项))
            .fontSize(13)
            .fontColor(项.开启 ? 设置面板色板_取(this.是否深色).次文字 : 设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ top: 4 })
            .width('100%')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        .margin({ left: 12 })
      }
      .layoutWeight(1)
      .onClick((): void => {
        this.编辑提醒(项);
      })

      // 右侧开关：独立区域，不与编辑点击手势竞争
      Toggle({ type: ToggleType.Switch, isOn: 项.开启 })
        .selectedColor(this.解析主色按钮背景())
        .enabled(!this.操作中)
        .onChange((值: boolean): void => {
          this.切换单项开关(项.唯一ID, 值);
        })
    }
    .width('100%')
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  @Builder
  private 空状态() {
    统一空态({
      标题: $r('app.string.reminder_list_empty'),
      副标题: $r('app.string.reminder_list_empty_hint')
    })
  }

  build() {
    NavDestination() {
      Stack() {
        // 下层：主内容
        Column() {
          this.顶部条()

          if (this.已加载) {
            Scroll() {
              Column({ space: 应用尺寸.pageSectionGap }) {
                if (this.提醒项列表.length === 0) {
                  this.空状态()
                } else {
                  ForEach(this.提醒项列表, (项: 提醒项) => {
                    this.提醒项卡片(项)
                  }, (项: 提醒项) => `${项.唯一ID}-${项.小时}-${项.分钟}-${项.标题}-${项.内容}-${项.开启}`)
                }

                if (this.错误信息 !== '') {
                  Text(this.错误信息)
                    .fontSize(12)
                    .fontColor(设置面板色板_取(this.是否深色).错误色)
                    .width('100%')
                    .padding({ top: 应用尺寸.间距_8 })
                }
              }
              .width('100%')
              .padding({
                left: 应用尺寸.页面内边距_水平,
                right: 应用尺寸.页面内边距_水平,
                top: 应用尺寸.pageContentTopInset,
                bottom: 应用尺寸.pageBottomInset + this.导航条高度
              })
            }
            .layoutWeight(1)
            .align(Alignment.Top)
          }
        }
        .width('100%')
        .height('100%')
        .backgroundColor(this.页面底色微染值)

        // 顶层：新建/编辑提醒磨砂弹层（与创建牌组面板同款风格）
        if (this.显示编辑面板) {
          提醒编辑面板({
            isDark: this.是否深色,
            busy: this.面板保存中,
            errorMessage: this.面板错误,
            是否新建: this.面板是否新建,
            初始小时: this.面板初始小时,
            初始分钟: this.面板初始分钟,
            初始标题: this.面板初始标题,
            初始内容: this.面板初始内容,
            onCancel: (): void => {
              if (!this.面板保存中) {
                this.显示编辑面板 = false;
              }
            },
            onConfirm: (小时: number, 分钟: number, 标题: string, 内容: string): void => {
              this.弹层确认(小时, 分钟, 标题, 内容);
            },
            onDelete: (): void => {
              this.弹层删除();
            }
          })
        }
      }
      .width('100%')
      .height('100%')
      .alignContent(Alignment.Center)
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .opacity(this.转场透明度)
    // 从编辑页 pop 返回时刷新列表。onPageShow 只对 @Entry 路由页生效，NavDestination 必须用 onShown。
    .onShown((): void => {
      this.加载列表();
    })
  }
}
