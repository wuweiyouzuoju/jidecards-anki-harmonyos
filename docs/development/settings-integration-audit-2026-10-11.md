# 设置接入审查（2026-10-11）

[文档导航](../README.md) · [当前设置拥有者](../../entry/src/main/ets/components/settings/SETTINGS_PARITY.md) · [AnkiDroid 对照入口](../ANKIDROID_PARITY_AUDIT.md)

这是对当日共享工作树的审查与修复记录。初审复现复杂预设三处 P1 和 JIDE 图表一处 P2；用户要求修复后，**四处问题已修复并经生产模型及真实 Core 复查**。下面保留修复前反例和当次证据，设备及在线同步不在主机验证结论内。以后判断当前功能，仍沿上述领域拥有者和源码读取；本记录不维护第二份持续更新的缺口矩阵。

## 基线与证据口径

- jidecards 当日源码版本为 2.9.98 / 3079，HEAD 为 `8f9513b`，存在大量未提交修改；审查包含这些修改，不能等同于该提交或商店包。
- Core 由 `UPSTREAM.lock` 锁定 Anki 26.05 / `e64c6b1`；没有升级后端。
- 对照本机相邻 `AnkiDroid` 源码归档：2.25.0beta1 / 22500201，backend `0.1.68-anki26.05`。该目录没有 Git 历史，因此不推测提交或最新发行版。审查包括 `preference_headers.xml`、16 份 `preferences*.xml`（含空提醒文件）及对应 Kotlin 调用者；231 个带 key 的 XML 节点包含目录、分类、动作与重复项，**不是 231 个独立偏好，也不是覆盖率分母**。牌组选项、统计及编辑等动态偏好另沿 Core/实际调用核查。
- 证据分为源码调用链、Node 生产模型执行、锁定 Core 临时集合执行和修复后的增量签名 HAP 构建；没有安装、重启或操作 HarmonyOS/Android 设备，没有在线同步，也未构建 APK。主机 harness 不证明 ArkUI 渲染与平台生命周期。
- [复现工具](../../tools/audit-settings-core.mjs)记录执行时间、版本、XML 聚合 SHA-256 和关键生产输入聚合 SHA-256。哈希按稳定顺序纳入文件名、分隔符和原始字节，用于定位当次证据，不以测试数量推导兼容性。

## 修复结果（同日）

- 全局 FSRS 请求只携带 Default 原绑定的完整配置，开、关及首次初始化均保持预设、限额和其他配置。
- 持久化基线与字段/名称草稿分离，改字段后重命名、离开再返回仍能按牌组范围隔离，并保留用户指定的名称。
- 每个暂存预设分别保存范围，UI 切换时恢复选择；非当前草稿逐项经过范围判断，必要时另存独立预设，不丢弃编辑。选择只被另一个牌组使用的预设也会隔离。批量优化继续共享参数，普通字段修改保持各自范围；失败重试请求一致。
- JIDE 图表写入契约收紧到三项实际偏好，提交只读能力位在写前拒绝。UI/JIDE 共用保存队列，仅验证可写字段，Core 请求保留最新能力值。中英文帮助与助手声明同步更新。

## 修复前已复现问题

本节描述修复前实现，源码链接用于定位拥有者；当前行为以上节和领域文档为准。

### P1：全局 FSRS 开关会改变默认牌组使用的预设

位置：[FSRS控制器.ets](../../entry/src/main/ets/model/FSRS控制器.ets#L118)。`构造请求()`直接按 `view.allConfigs` 顺序回传全部预设。Core 返回的列表按名称排序，而 [update.rs](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/deckconfig/update.rs#L34) 明确以请求最后一个配置绑定 `targetDeckId`。

复现：保留默认牌组使用预设 1，另建名称排序靠后的预设，其新卡上限为 23；通过生产 `设置FSRS开启状态()`切换全局算法。真实 Core 回读显示默认牌组改用后者，新卡上限从 37 变成 23，FSRS 开关回读仍成功。首次初始化同样调用该请求工厂，已有多个预设的集合也可能触发。后续修复需只提交默认牌组原配置或保证原配置最后，并验证开、关及初始化都保持绑定、限额和其他配置。

### P1：改字段后重命名预设，绕过“仅当前牌组”的隔离

位置：[DeckOptionsSession.ts](../../entry/src/main/ets/model/home/DeckOptionsSession.ts#L157)。每次预设操作后，`this.original` 被替换为包含未保存修改的草稿。保存时 [DeckConfigSave.ts](../../entry/src/main/ets/model/DeckConfigSave.ts#L24)用该基线比较是否修改，误判无需复制共享/默认预设。

复现：默认预设新卡上限 20 → 编辑成 31 → 重命名 → `shared=false` 保存。生产请求最后配置仍为 ID 1，真实 Core 默认预设变成 31。受影响的包括使用该预设的牌组及以后采用默认预设的新牌组。切换离开再返回同一预设也存在相同的基线覆盖路径。后续修复需分离持久化基线与当前草稿，逐预设保持基线；不能仅调整一次字段比较。

### P1：编辑 A 后切换 B，A 的修改仍以共享范围提交

位置：[DeckOptionsSession.ts](../../entry/src/main/ets/model/home/DeckOptionsSession.ts#L129)及 [DeckOptionsPresets.ts](../../entry/src/main/ets/model/DeckOptionsPresets.ts#L59)。`modifiedExceptCurrent()`返回所有非当前预设草稿，保存合并时直接使用原 ID，未经过 `shared=false` 的隔离判断。

复现：A 为默认预设，新卡上限 31 → 编辑成 37 → 切换到 B → 仍按仅当前牌组保存。生产请求同时提交 A 和 B，真实 Core 的 A 变为 37。即使修复上一个“当前预设基线”问题，这条非当前草稿合并路径仍会漏过。后续需明确非当前编辑的保存范围，保证界面范围说明、预设操作和实际提交一致，并覆盖新建/克隆、切换回去、批量优化后再编辑等组合。

### P2：JIDE 把图表只读能力当作可写偏好，出现部分保存后报错

位置：[AgentPreferenceSettings.ts](../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts#L22)、[AgentSettingsTools.ts](../../entry/src/main/ets/model/agent/AgentSettingsTools.ts#L82)、[GraphPreferencesCommands.ts](../../entry/src/main/ets/backend/GraphPreferencesCommands.ts#L12)。工具允许完整 JSON 中的 `browserLinksSupported=false`，写后验证又比较全部四项。

[Core 图表实现](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/stats/graphs/mod.rs#L86)恒定返回 `browser_links_supported=true`，setter 只保存周首日、分离暂停计数与预测积压。真实 Core 复现中，这三项已改变，但生产入口抛出 `graph_preferences_save_unverified`。普通统计 UI 保留读取的能力值，未触发此反例。后续应从可写契约排除该能力位，或在写前明确校验/归一化；同步修正 JIDE 声明、提案与回读，不能只放宽写后验证。

## 复杂配置的执行结果

以下结果只代表列出的主机/Core 范围，未声称穷举所有值或全部设备行为。

| 场景 | 当日结果与证据 |
| --- | --- |
| 11 组、46 个声明字段的编辑 → 表单校验 → 请求 → Core | 真实 Core 回读与生产请求一致；包含学习步骤单位、系数、轻松日、音频、计时、自动操作、搜索/日期和自定义调度脚本。常规保存能复制默认预设并保留原值。FSRS 参数非空优化由原生 FSRS 用例验证，不能把空数组重置当优化成功。 |
| SM-2 / FSRS 枚举差异、收集与排序兼容性 | 全部当前可选枚举和每种收集方式允许的排序组合，共 120 次实际 Core 保存/回读一致。FSRS 与 SM-2 的难度/易度枚举标题差异沿共同目录与已有契约检查。 |
| 本牌组/今日限额、0 与空值 | 今日新卡/复习上限 0 确实使队列为空；清除覆盖后恢复继承，队列重新出现；牌组目标记忆率可独立保存。 |
| 父子牌组与两项集合级限额策略 | 父牌组上限 0 时，单独学习子牌组在 `applyAllParentLimits=false/true` 下分别有卡/无卡；子牌组复习上限 0 时，`newCardsIgnoreReviewLimit=false/true` 分别无新卡/有新卡。 |
| 应用到子牌组、删除共用预设 | 真实 Core 将新预设及限额应用到父子牌组，独立牌组保持绑定；通过生产会话删除父子共用预设后，两者均改用有效的保留预设。删除预设本身是共享操作，与字段编辑的范围保护分开判断。 |
| 保存模式“优化全部参数” | 真实 Core 接受请求并保持目标牌组绑定及预设集合；本次小样本计算返回空参数，表示采用 Core 内置默认值，不能当成训练出非空参数。此处只验证请求/应用语义，不证明参数训练质量。 |
| 启用 FSRS 并重排已有复习卡 | 先完成真实 SM-2 复习，再启用 FSRS、目标记忆率 0.95、重排；卡片得到正的 memoryState，保存目标记忆率并改变间隔。此为正确 deck-options 请求路径，不能抵消全局控制器绑定错误。 |
| FSRS 优化、评估、模拟与批量草稿 | 现有生产模型测试覆盖范围冻结、去重、参数代际、失败后只重试失败项、当前配置最后、离页后不回写；原生 FSRS 测试验证真实计算、搜索和多预设范围。未将“计算结果已返回”当作“参数已经保存”。预设分配改动后 UI 要求先保存再计算。 |
| 两组过滤条件、预览延迟、过期提案、清空/重建 | 通过生产 `FilteredDeckCommands` 和真实 Core 保存、选择实际卡片、拒绝旧提案、清空及重新填充成功。Core 会规范化搜索引号，因此用命中卡片验证语义，未错误要求字符串逐字不变。 |
| 13 个已建模集合偏好与重开 | 每项经生产 codec patch 后真实 Core 回读，关闭再打开临时集合后保持；同时检查牌组选项没有丢失。日切及提前学习窗口的实际队列行为由原生 `review_preferences` 验证。 |
| 自定义调度、过滤牌组与层级变更 | 原生专项验证自定义评分间隔和 customData 保存/撤销；过滤牌组清空、重建、编辑和撤销保持原牌组/笔记；重设父级保持子树身份与历史。 |
| 计时/自动操作、音频与输入映射 | Node 生产模型/组件逻辑测试通过，源码沿每卡原牌组配置 → 学习页消费核查。计时上限由 Core 截断复习记录；自动操作另需会话开启，设置秒数不等于自动启动。ArkWeb 音频、平台 TTS、窗口常亮及实际输入设备仍需独立验收。 |

`DeckConfig.Config.new_per_day_minimum`在锁定 proto 中明确标注未使用，不把没有编辑入口误报为调度缺失。未知字段和未编辑配置沿完整 codec 保留，已有保存/协议回归负责保真边界。

## 各类设置的对照记录

此表是当日审查范围快照，当前入口与后续状态归 [SETTINGS_PARITY](../../entry/src/main/ets/components/settings/SETTINGS_PARITY.md)及各领域文档。

| 对照范围 | 当日接入与限制 | 主要事实来源 |
| --- | --- | --- |
| 牌组选项、共享预设、父子范围 | 字段、今日覆盖、应用到子牌组等链路已接；初审发现的三个 P1 已完成同日修复与复查。 | `DeckOptionsCatalog`、`DeckConfigSave`、`DeckOptionsSession`、Core `deckconfig/update.rs` |
| 集合复习偏好 | 日切、提前学习、时间盒、剩余数、间隔显示已由 Core 保存并由对应拥有者消费；load balancer / short-term with steps 等高级参数通过 JIDE。 | [学习与媒体](study-media.md)、`ReviewPreferencesStore`、`PreferencesMessages` |
| 音频、自动操作、答题计时 | 每牌组配置与两项全局音频偏好已接。过滤卡读取原牌组配置。手动重播、翻面中断及等待音频有实际消费路径。 | `StudySessionBackend`、`StudyTiming`、`CardAudioSession`、`pages/学习页.ets` |
| 过滤牌组、自定义学习 | 手动创建入口只提供一组搜索、数量、排序和重排；双搜索与预览延迟等复杂编辑通过 JIDE。清空/重建及六类自定义学习均接 Core，不属于仅有 RPC。 | `FilteredDeckCommands`、创建过滤牌组面板、`CustomStudySession`、`AgentMaintenanceTools` |
| 备份与恢复策略 | 自动开关、立即备份、历史与恢复有 UI；保留数量、间隔经 JIDE。实际自动备份在安全空闲点调用 Core；恢复先准备安全副本，备份不含媒体。 | [同步与数据](sync-data.md)、`LocalBackups`、`BackupCoordinator` |
| 官方/自定义同步 | 账号、服务器、自动同步、媒体开关和全量冲突处理有实际调用；官方入口当日发布开关为开。缺少独立计费网络、I/O 超时、状态徽标显示开关和手动强制单向同步设置，不能宣称逐项等价。 | `ReleaseFeatures`、`SyncSettings`、`AutoSyncScheduler`、同步组件与 [同步与数据](sync-data.md) |
| 自定义 CA 证书 | 同步服务有底层 setter，但未找到设置/JIDE 的导入、持久化、重开恢复与移除调用链，属于底层能力尚未完整产品接入。 | `同步服务.设置自定义证书`及其调用者搜索 |
| 浏览列表、搜索与显示 | 笔记/卡片模式、列、排序、最近搜索、忽略重音经真实 Core/配置保存；与 AnkiDroid 的布局参数不是一一对应。编辑的六项 Core 偏好不能全部算成本机已应用。 | [浏览与统计](browser-stats.md)、`BrowserPreferencesStore`、浏览页 |
| 图表与桌面卡片 | 三项实际图表偏好及统计范围有 UI/数据消费；JIDE 可写能力位 P2 已修复。桌面卡片拥有自己的时间范围、小时窗口和显示偏好，不能与图表 Core 偏好混为一项。 | `StatsSession`、`GraphPreferencesCommands`、桌面卡片数据存储 |
| 语言、模式、外观与背景 | 语言走系统应用语言且需重启；模式只改变入口显隐；深浅主题、颜色、动态背景、字号、工具栏位置有实际消费者。Android 的顶部栏、全屏、垂直居中、ETA、牌组标题等开关并未全部提供等价项。 | [界面](appearance.md)、`SettingsNavigation`、`AppThemeService`、学习页 |
| 键盘、手势与动作按钮 | 预设快捷操作有 UI；JIDE 可配置 space/enter/1–4/r/b/s 与 left/right/double 的规定动作及常亮。AnkiDroid 全部硬件映射、预览器映射、自定义工具栏按钮位置和九组任意用户动作没有完整等价配置。 | `StudyControlsService`、`StudyInputPolicy`、`StudyScreenAwakeSession`、学习页 |
| 无障碍 | 卡片字号有实际应用；图片独立缩放、答题按钮大小、浏览字体比例、长按/双击阈值等尚无完整等价设置。读屏与大字体布局未做本轮设备验收。 | 字号组件、通用按钮、学习与浏览页面 |
| 提醒与通知 | 已有首页“更多 → 提醒”、列表、编辑、平台通知/调度，不是功能缺失；没有复制 AnkiDroid 的最少到期数、widget 振动/闪灯等全部偏好。 | 学习提醒存储、提醒服务、学习提醒页 |
| 编辑器、粘贴与字体 | 字段属性、固定字段、模板和 CSS 按本机拥有者应用；PNG 粘贴策略、换行替换、输入框聚焦、外部上下文菜单、自定义字体导入等不能仅凭 Core 字段存在认定等价。 | [浏览与编辑](browser-stats.md)、字段编辑组件及输入/媒体调用者 |
| Android 平台与开发选项 | 存储路径、ContentProvider、第三方集成、危险 JS API、固定本地端口、系统栏和调试开关属于 Android 专属或未提供等价能力。HarmonyOS 的调试入口不等同于 AnkiDroid 的全部开发选项。 | AnkiDroid advanced/developer XML、EntryAbility、后端会话 |
| 多档案、设置搜索、应用内助手 | 本轮未确认完整多档案隔离链；设置搜索按分类和说明；JIDE 权限/发布开关单独约束入口。已登记工具仍须走领域写入和确认，不能把软件认知描述当作功能接入证据。 | [设置对齐](../../entry/src/main/ets/components/settings/SETTINGS_PARITY.md)、[应用内 Agent](agent.md)、`SettingsNavigation` |

## 验证与复现

初审执行全部 Node 测试：3325 通过；先前的聚焦检查 574 通过是其中一部分，不重复相加。原生首次专项 16 项通过，追加复杂场景 3 项通过，共 19 项。它们代表修复前基线，不能替代修复后验证。初审工具/文档阶段追加 repo/tooling 去重检查，并在修正文档链接后单独重跑文档契约，17 项通过。

修复后以 `tools/test-suites.mjs` 的 agent/home/ui/repo/tooling 选择器去重执行 186 个文件，1916 项全部通过；包含新增的改名/往返切换、各预设范围恢复、单一其他使用者、失败重试、批量优化与普通编辑隔离、真实 UI 回调和图表只读契约回归。可按 `npm test -- agent`、`home`、`ui`、`repo`、`tooling` 分别复现，分开执行会有重叠。选择列表及日志保存为 `.local/settings-fix-2026-10-11/focused-selection.json` 和 `focused-tests.log`。

`npm run build:app -- -SkipRust -ArtifactDirectory .local/settings-fix-2026-10-11/artifact` 增量构建并签名成功，复用未改动的 Core 原生库；告警门禁记录 162 项已接受告警、0 项未预期告警。签名包、构建日志和告警报告保留在该 artifact 目录。此结果验证 SDK/ArkTS 编译与打包，不证明真机行为。

从仓库根执行真实 Core 审查（Node 24、锁定 Rust 工具链和已有 Core 构建依赖）：

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/audit-settings-core.mjs
```

工具只写 `protocol_probe` 拥有的临时集合与 `.local/settings-core-audit/report.json`，不打开真实卡库，不接触账号/网络服务。退出 0 表示列出的检查通过且未发现报告中的反例；退出 1 表示已复现问题；退出 2 表示探针/断言异常，不能当成审查完成。初审退出 1，有九组通过和四处问题；**修复后退出 0，13 组通过、findings 为空、无 error**。复查同时确认离开预设的草稿确实保存、重命名保留显式名称、FSRS 双向开关及初始化保持绑定、JIDE 三字段契约能真实保存。

原生专项命令：

```powershell
cargo test --locked -p jidecards_core --features anki-core --test review_preferences --test fsrs --test custom_study --test protocol_core_semantics --test jide_maintenance
cargo test --locked -p jidecards_core --features anki-core --test custom_scheduling --test filtered_deck --test deck_reparent
```

初审日志保留在忽略目录 `.local/settings-audit-2026-10-11/`；修复日志与签名 HAP 归档在 `.local/settings-fix-2026-10-11/`。可复现的工具和本记录进入版本控制。设备操作和在线同步仍须独立验收，不从以上结果推导。
