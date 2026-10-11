# 设置分类与后续接入位置

2026-10-11：完成牌组选项、集合偏好及 AnkiDroid 设置分类的源码/主机/Core 审查，并修复三处 P1（全局 FSRS 改绑、预设基线覆盖、非当前草稿越过范围）和一处 P2（JIDE 图表只读能力写入）。真实 Core 复查通过普通字段、120 种枚举与排序组合、父子/今日限额、过滤牌组高级配置及四处反例。修复与验证边界见[当日设置审查](../../../../../../docs/development/settings-integration-audit-2026-10-11.md)；设备行为和在线同步仍须单独验收。

2026-10-07：外观的卡面显示已补隐藏音频按钮及显示答案时中断音频，两个模式都使用公共设置行和真实 Core 偏好；JIDE 读取/提案同步接通。导入结果可按 Core 返回的笔记 ID 分类、分批跳转浏览页，失败条目不能定位时禁用。模拟器与主机验收记录见[高优先级改进](../../../../../../docs/development/ankidroid-high-priority-2026-10-07.md)。

2026-09-19 核对。以 AnkiDroid 当前源码的分类为参考，沿用 JideCards 的鸿蒙组件与已实现能力；不承诺像素一致或功能全部对齐。本文件与设置组件放在一起，供后续开发定位，未完成项不进入用户设置菜单。

2026-10-04 后续核对：缺失媒体定位/打标，以及 JIDE 专用备份策略、学习常亮、输入映射等已接通，下表已更新。[Core 全量接入盘点](../../../../../../docs/development/ankicore-integration-audit-2026-10-04.md)保留当日快照，不作为当前剩余清单；当前能力沿领域拥有者核对，区分 Core 保存、JIDE 操作与本机实际生效。

参考：[目录定义](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preference_headers.xml)、[复习偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_reviewing.xml)、[外观偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_appearance.xml)、[控制偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_controls.xml)。菜单维护操作参考[官方手册](https://github.com/ankidroid/ankidroiddocs/blob/main/manual.asc)。

## 本轮已归位

| 分类 | 简洁版 | 实验版 | 开发位置 |
| --- | --- | --- | --- |
| 常规 | 语言、首页今日进度 | 相同 | `GeneralSettings.ets`；既有语言存储、主页偏好 |
| 复习 | 评分振动、学习手势、四象限点击答题、底部/悬浮答题工具栏 | 相同，另有全部牌组的复习设置（新学习日开始时间、允许提前学习、学习休息提醒）及 FSRS 开关与作用范围说明 | `ReviewControlsSettings.ets`、`布局分组.ets`、`ReviewPreferencesSettings.ets`、`调度器分组.ets`、`model/FSRS控制器.ets`；每日上限、学习步骤、目标记忆率等仍在牌组选项，不能复制成全局设置 |
| 同步 | 账号、自动/立即同步、自定义服务器 | 相同 | `同步分组.ets` |
| 外观 | 深浅与颜色主题、支持主题的背景动效、卡片字号、剩余卡数/下次复习间隔显示、隐藏音频按钮与显示答案时中断音频 | 相同 | `外观分组.ets`、`CardTextSizeControl.ets`、`ThemeMotionControl.ets`、`ReviewPreferencesSettings.ets` |
| 数据管理 | 导入文件、导出牌组、备份与恢复、媒体管理、隐藏牌组恢复 | 另含数据库检查、笔记类型、空卡、重复笔记、未用标签 | `数据分组.ets`；数据库检查状态和服务调用保留在 `../设置面板.ets`，并入普通列表行 |
| 学习帮助 | 可用 | 可用 | `术语分组.ets`；新手不必切实验版才能看评分与状态解释 |
| 高级设置 | 隐藏 | 开发者解锁入口 | `开发者调试分组.ets`；AI 设置仍受独立发布/解锁状态约束 |
| 应用指纹与兑换 | 查看/复制应用识别码、领取说明、主题兑换和使用 | 相同 | `RedemptionPanel.ets`；独立分类直接展示 |
| 关于 | 版本、反馈、许可 | 相同 | `../设置面板.ets` |

`model/SettingsNavigation.ts` 统一目录、模式可见性与搜索。简洁版说明和搜索不宣传被隐藏的细调功能。模式切换只保存 `simple_mode` 并回到目录，不重置主题、字号、同步账号、牌组或卡片；既有只在实验版生效的功能仍遵守该限制。

### 设置之外的模式差异（2026-09-20 源码核对）

- 牌组长按菜单：简洁版隐藏“自定义学习”“创建过滤牌组”；隐藏牌组操作与设置中的恢复入口两种模式均有。
- 牌组选项：简洁版保留每日新卡上限、每日复习上限、学习步骤、复习排序；实验版另有高级设置入口。高级设置覆盖共享预设、本牌组/今日限额、新卡排序与毕业间隔、重学与难卡、同笔记卡埋藏、音频与计时/自动操作选项、FSRS 保持率/参数/轻松日/重排、全局限额策略及间隔系数。此处盘点设置入口，不将 Core 配置字段等同于学习页已实现全部行为。
- 快捷答题方式（关闭、四象限点击答题、学习手势）以互斥单选开放给两种模式；评分振动、颜色主题、主题动效、工具栏布局和自定义服务器均可在两种模式直接配置。
- AI 入口受独立发布/解锁条件控制，并非实验版自动开放；启用后两种模式均可使用。思考过程默认展开、可手动收起，工具详情默认折叠；两种界面模式使用相同规则，不是功能缺失。

## 数据管理入口与完整度核对（2026-10-02）

AnkiDroid 的首页溢出菜单把数据库、媒体、空卡放在“检查”子菜单，备份、笔记类型、导入、导出在相邻入口（[当前菜单源码](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/menu/deck_picker.xml)）。本应用集中到“设置 → 数据管理”，属于按任务归类，不是逐层复制其导航。集中说明有利于理解，但常用动作路径更深；不据此宣称整体优于 AnkiDroid。

| 项目 | 已接入 | 当前边界 / 缺口 |
| --- | --- | --- |
| 导入导出 | APKG 更新策略、CSV/TSV/TXT 预览与字段映射导入、结果/进度/取消、COLPKG 备份恢复；牌组可导出笔记字段或卡片正反面文本 | 文本为 UTF-8 制表符分隔 `.txt`，不含媒体文件或复习进度；普通导入与整库恢复入口分开 |
| 笔记类型 | 从六种 Core 标准类型创建、克隆现有类型、删除类型、字段增删改排序、模板与 CSS 编辑、模板增删和样例正反面预览 | Cloze 只保留一个模板；字段结构修改须先保存再预览；增删模板影响该类型的卡片，保存前确认 |
| 媒体 | 缺失/未用报告、未用文件进回收站、恢复/清空回收站；缺失笔记分页定位与确认后批量打标并进入浏览器 | 大集合 ID 的最终查询成本和设备交互仍需验收 |
| 查重 | 按笔记类型选择字段与搜索范围；Core 归一化后精确分组，每批最多 200 条，提供进度、取消及精确笔记跳转 | 完整 ID 与分组键仍占 O(N) 内存；取消等待当前原生读结束，实际大集合与设备交互仍需验收 |
| 备份 | 启动自动备份开关、立即创建、历史列表、安全恢复；JIDE 读取/修改保留数及间隔 | 按既定要求不新增手动策略 UI；历史备份不含媒体 |
| 数据库、空卡、未用标签 | 已接入实际 Core 调用与操作反馈 | 入口存在不等于已完成全部设备场景验收；本轮未做全面与上游逐项等价验证 |

上游差异依据：[用户手册](https://docs.ankidroid.org/manual.html)说明卡片模板增删和预览；[发布记录](https://docs.ankidroid.org/changelog.html)说明 CSV 导入导出及缺失媒体笔记标记。实现入口分别为 `数据迁移面板.ets`、`笔记类型管理面板.ets`、`笔记类型编辑器.ets`、`媒体管理面板.ets`、`查找重复对话框.ets`、`备份管理面板.ets`。以上按当前源码核对；笔记类型与文本导出的责任和验收边界见 [浏览与编辑](../../../../../../docs/development/browser-stats.md)及[数据迁移](../../../../../../docs/development/import-data.md)，设备效果需独立验收。

## 后续边界与对应开发位置

| 对照项目 | 当前证据与边界 | 后续接入位置及验收重点 |
| --- | --- | --- |
| 音频按钮可见性与翻面中断 | 已通过真实 Core Preferences、外观设置及 JIDE 接通；学习页消费隐藏按钮与中断音频偏好，卡面单项按钮和整体重播职责分开 | `ReviewPreferencesStore`、`pages/学习页.ets`、卡片 HTML 构建器和 `CardAudioSession`；实际 ArkWeb/平台音频效果仍需设备验收 |
| 复杂预设保存与全局 FSRS | 已修复：持久化基线独立于草稿，各预设记住保存范围，非当前草稿按范围隔离；全局 FSRS 仅提交默认牌组原预设，开关与初始化保持绑定 | `DeckOptionsSession`、`DeckOptionsPresets`、`DeckConfigSave`、`FSRS控制器.ets`；生产行为回归及当日真实 Core 复查 |
| 图表偏好 | UI/JIDE 共用三项可写偏好保存与验证；JIDE 拒绝只读 `browserLinksSupported`，底层保存保留 Core 最新能力值 | `AgentPreferenceSettings`、`AgentSettingsTools`、`GraphPreferencesCommands`；真实 Core 写入与回读通过 |
| 过滤牌组高级配置 | 手动创建提供一组搜索、数量、排序、重排；JIDE 提供双搜索、预览延迟和已有过滤牌组编辑，清空/重建复用 Core | `model/FilteredDeckCommands.ts`、创建过滤牌组面板、JIDE 维护/操作工具；手动入口少不等于整个应用未接高级字段 |
| 同步高级偏好与自定义 CA | 自定义服务器已接；计费网络、I/O 超时、徽标显示开关及手动强制单向设置尚无完整等价入口。自定义证书仅底层 setter，无完整导入/持久化/重开恢复/移除链 | `同步服务`、`SyncSettings`、`同步分组.ets`；全量冲突选择不等同于手动强制单向偏好，平台证书与网络策略另验 |
| 屏幕常亮 | 已通过 JIDE 专用工具配置；学习页前台可见时应用，离页/后台恢复窗口状态 | `backend/StudyControlsService.ets`、`model/StudyScreenAwakeSession.ts`、`pages/学习页.ets`；无新增手动设置入口，设备生命周期待验 |
| 学习键盘与手势映射 | 学习快捷键支持手动录制/输入、任意可识别物理键、Ctrl/Shift/Alt、多个绑定与卡面区分、删除/恢复默认；JIDE 共用配置。left/right/double 手势仍为既有规定动作；浏览快捷键独立 | `model/StudyKeyboard.ts`、`model/StudyControls.ts`、`components/settings/StudyKeyboardSettings.ets`、`pages/学习页.ets`；编辑、模板输入、弹窗、手写及滚动保护，旧配置兼容；设备验收另行完成 |
| 自动历史备份、保留数量、恢复列表 | 已接入：启动后安全空闲触发 Core 自动备份；数据管理提供开关、立即创建、历史列表与恢复确认。Core 负责间隔和保留，恢复复用整库替换安全副本。 | `components/settings/备份管理面板.ets`、`backend/LocalBackups.ets`、`model/BackupCoordinator.ts`、`backend/集合服务.ts` |
| 独立无障碍页、自定义字体 | 卡片字号已实现；读屏顺序、按钮标签、大字体布局及自定义字体导入尚未完成系统审计，因此本轮不创建空分类 | `CardTextSizeControl.ets`、通用按钮、卡片 HTML 构建器、各页面；先核对已有读屏能力和资源路径 |
| 设置内的复习提醒入口 | 已有首页“更多 → 提醒”、提醒列表及编辑页，不属于功能未实现；本轮未复制一套设置 | `pages/学习提醒页.ets`、`pages/设置页.ets`、首页导航；后续可复用现有路由并保持同步安全门禁 |
| 多配置档案与 Android 专属设置 | 本轮未查证多档案完整链路；Android 存储、导航抽屉和系统集成开关不能直接搬到 HarmonyOS | 常规设置、`backend/后端会话.ts`、`entryability/EntryAbility.ets`；先确认数据隔离、系统能力、同步账户边界，再决定是否建设 |
| 设置项全文搜索 | 当前搜索到分类和说明，尚非 AnkiDroid 的逐设置项搜索与高亮 | `model/SettingsNavigation.ts`、`../设置面板.ets`；后续索引必须遵守模式/权益/发布开关，避免搜到不可用项 |

验证：分类搜索、模式隔离、数据库状态传递与评分振动保存回归在 `tools/tests`。用户要求自行操作设备后，后续只运行本地测试与构建，不安装、不重启、不操作模拟器；本文件后续变更需按实际结果更新。

## 集合级偏好接入核对（2026-10-02）

本轮核查本机 `D:\Projects\AnkiDroid` 的 reviewing/appearance XML、`ReviewingSettingsFragment` 和 `CollectionPreferences`，协议以 `UPSTREAM.lock` 锁定的 Anki 26.05 为准。复习分类的 `global_review` 与外观分类的 `study_display` 分别在实验版与两种模式有真实设置组件，搜索包含五项标题。日切和提前窗口交由 Core 调度，时间盒由 `StudySessionController` 拥有并复用学习页计时生命周期；两个显示开关从 Core 快照读取并作用于固定、悬浮布局。

保存入口为 `ReviewPreferencesStore` → `配置服务` 的 Get/SetPreferences（9 / 9、9 / 10），保存前重新读取，仅替换编辑字段，保留未知字段及编辑/备份偏好；未引入本机 AppStorage 持久化副本。零值、非整分钟已有值、写入/回读失败、离页和同步占用均有直接行为测试，真实 Core 测试核对日切与学习队列及重开保存。详细字段、责任链、时间盒暂停规则和设备验收边界统一见[学习领域文档](../../../../../../docs/development/study-media.md#集合级全局复习偏好2026-10-02)。本任务不改变 FSRS 优化或手势映射。

## 本应用特色与名词取舍

- 保留幻彩/动态背景、浮动工具栏、首页隐藏牌组、主题兑换及受门禁控制的 AI 功能；它们是 JideCards 自有实现，不宣称等同 Anki 标准选项。
- “专属内容”缩窄为“JideCards 主题赠送”；当前兑换白名单由 ThemeCatalog 的主题内容决定，签名/权益协议不变。识别码详情放入独立的“应用指纹与兑换”分类，两种模式均可访问。
- “浮动可拖”改“悬浮可拖动”，“学习页布局”行改“答题工具栏位置”，“已隐藏牌组”改“首页隐藏的牌组”，说明不会改变复习状态。“学习术语与帮助”目录简化为“学习帮助”。
- 保留 Anki 的牌组、笔记类型、FSRS、暂停/埋藏等领域概念，在帮助中解释用途；不通过重命名把不同语义合并。

2026-10-03：全局复习偏好（global_review）仅实验版可见，简洁版目录/搜索/助手界面描述均隐藏该卡片。标题 i 复用设置根层说明浮层，解释集合范围、日切、提前学习和时间盒；复习显示（study_display）保持两种模式可见。偏好保存及 Core 运行行为不变。
