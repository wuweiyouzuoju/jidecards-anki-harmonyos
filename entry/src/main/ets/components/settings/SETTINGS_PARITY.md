# 设置分类与后续接入位置

2026-09-19 核对。以 AnkiDroid 当前源码的分类为参考，沿用 JideCards 的鸿蒙组件与已实现能力；不承诺像素一致或功能全部对齐。本文件与设置组件放在一起，供后续开发定位，未完成项不进入用户设置菜单。

参考：[目录定义](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preference_headers.xml)、[复习偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_reviewing.xml)、[外观偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_appearance.xml)、[控制偏好](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/res/xml/preferences_controls.xml)。菜单维护操作参考[官方手册](https://github.com/ankidroid/ankidroiddocs/blob/main/manual.asc)。

## 本轮已归位

| 分类 | 简洁版 | 实验版 | 开发位置 |
| --- | --- | --- | --- |
| 常规 | 语言、首页今日进度 | 相同 | `GeneralSettings.ets`；既有语言存储、主页偏好 |
| 复习 | 不展示高级算法入口 | FSRS 开关与作用范围说明 | `调度器分组.ets`、`model/FSRS控制器.ets`；每日上限、学习步骤、目标记忆率等仍在牌组选项，不能复制成全局设置 |
| 同步 | 账号、自动/立即同步、自定义服务器 | 相同 | `同步分组.ets` |
| 外观 | 深浅与颜色主题、支持主题的背景动效、卡片字号、底部/悬浮答题工具栏 | 相同 | `外观分组.ets`、`布局分组.ets`、`CardTextSizeControl.ets`、`ThemeMotionControl.ets` |
| 控制 | 评分振动 | 另含点击区域快速答题 | `ReviewControlsSettings.ets`；Tap Zones 继续仅实验版生效 |
| 数据管理 | 导入导出（含手动整库备份）、媒体管理 | 另含数据库检查、笔记类型、隐藏牌组、空卡、重复笔记、未用标签 | `数据分组.ets`；数据库检查状态和服务调用保留在 `../设置面板.ets`，并入普通列表行 |
| 学习帮助 | 可用 | 可用 | `术语分组.ets`；新手不必切实验版才能看评分与状态解释 |
| 高级设置 | 隐藏 | 开发者解锁入口 | `开发者调试分组.ets`；AI 设置仍受独立发布/解锁状态约束 |
| 应用指纹与兑换 | 查看/复制应用识别码、领取说明、主题兑换和使用 | 相同 | `RedemptionPanel.ets`；独立分类直接展示 |
| 关于 | 版本、反馈、许可 | 相同 | `../设置面板.ets` |

`model/SettingsNavigation.ts` 统一目录、模式可见性与搜索。简洁版说明和搜索不宣传被隐藏的细调功能。模式切换只保存 `simple_mode` 并回到目录，不重置主题、字号、同步账号、牌组或卡片；既有只在实验版生效的功能仍遵守该限制。

### 设置之外的模式差异（2026-09-20 源码核对）

- 牌组长按菜单：简洁版隐藏“自定义学习”“创建过滤牌组”；隐藏牌组操作本身两种模式均有，隐藏牌组管理入口仅实验版显示。
- 牌组选项：简洁版保留每日新卡上限、每日复习上限、学习步骤、复习排序；实验版另有高级设置入口。高级设置覆盖共享预设、本牌组/今日限额、新卡排序与毕业间隔、重学与难卡、同笔记卡埋藏、音频与计时/自动操作选项、FSRS 保持率/参数/轻松日/重排、全局限额策略及间隔系数。此处盘点设置入口，不将 Core 配置字段等同于学习页已实现全部行为。
- 点击区域快速答题在简洁版实际停用；评分振动、颜色主题、主题动效、工具栏布局和自定义服务器均可在两种模式直接配置。
- AI 入口受独立发布/解锁条件控制，并非实验版自动开放；启用后两种模式均可使用。AI 工具过程在简洁版默认折叠、实验版默认展开，不是功能缺失。

## 延后项目与对应开发位置

| 对照项目 | 当前证据与边界 | 后续接入位置及验收重点 |
| --- | --- | --- |
| 日切时间、提前学习、时间盒 | Core `proto/anki/config.proto` 的 `Preferences.Scheduling/Reviewing` 已定义字段；本轮未找到应用设置读写/时间盒提醒链路，不能把底层字段当成已实现 UI | `调度器分组.ets`、`backend/配置服务.ts`、`proto/messages/ConfigMessages.ts`、`pages/学习页.ets`；用 Core Preferences 协议，不在界面重算调度 |
| 剩余计数、按钮间隔、音频按钮可见性 | Core Preferences 已有相应字段；当前学习页有计数/间隔展示，但可配置读取和持久化需逐项审计，不能笼统写成缺少学习功能 | `外观分组.ets`、`pages/学习页.ets`、学习工具栏/评分按钮；同时验证普通与浮动布局 |
| 屏幕常亮 | 本轮搜索未找到页面生命周期配套设置与窗口调用；平台实现需后续确认 | 复习设置、`pages/学习页.ets`、窗口生命周期；离页和后台释放，不替换系统全局设置 |
| 完整手势/硬件键映射 | 已有固定 Tap Zones 与部分键盘/预览交互，不等于 AnkiDroid 可自定义手势系统 | `ReviewControlsSettings.ets`、`model/实验性功能存储.ets`、`model/PreviewInteraction.ts`、`pages/学习页.ets`；避免抢占网页链接、输入框、手写及滚动 |
| 自动历史备份、保留数量、恢复列表 | 手动整库导入导出及导入失败回滚已存在；Core 备份引擎具备能力，应用自动触发和历史列表尚未接入，详见 `docs/FEATURE_STATUS.md` | `数据分组.ets`、`backend/集合服务.ts`、`backend/后端会话.ts`、`backend/数据迁移服务.ts`；补触发/等待/保留/安全恢复，不能把同步称作备份 |
| 独立无障碍页、自定义字体 | 卡片字号已实现；读屏顺序、按钮标签、大字体布局及自定义字体导入尚未完成系统审计，因此本轮不创建空分类 | `CardTextSizeControl.ets`、通用按钮、卡片 HTML 构建器、各页面；先核对已有读屏能力和资源路径 |
| 设置内的复习提醒入口 | 已有首页“更多 → 提醒”、提醒列表及编辑页，不属于功能未实现；本轮未复制一套设置 | `pages/学习提醒页.ets`、`pages/设置页.ets`、首页导航；后续可复用现有路由并保持同步安全门禁 |
| 多配置档案与 Android 专属设置 | 本轮未查证多档案完整链路；Android 存储、导航抽屉和系统集成开关不能直接搬到 HarmonyOS | 常规设置、`backend/后端会话.ts`、`entryability/EntryAbility.ets`；先确认数据隔离、系统能力、同步账户边界，再决定是否建设 |
| 设置项全文搜索 | 当前搜索到分类和说明，尚非 AnkiDroid 的逐设置项搜索与高亮 | `model/SettingsNavigation.ts`、`../设置面板.ets`；后续索引必须遵守模式/权益/发布开关，避免搜到不可用项 |

验证：分类搜索、模式隔离、数据库状态传递与评分振动保存回归在 `tools/tests`。用户要求自行操作设备后，后续只运行本地测试与构建，不安装、不重启、不操作模拟器；本文件后续变更需按实际结果更新。

## 本应用特色与名词取舍

- 保留幻彩/动态背景、浮动工具栏、首页隐藏牌组、主题兑换及受门禁控制的 AI 功能；它们是 JideCards 自有实现，不宣称等同 Anki 标准选项。
- “专属内容”缩窄为“JideCards 主题赠送”；当前兑换白名单由 ThemeCatalog 的主题内容决定，签名/权益协议不变。识别码详情放入独立的“应用指纹与兑换”分类，两种模式均可访问。
- “浮动可拖”改“悬浮可拖动”，“学习页布局”行改“答题工具栏位置”，“已隐藏牌组”改“首页隐藏的牌组”，说明不会改变复习状态。“学习术语与帮助”目录简化为“学习帮助”。
- 保留 Anki 的牌组、笔记类型、FSRS、暂停/埋藏等领域概念，在帮助中解释用途；不通过重命名把不同语义合并。
