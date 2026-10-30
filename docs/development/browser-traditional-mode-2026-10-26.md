# 浏览传统模式：源码对照与验证

日期：2026-10-26。AnkiDroid 固定提交：`6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd`。

浏览右上角更多菜单最下方提供“传统模式”开关，默认保留现有外观；模式和两种外观各自的 Cards/Notes 列配置通过原集合偏好保存队列持久化。

| 对照内容 | 上游源码 | 本次实现 |
| --- | --- | --- |
| 持久化默认列、Cards/Notes 分开 | [BrowserConfig.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/libanki/src/main/java/com/ichi2/anki/libanki/BrowserConfig.kt) | 卡片：noteFld、template、cardDue、deck；笔记：noteFld、note、template、noteTags。 |
| 标题单击／长按 | [CardBrowserFragment.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/CardBrowserFragment.kt) | 点击替换该列，长按管理列。 |
| 替换列候选 | [ColumnSelectionDialogFragment.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/ColumnSelectionDialogFragment.kt) | 仅显示当前模式未使用的 Core 列，替换保留其它位置。 |
| 增减、重排与草稿 | [BrowserColumnSelectionFragment.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/BrowserColumnSelectionFragment.kt) | 共用列管理弹窗，至少一列；上移／下移重排，确认保存、关闭放弃。传统列按 Core 目录提供，兼容超过16列，协议防御上限64。 |
| 手机多列、正文、行颜色 | [BrowserMultiColumnAdapter.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/BrowserMultiColumnAdapter.kt) | 手机和宽屏都并排等宽列，三行省略，连续列表；Core 旗标／标记／暂停／埋藏映射整行底色，选中／焦点优先。 |
| 行打开与范围选择 | [CardBrowserViewModel.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/CardBrowserViewModel.kt) | 传统模式点击／Enter 直接编辑，现有模式继续预览；长按／右键与完整结果范围选择复用原实现。 |
| 独立保存列顺序 | [BrowserColumnCollection.kt](https://github.com/ankidroid/Anki-Android/blob/6b2dfdc6f382b2ed31bc8f60bdc72115726d53dd/AnkiDroid/src/main/java/com/ichi2/anki/browser/BrowserColumnCollection.kt) | 传统 Cards/Notes 独立保存，另保留原外观列，不以切换模式覆盖其它配置。 |

搜索、排序、全选、标签、牌组、旗标、标星、暂停、埋藏、到期、重置、重新定位、笔记类型、评分、导出、删除和撤销沿用原 Service/Core 及写入控制器。新增模式不改变卡库内容或调度。JIDE 目录、实时开关／列状态、只读偏好和需确认的修改提案已同步。

布局边界：传统表格外缘水平边距0，每列内边距8vp，行上下12vp，列标题最小44vp；多选标题和正文同时预留20vp复选框及8vp间隔。现有外观保持原间距。

## 验证

- `npm test -- agent`：738项通过，包含传统模式提案、确认预览、保存、未知列和不支持的 Notes 列拒绝。
- `npm test -- ui`：592项通过；后续标题几何／按压与认知相关检查另已通过。
- 最终定向行为和认知回归：40项通过，其中传统模式直接测试10项；另一次受影响浏览、菜单、选择、界面检查105项通过。
- `HARMONY_UNSIGNED=1 devecocli build`：最终增量 HAP 编译成功，仅生成 unsigned HAP；未确认签名成功，不把 SignHap 任务结束当成已签名。
- `npm test -- browser`：后续修复测试夹具后，681项全部通过、0失败。此前两项卡片信息测试因缺少 `应用尺寸` 依赖在实例化阶段失败；现通过公共 `loadPlatformModule` 加载真实尺寸模块并显式注入，原有迟到请求、销毁、错误及重试断言全部保留。单文件2项与完整浏览回归均通过，未修改产品组件或降低断言。日志：`work/browser-card-info-fixed-regression.log`。
- 文档、架构边界与资源契约：31项全部通过；本次代码路径 `git diff --check` 通过。

## 验收边界

截至2026-10-26没有覆盖安装、重启应用或操作设备卡库；后续2026-10-27已完成签名覆盖安装和手机模拟器深浅色及样卡交互检查，详见设备验收记录。本段历史未验收范围为真实 ArkUI 列标题手势、手机多列几何、大字体、横屏、主题、输入法和重开应用的交互验收。上游 Android 的列管理采用拖动，这里复用鸿蒙已有上移／下移操作；Android 字体、主题、菜单像素样式及列候选的卡片样例没有逐像素复刻，不能据此宣称所有 AnkiDroid 浏览器细节完全等同。

当前工作树含大量既有修改，本轮保留其它任务内容，未提交或发布。长期入口为 `docs/development/browser-stats.md`；源码路径与 SHA256 在 `tools/tests/fixtures/ankidroid-browser-columns.json`，主要代码为 `BrowserPreferences.ts`、`浏览页.ets`、`卡片表格.ets`、`BrowserDisplayDialog.ets`。
