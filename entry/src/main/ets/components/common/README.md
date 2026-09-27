# 公共 UI 代码索引

修改同类 UI 前先从此表进入实现，再用符号名全仓搜索调用点；同时搜索旧符号、资源键和替代写法，避免只覆盖已复用的页面。新增公共语义入口时更新本表及调用检查，不逐页复制组件。

| UI 语义 | 唯一实现 | 自动检查 |
| --- | --- | --- |
| 详情/展开箭头（`>` / `›`） | [DisclosureChevron.ets](DisclosureChevron.ets) | `tools/tests/ui-disclosure-contract.test.mjs`：扫描所有 ArkTS，禁止独立文字箭头；检查居中几何 |
| 菜单项、展开行 | [MenuItem.ets](MenuItem.ets) | `ui-select-layout.test.mjs` |
| 牌组选项字段、高级入口及分类行 | [DeckOptionRow.ets](../home/DeckOptionRow.ets)，字段编辑器仍由 DeckOptionField 管理；导航入口只传标题与回调 | `deck-option-dialog.test.mjs`，防止实验版入口另写灰底按钮 |
| 页面四段等距与菜单锚点 | [应用尺寸](../../utils/应用尺寸.ets) 的 `页面分组间距`、`pageToolbarTop`、`pageToolbarHeight`、`pageContentTop`；光学估计限制见 [间距验收](../../../../../../docs/UI_SPACING.md) | `ui-shell-contract.test.mjs`；真实状态栏字形须设备验收 |
| 菜单承接层与定位 | [AnchoredMenu.ets](AnchoredMenu.ets) | `ui-select-layout.test.mjs` |
| 学习/预览右上角动作菜单 | [CardActionMenu.ets](CardActionMenu.ets)，直接组合 AnchoredMenu、MenuItem，宽度复用 CardViewportLayout 策略 | `study-menu.test.mjs`、`motion-style-contract.test.mjs`；禁止回退原生 bindMenu |
| 学习/预览内容宽度 | [CardViewport.ets](CardViewport.ets) | `card-viewport-layout.test.mjs` |
| 开始学习 / 固定显示答案 | [开始学习按钮.ets](../开始学习按钮.ets)（文案与回调区分动作） | theme-catalog.test.mjs |
| 短请求延迟显示进度圈 | [DelayedLoadingIndicator.ets](DelayedLoadingIndicator.ets)，挂载后 250ms 显示、卸载取消 | `ui-loading-feedback.test.mjs` |
| 弹窗标题与操作 | [DialogHeader.ets](DialogHeader.ets) | 相关弹窗的行为测试 |
| 带长说明的同步开关行 | [SettingsToggleRow.ets](SettingsToggleRow.ets)：标题/说明共享剩余宽度，右侧开关不压缩，间隔 16vp | `npm test -- sync` 验证开关行为；HAP 与设备布局检查验证换行/避让 |

`DisclosureChevron` 以 24vp 正方形内的折线绘制，几何中心固定在 (12, 12)，不依赖字体基线。调用方可传 `tint`，展开状态可旋转整个组件，不覆盖内部尺寸、偏移或另绘箭头。它只作装饰、不拦截点击，交互和无障碍名称由所在行负责。

查全部使用位置：`rg -n 'DisclosureChevron' entry/src/main/ets`。运行扫描：`node --test tools/tests/ui-disclosure-contract.test.mjs`。索引指向真实实现，不另维护一份容易过期的调用页面清单。
