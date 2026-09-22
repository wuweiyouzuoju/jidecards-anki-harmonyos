// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { SelectStyle } from '../../utils/SelectStyle';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-NOTETYPE-EDITOR-001
// @名称 笔记类型编辑器
//
// @作用
// 编辑单个笔记类型：名称 + 字段（增删改排序）+ 模板（名称/正面/背面）+ CSS。
// 走 GetNotetypeLegacy → 编辑 JSON → UpdateNotetypeLegacy 路径。
// 对应 Anki 桌面端「管理笔记类型 → 选中类型 → 字段/卡片」标签页。
//
// @输入
// isDark: 是否深色主题
// notetypeId: 待编辑的笔记类型 ID
// notetypeName: 笔记类型名（初始展示用）
// onClose: 关闭回调
// onSaved: 保存成功回调
//
// @输出
// 渲染编辑浮卡面板；用户点保存时调后端 RPC。
//
// @业务规则
// - 加载时调 获取笔记类型旧版 取完整 JSON，解析出 flds/tmpls/css/name
// - 保存时把编辑后的值写回 JSON，调 更新笔记类型旧版 整体提交
// - 保留 JSON 中未编辑的字段（media/sticky/font/reqs 等）不动
// - 字段令牌（{{字段名}}）点击插入到当前模板编辑区
// - 所有用户可见文案走 $r('app.string.notetype_editor_*')
//
// @副作用
// 持有 笔记类型服务 实例；点击保存时调后端 RPC。
// ========================================================

import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';

interface 字段项 {
  ord: number;
  name: string;
}

interface 模板项 {
  ord: number;
  name: string;
  qfmt: string;
  afmt: string;
}

@Component
export struct 笔记类型编辑器 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop notetypeId: number = 0;
  @Prop notetypeName: string = '';
  onClose: () => void = (): void => {};
  onSaved: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 加载中: boolean = false;
  @State private 保存中: boolean = false;
  @State private 错误信息: string = '';
  @State private 类型名: string = '';
  @State private 字段列表: 字段项[] = [];
  @State private 模板列表: 模板项[] = [];
  @State private 当前模板索引: number = 0;
  @State private CSS文本: string = '';
  @State private fieldsExpanded: boolean = false;
  @State private templatesExpanded: boolean = false;
  @State private stylesExpanded: boolean = false;
  @State private 原始JSON: string = '';

  private readonly 服务: 笔记类型服务 = new 笔记类型服务();

  aboutToAppear(): void {
    this.类型名 = this.notetypeName;
    this.加载JSON();
  }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private async 加载JSON(): Promise<void> {
    this.加载中 = true;
    this.错误信息 = '';
    try {
      const json: string = await this.服务.获取笔记类型旧版(this.notetypeId);
      this.原始JSON = json;
      this.解析JSON(json);
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.加载中 = false;
    }
  }

  private 解析JSON(json: string): void {
    try {
      const obj: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
      // 名称
      const name: Object | undefined = obj['name'];
      if (typeof name === 'string') {
        this.类型名 = name;
      }
      // CSS
      const css: Object | undefined = obj['css'];
      if (typeof css === 'string') {
        this.CSS文本 = css;
      }
      // 字段
      const flds: Object | undefined = obj['flds'];
      if (Array.isArray(flds)) {
        const 列表: 字段项[] = [];
        for (let i = 0; i < flds.length; i++) {
          const f: Record<string, Object> = flds[i] as Record<string, Object>;
          const fname: Object | undefined = f['name'];
          const ford: Object | undefined = f['ord'];
          列表.push({
            ord: typeof ford === 'number' ? ford : i,
            name: typeof fname === 'string' ? fname : ''
          });
        }
        列表.sort((a: 字段项, b: 字段项): number => a.ord - b.ord);
        this.字段列表 = 列表;
      }
      // 模板
      const tmpls: Object | undefined = obj['tmpls'];
      if (Array.isArray(tmpls)) {
        const 列表: 模板项[] = [];
        for (let i = 0; i < tmpls.length; i++) {
          const t: Record<string, Object> = tmpls[i] as Record<string, Object>;
          const tname: Object | undefined = t['name'];
          const tqfmt: Object | undefined = t['qfmt'];
          const tafmt: Object | undefined = t['afmt'];
          const tord: Object | undefined = t['ord'];
          列表.push({
            ord: typeof tord === 'number' ? tord : i,
            name: typeof tname === 'string' ? tname : '',
            qfmt: typeof tqfmt === 'string' ? tqfmt : '',
            afmt: typeof tafmt === 'string' ? tafmt : ''
          });
        }
        列表.sort((a: 模板项, b: 模板项): number => a.ord - b.ord);
        this.模板列表 = 列表;
        this.当前模板索引 = 0;
      }
    } catch (error) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_editor_parse_error'));
    }
  }

  private 序列化JSON(): string {
    try {
      const obj: Record<string, Object> = JSON.parse(this.原始JSON) as Record<string, Object>;
      // 更新名称
      obj['name'] = this.类型名;
      // 更新 CSS
      obj['css'] = this.CSS文本;
      // 更新字段（保留原始字段对象，只改 name 和 ord）
      const 原flds: Object | undefined = obj['flds'];
      if (Array.isArray(原flds)) {
        const 新flds: Object[] = [];
        for (let i = 0; i < this.字段列表.length; i++) {
          const 原项: Record<string, Object> = (i < 原flds.length ? 原flds[i] : {}) as Record<string, Object>;
          原项['name'] = this.字段列表[i].name;
          原项['ord'] = i;
          新flds.push(原项);
        }
        obj['flds'] = 新flds;
      }
      // 更新模板（保留原始模板对象，只改 name/qfmt/afmt/ord）
      const 原tmpls: Object | undefined = obj['tmpls'];
      if (Array.isArray(原tmpls)) {
        const 新tmpls: Object[] = [];
        for (let i = 0; i < this.模板列表.length; i++) {
          const 原项: Record<string, Object> = (i < 原tmpls.length ? 原tmpls[i] : {}) as Record<string, Object>;
          原项['name'] = this.模板列表[i].name;
          原项['qfmt'] = this.模板列表[i].qfmt;
          原项['afmt'] = this.模板列表[i].afmt;
          原项['ord'] = i;
          新tmpls.push(原项);
        }
        obj['tmpls'] = 新tmpls;
      }
      return JSON.stringify(obj);
    } catch (error) {
      return this.原始JSON;
    }
  }

  private async 保存(): Promise<void> {
    if (this.保存中) {
      return;
    }
    this.保存中 = true;
    this.错误信息 = '';
    try {
      const json: string = this.序列化JSON();
      await this.服务.更新笔记类型旧版(json, false);
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.notetype_editor_saved')),
        duration: 2000
      });
      this.onSaved();
      this.onClose();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.保存中 = false;
    }
  }

  // 字段操作
  private 添加字段(): void {
    this.字段列表.push({ ord: this.字段列表.length, name: '' });
    // ArkUI @State 数组 push 后需要触发刷新
    this.字段列表 = [...this.字段列表];
  }

  private 删除字段(索引: number): void {
    if (this.字段列表.length <= 1) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_editor_last_field'));
      return;
    }
    this.字段列表.splice(索引, 1);
    // 重新编号
    for (let i = 0; i < this.字段列表.length; i++) {
      this.字段列表[i] = { ord: i, name: this.字段列表[i].name };
    }
    this.字段列表 = [...this.字段列表];
  }

  private 上移字段(索引: number): void {
    if (索引 <= 0) {
      return;
    }
    const 临时: 字段项 = this.字段列表[索引 - 1];
    this.字段列表[索引 - 1] = this.字段列表[索引];
    this.字段列表[索引] = 临时;
    for (let i = 0; i < this.字段列表.length; i++) {
      this.字段列表[i] = { ord: i, name: this.字段列表[i].name };
    }
    this.字段列表 = [...this.字段列表];
  }

  private 下移字段(索引: number): void {
    if (索引 >= this.字段列表.length - 1) {
      return;
    }
    const 临时: 字段项 = this.字段列表[索引 + 1];
    this.字段列表[索引 + 1] = this.字段列表[索引];
    this.字段列表[索引] = 临时;
    for (let i = 0; i < this.字段列表.length; i++) {
      this.字段列表[i] = { ord: i, name: this.字段列表[i].name };
    }
    this.字段列表 = [...this.字段列表];
  }

  private 更新字段名(索引: number, 名: string): void {
    this.字段列表[索引] = { ord: this.字段列表[索引].ord, name: 名 };
    this.字段列表 = [...this.字段列表];
  }

  // 模板操作
  private 当前模板(): 模板项 {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return { ord: 0, name: '', qfmt: '', afmt: '' };
    }
    return this.模板列表[this.当前模板索引];
  }

  private 更新模板名(名: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    this.模板列表[this.当前模板索引] = { ord: t.ord, name: 名, qfmt: t.qfmt, afmt: t.afmt };
    this.模板列表 = [...this.模板列表];
  }

  private 更新正面模板(文: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    this.模板列表[this.当前模板索引] = { ord: t.ord, name: t.name, qfmt: 文, afmt: t.afmt };
    this.模板列表 = [...this.模板列表];
  }

  private 更新背面模板(文: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    this.模板列表[this.当前模板索引] = { ord: t.ord, name: t.name, qfmt: t.qfmt, afmt: 文 };
    this.模板列表 = [...this.模板列表];
  }

  @Builder
  private 字段行(字段: 字段项, 索引: number) {
    Row({ space: 应用尺寸.间距_4 }) {
      TextInput({ text: 字段.name })
        .fontSize(应用尺寸.字号_正文_小)
        .height(应用尺寸.按钮高度)
        .backgroundColor($r('app.color.surface_card'))
        .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
        .borderRadius(应用尺寸.圆角_面板)
        .layoutWeight(1)
        .onChange((值: string) => { this.更新字段名(索引, 值); })
      // 上移
      Text() { ThemeTextSpans('↑', (索引 > 0) ? this.themeAccentColors : [], this.getUIContext()) }
        .fontSize(16)
        .fontColor(索引 > 0 ? this.主色按钮背景 : 设置面板色板_取(this.isDark).弱化文字)
        .width(28)
        .height(28)
        .textAlign(TextAlign.Center)
        .onClick(() => { this.上移字段(索引); })
      // 下移
      Text() { ThemeTextSpans('↓', (索引 < this.字段列表.length - 1) ? this.themeAccentColors : [], this.getUIContext()) }
        .fontSize(16)
        .fontColor(索引 < this.字段列表.length - 1 ? this.主色按钮背景 : 设置面板色板_取(this.isDark).弱化文字)
        .width(28)
        .height(28)
        .textAlign(TextAlign.Center)
        .onClick(() => { this.下移字段(索引); })
      // 删除
      Text('×')
        .fontSize(18)
        .fontColor($r('app.color.error_text'))
        .width(28)
        .height(28)
        .textAlign(TextAlign.Center)
        .onClick(() => { this.删除字段(索引); })
    }
    .width('100%')
  }

  @Builder
  private 字段令牌行(字段名: string) {
    Text() { ThemeTextSpans(`{{${字段名}}}`, this.themeAccentColors, this.getUIContext()) }
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(this.主色按钮背景)
      .backgroundColor(设置面板色板_取(this.isDark).标签背景)
      .borderRadius(应用尺寸.圆角_面板)
      .padding({ left: 8, right: 8, top: 4, bottom: 4 })
      .margin({ right: 4, bottom: 4 })
      .onClick(() => {
        // 点击令牌插入到当前模板的正面编辑区末尾
        const t: 模板项 = this.当前模板();
        this.更新正面模板(t.qfmt + `{{${字段名}}}`);
      })
  }

  build() {
    Stack() {
      // 磨砂玻璃遮罩层
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(设置面板色板_取(this.isDark).遮罩)
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          if (!this.加载中 && !this.保存中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
          // 固定标题操作栏
          DialogHeader({
            title: $r('app.string.notetype_editor_title'),
            actionLabel: this.保存中 ? $r('app.string.notetype_editor_saving') : $r('app.string.notetype_editor_save'),
            actionEnabled: !this.加载中 && !this.保存中,
            closeLabel: $r('app.string.create_deck_cancel'),
            closeEnabled: !this.保存中,
            onClose: (): void => { this.onClose(); },
            onAction: () => { this.保存(); }
          })

        Scroll() {
        Column({ space: 应用尺寸.间距_16 }) {
          // 加载中
          if (this.加载中) {
            Row({ space: 应用尺寸.间距_8 }) {
              LoadingProgress()
                .width(20)
                .height(20)
                .color($r('app.color.action_primary'))
              Text($r('app.string.notetype_editor_loading'))
                .fontSize(应用尺寸.字号_正文_中)
                .fontColor($r('app.color.text_secondary'))
            }
            .width('100%')
            .justifyContent(FlexAlign.Center)
          }

          // 错误信息
          if (this.错误信息 !== '') {
            Text(this.错误信息)
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.error_text'))
              .width('100%')
          }

          if (!this.加载中) {
            // === 名称区 ===
            Column({ space: 应用尺寸.间距_5 }) {
              Text($r('app.string.notetype_editor_name'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              TextInput({ text: this.类型名 })
                .height(应用尺寸.按钮高度)
                .fontSize(应用尺寸.字号_正文)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                .borderRadius(应用尺寸.圆角_面板)
                .onChange((值: string) => { this.类型名 = 值; })
            }
            .width('100%')

            Button() {
              Row() {
                Text($r('app.string.notetype_editor_fields'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                Text(this.fieldsExpanded ? '⌃' : '⌄')
                  .fontColor($r('app.color.text_secondary'))
              }
              .width('100%')
            }
            .type(ButtonType.Normal)
            .width('100%')
            .height(应用尺寸.按钮高度)
            .backgroundColor($r('app.color.surface_card'))
            .onClick((): void => { this.fieldsExpanded = !this.fieldsExpanded; })
            if (this.fieldsExpanded) {
            // === 字段区 ===
            Column({ space: 应用尺寸.间距_5 }) {
              Row() {
                Text($r('app.string.notetype_editor_fields'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .fontWeight(FontWeight.Medium)
                  .layoutWeight(1)
                Text() { ThemeTextSpans($r('app.string.notetype_editor_add_field'), this.themeAccentColors, this.getUIContext()) }
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor(this.主色按钮背景)
                  .onClick(() => { this.添加字段(); })
              }
              .width('100%')

              ForEach(this.字段列表, (字段: 字段项, 索引: number) => {
                this.字段行(字段, 索引)
              }, (字段: 字段项, 索引: number): string => `${索引}_${字段.name}`)
            }
            .width('100%')

            }

            Button() {
              Row() {
                Text($r('app.string.notetype_editor_templates'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                Text(this.templatesExpanded ? '⌃' : '⌄')
                  .fontColor($r('app.color.text_secondary'))
              }
              .width('100%')
            }
            .type(ButtonType.Normal)
            .width('100%')
            .height(应用尺寸.按钮高度)
            .backgroundColor($r('app.color.surface_card'))
            .onClick((): void => { this.templatesExpanded = !this.templatesExpanded; })
            if (this.templatesExpanded) {
            // === 模板区 ===
            Column({ space: 应用尺寸.间距_5 }) {
              Text($r('app.string.notetype_editor_templates'))
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .fontWeight(FontWeight.Medium)
                .width('100%')

              // 模板选择器
              if (this.模板列表.length > 1) {
                Select([
                  ...this.模板列表.map((t: 模板项): SelectOption => {
                    return { value: t.name };
                  })
                ])
                  .selected(this.当前模板索引)
                  .value(this.当前模板().name)
                  .width('100%')
                  .attributeModifier(new SelectStyle())
                  .font(SelectStyle.controlFont)
                  .borderRadius(SelectStyle.controlRadius)
                  .onSelect((索引: number) => {
                    this.当前模板索引 = 索引;
                  })
              }

              // 模板名
              Text($r('app.string.notetype_editor_template_name'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              TextInput({ text: this.当前模板().name })
                .height(应用尺寸.按钮高度)
                .fontSize(应用尺寸.字号_正文_小)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                .borderRadius(应用尺寸.圆角_面板)
                .onChange((值: string) => { this.更新模板名(值); })

              // 字段令牌（点击插入）
              if (this.字段列表.length > 0) {
                Text($r('app.string.notetype_editor_tokens'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                  .width('100%')
                Flex({ wrap: FlexWrap.Wrap }) {
                  ForEach(this.字段列表, (字段: 字段项) => {
                    this.字段令牌行(字段.name)
                  }, (字段: 字段项): string => 字段.name)
                }
                .width('100%')
              }

              // 正面模板
              Text($r('app.string.notetype_editor_front_template'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              TextArea({ text: this.当前模板().qfmt })
                .fontSize(应用尺寸.字号_正文_小)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                .borderRadius(应用尺寸.圆角_面板)
                .constraintSize({ minHeight: 80 })
                .width('100%')
                .onChange((值: string) => { this.更新正面模板(值); })

              // 背面模板
              Text($r('app.string.notetype_editor_back_template'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              TextArea({ text: this.当前模板().afmt })
                .fontSize(应用尺寸.字号_正文_小)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                .borderRadius(应用尺寸.圆角_面板)
                .constraintSize({ minHeight: 80 })
                .width('100%')
                .onChange((值: string) => { this.更新背面模板(值); })
            }
            .width('100%')

            }

            Button() {
              Row() {
                Text($r('app.string.notetype_editor_css'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                Text(this.stylesExpanded ? '⌃' : '⌄')
                  .fontColor($r('app.color.text_secondary'))
              }
              .width('100%')
            }
            .type(ButtonType.Normal)
            .width('100%')
            .height(应用尺寸.按钮高度)
            .backgroundColor($r('app.color.surface_card'))
            .onClick((): void => { this.stylesExpanded = !this.stylesExpanded; })
            if (this.stylesExpanded) {
            // === CSS 区 ===
            Column({ space: 应用尺寸.间距_5 }) {
              Text($r('app.string.notetype_editor_css'))
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .fontWeight(FontWeight.Medium)
                .width('100%')
              TextArea({ text: this.CSS文本 })
                .fontSize(应用尺寸.字号_正文_小)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                .borderRadius(应用尺寸.圆角_面板)
                .constraintSize({ minHeight: 100 })
                .width('100%')
                .onChange((值: string) => { this.CSS文本 = 值; })
            }
            .width('100%')

            }

            // === 保存按钮 ===

            if (this.保存中) {
              Row({ space: 应用尺寸.间距_8 }) {
                LoadingProgress()
                  .width(20)
                  .height(20)
                  .color($r('app.color.action_primary'))
                Text($r('app.string.notetype_editor_saving'))
                  .fontSize(应用尺寸.字号_正文_中)
                  .fontColor($r('app.color.text_secondary'))
              }
              .width('100%')
              .justifyContent(FlexAlign.Center)
            }
          }
        }
        .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .align(Alignment.TopStart)
        .edgeEffect(EdgeEffect.Spring)
      }
        .width('88%')
        .height('80%')
        .constraintSize({ maxWidth: 480 })
        .padding(应用尺寸.面板内边距)
        .backgroundColor($r('app.color.surface_card'))
        .borderRadius(应用尺寸.圆角_卡片)
        .onClick(() => {})
        .transition(TransitionEffect.asymmetric(
          TransitionEffect.opacity(0)
            .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
            .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
          TransitionEffect.opacity(0)
            .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
        ))
    }
    .width('100%')
    .height('100%')
  }
}
