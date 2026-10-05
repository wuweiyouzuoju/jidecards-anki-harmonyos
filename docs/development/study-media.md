# 学习、预览与媒体

[返回任务索引](../../PROJECT_CONTEXT.md)

## Core 渲染语义与平台 TTS

`backend/卡片渲染服务.ts` 直接调用锁定 Core 的 `EncodeIriPaths`、`CompareAnswer`、`ExtractClozeForTyping`。既有卡片与未保存草稿先完成 LaTeX 解析，再合并完整正反面 HTML 并编码本地媒体路径；`RenderedCard.questionHtml/answerHtml` 只用于展示，原模板节点仍用于拼写标记和 AV 提取，避免修改音频文件名。必须合并后编码，因为 `<img src="` 和文件名可能分属不同节点；中文与带 `#` 的文件名、远程 URL 的处理由 Core 决定。

学习和只读预览通过 `StudyAnswerRenderer` 将原始字段、实际填空编号、输入与 combining 标志交给 Core，前端只注入 Core 返回的 HTML，不再维护拼写 diff/实体解码算法。Core 读取或比较失败时保留普通答案，不给出本机猜测的正确/错误结论。同步编辑器用于识别编号和插入下一填空的 `填空解析器` 仍保留：这条纯计算路径不负责学习答案裁判，不让每次按键等待 RPC。

`AvTagsResult.items` 保持 Core 重复 AvTag 的原顺序，soundFiles/ttsItems 保留给旧调用方兼容。CardAudioSession 只批处理相邻声音或相邻 TTS，逐段等待真实播放完成；取消中间 TTS 后不能播放后续声音。合成旧响应没有 items 时沿用旧分组行为。回归见 `card-audio-session.test.mjs`，音频顺序兼容声明同时进入 JIDE 软件指纹。

TTS 是平台例外：锁定 Core 的 `rslib/src/card_rendering/tts/other.rs` 在非 Windows 平台返回未实现，鸿蒙仍由 CoreSpeechKit 播放。Core `TTSTag` 的 voices、speed、other_args 全部解码；候选音色按模板顺序匹配 `HarmonyOS_<person>`，仅使用实时查询到的同语言已安装音色。没有匹配或查询失败时使用既有本机音色偏好并记录诊断。模板 speed 映射到 SDK 的 0.5–2 范围，volume（0–2）和 pitch（0.5–2）映射到 SpeakParams.extraParams；越界语速夹到平台边界，未知/非法附加参数保留在解析结果并记录诊断，不传入引擎。跨平台音色名称不保证对应，设备可用语种仍由系统决定。

兼容声明只由 `model/CardRenderingSupport.ts` 拥有，播放器使用同一语速范围/音色前缀/参数映射，JIDE 的 `get_app_structure.cardRendering` 每次读取该声明，软件指纹包含它；声明不表示某台设备已安装指定音色。行为回归在 `card-rendering-core.test.mjs`、`tts-player.test.mjs`，原拼写样例已迁入共享 fixtures 并由 `native/rsharmony/tests/card_rendering.rs` 的真实锁定 Core RPC 验证。HAP 与设备验收仍分别记录。

2026-10-05 验证：上述回归及学习/预览、草稿、音频队列、JIDE 结构与文档测试通过；`node tools/verify-rpc-index.mjs` 和 `node tools/generate-rpc-index.mjs --check` 通过。仓库根目录执行 `cargo test -p jidecards_core --features anki-core --locked --test card_rendering` 与 `cargo clippy -p jidecards_core --features anki-core --test card_rendering --locked -- -D warnings` 通过，覆盖真实 Core 的实体解码、组合字符、填空与媒体路径语义。

上述早期联合编译阻塞（NoteFieldEditor 对齐枚举及导入 RPC 断言）已在接入任务中修正。当前批次的 HAP/仓库/Core 验收以 [接入实施验收](../decisions/2026-10-04-ankicore-ui-routing.md#实施验收) 为准，不将旧失败日志视为当前状态。

## JIDE 专用学习操作配置（2026-10-04）

常亮和键盘/手势映射由 JIDE 的 `get_advanced_settings(study)` / `propose_update_study_controls` 读取和提出修改，不增加手动 UI 入口。`StudyControls.ts` 拥有完整结构与白名单；`StudyControlsService.ets` 复用 `LocalPreferenceWrite` 串行保存、旧值检查、flush/readback 后发布 `studyControls`，不会把存储失败当作保存成功。`gestureMode=inherit` 沿用既有快捷答题模式，其余值覆盖学习时行为。

学习页实际键盘、手势处理保持页面代次、选择题、渲染、编辑、弹层及手写保护；映射评分仅答案面，翻面仅题目面。网页交互元素、选择和滚动仍走原手势过滤，tap 四象限按原规则；系统返回、Escape、Ctrl 与删除键不可重映射。持久值变化更新实际手势脚本，不另存一份页面配置。

`StudyScreenAwakeSession` 串行借用窗口原常亮状态，`createStudyScreenAwake` 通过官方窗口 API 适配；仅 mounted、可见、foreground 的学习页启用，隐藏/后台/离页恢复原值，迟到启用也排队恢复。平台调用失败保留重试状态并记录实际错误，不保证设备支持。回归见 `study-maintenance-controls.test.mjs`、`study-gestures.test.mjs` 及学习生命周期测试，真机屏幕与硬件输入另验。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：pages/学习页.ets → StudySessionController → StudySessionBackend → Anki Core；预览只读。
- 快速反馈：`npm test -- study / npm test -- media`；完整验收见 [验证说明](verification.md)。

## 智感握姿学习布局（2026-10-04）

设置 → 复习 → 学习布局提供底部固定、悬浮可拖动、智感握姿。模式声明和解码只由 `model/StudyLayout.ts` 拥有，既有 `study_layout_mode` 增加 `smart`，默认仍为 `bottom`。智感模式复用普通闪卡的 `学习浮动工具栏` 和原显示答案/评分回调，保持评分顺序；左/右手分别贴对应侧，双手/未握持/未识别保持原位。选择题保留独立提交界面，白板沿用底部答案条。

`backend/StudyGripSensor.ets` 包装 API 20 的 `motion.on/off('holdingHandChanged')`，先检查 Motion 系统能力并处理 801/201/服务失败，声明 normal/system_grant 的 `DETECT_GESTURE`。适配器保留自己的 callback 身份；取消失败先切断 UI listener，再保留 callback 供重试，不能清除其他同类订阅。它唯一发布 AppStorage 的 `studyGripAvailability`，表示最近一次真实订阅结果，不代表系统开关已开启或当前正在监听。

浮动栏唯一持有 `StudyGripSession`；页面提供可见、前后台、弹层、编辑、白板、选择题和阶段条件。稳定换边等待250ms，重复同侧事件不重启动画；按键触摸/拖动期间保留最新候选，所有触点释放/取消后才处理。非单手结果取消待执行迁移但不移动当前栏；后台、覆盖和销毁清除待执行事件，代次挡住旧 callback/timer。能力失败仍可手动拖动，设置显示最近检测结果；恢复前台学习后允许重试。

父 Stack 的 `onAreaChange` 提供实际容器宽高；`StudyLayout.studyToolbarBounds` 唯一贡献左右12vp、顶栏高度后12vp、导航安全区前12vp，栏内仅使用8vp padding。按完整评分栏96×360vp判定空间，不足时两种浮动模式都使用原底部操作区，窗口初次测量前也使用底部布局。旋转、分屏和安全区改变重新夹紧。智感拖动只保存独立的 `study_grip_toolbar_y`，自动换边不写盘、不覆盖原 float X/Y；识别可用时只拖高度，不可用时可手动左右吸附。动画遵守 `themeMotion`。

JIDE 偏好值域复用同一模式声明，`get_settings` 可读 `smart` 及能力边界；`study_layout` 继续没有写入权限。学习页观察发布布局偏好、最近握姿能力和当前侧别，来源是实际浮动栏。中英帮助与设置搜索包含新增选项。

智感高度保存由存储模块串行处理，后一次读取等待已接受的写入完成；失败传给工具栏提示，队列继续允许下一次拖动重试。离页不取消已接受写入，迟到结果不提示已销毁的组件。读取失败明确提示后使用临时位置，不当作首次使用。

回归入口：`study-grip-layout.test.mjs` 直接执行会话、传感器适配、工具栏、存储、窗口边界、页面条件和 JIDE 结构生成；`study-whiteboard.test.mjs` 保留稀疏触点身份/拖动取消回归。HAP 编译与警告门禁检查平台接线；支持机型的自然握持、系统开关、横竖屏/折叠形态、大字体及触屏外观仍需真机验收，模拟状态不证明识别率或耗电。

2026-10-04 实际验收使用上述行为回归，加 `ai-agent-preference-reader`、`ai-agent-app-settings`、资源/布局/架构/组件字段与文档契约专项，并执行 `npm run build:app -- -SkipRust`。本轮未安装设备；更宽的 `npm test -- study` 曾受共享工作树中菜单迁移的旧导入和既有源码形状断言影响，未将专项通过称为全领域通过。新增的握姿状态到 JIDE 结构链由本专项直接执行，不依赖旧菜单测试 harness。

## 旗标与标星（2026-10-03）

学习“更多”的“标记”分组提供标星切换、七色旗标／清除及旗标名称；“卡片操作”分组提供今日跳过、暂停此卡、删除此卡和自动前进。打开“更多”保留右侧主菜单，两组默认向左展开；点击组标题可收起／展开。旗标七色与清除的弹层直接覆盖右侧“更多”菜单，与主菜单同宽、同锚点；左侧两组保留原位和可操作性。重新打开“更多”恢复两组展开并收起颜色。所有学习菜单项左侧显示自绘SVG图标，统一24×24画布、2.5单位粗描边与圆角端点/转角；编辑使用笔，卡片操作使用叠卡，自动前进使用时钟和前进箭头。浅填色由公共 `menu_icon_fill` 或25%透明度的主题/旗标色提供，深色资源保留明亮描边。状态来自 Core 卡片 flags 的低三位和笔记完整 `marked` 标签；学习快照同时读取 `flagLabels`，读取失败不发布猜测的标记。旗标与星标可同时显示；首页和浏览器共用的卡片预览只读显示这些状态。

目录由 `model/AppInterface.ts` 的 `study_more`、`study_marking`、`study_card_actions`、`study_flags` 拥有，页面映射实时标签、图标和业务回调。学习页拥有 `studyExpandedIds`，公共 `ActionMenuTree` 计算当前可见行，收起父级同时收起后代，禁用状态沿父级传播。右侧主菜单不因左侧高度变化而加大行距；`ActionMenuLayout` 用实测行高与面板高度计算左侧位置，仅移动左侧面板避让。返回/Escape 或点击外部先收起颜色，再关闭菜单。组标题不提交动作或恢复学习计时，选择当前可用叶子后先关闭菜单、建立动作阻塞状态，再恢复计时。组件及宿主重查当前树，隐藏、禁用、被颜色面板覆盖或过期的条目不能执行。

`AnchoredMenu` 拥有锚点、外部点击与整组菜单的限高滚动；主菜单使用 `MenuSurface`，左侧 `MenuBubble` 的轮廓与阴影共用同一几何，路径坐标显式由 vp 转 px。预览以空展开状态复用紧凑平面菜单；浏览多选使用相同树与左侧分组，选择及确认语义保留。行对齐和间距由 `MenuItem` 拥有。清除旗标传入 `selectionUsesAccent: false`，保留真实选中状态；表面使用 `menu_surface/menu_shadow` 明暗资源，边框委托 `SurfaceBorder`。JIDE 同时观察主菜单与实际可操作分组，包括动态旗标名称和选中态；被覆盖、收起、关闭或离页立即释放对应观察。直接回归见 `study-menu-actions.test.mjs`、`study-menu.test.mjs`、`browser-batch-menu.test.mjs`、`ai-agent-app-structure.test.mjs`；实际外观和滚动须设备验收。

标记写入经 StudySessionController 保护集合与同步，提交后针对原 cardId 回读并重渲染模板引用的 CardFlag／Tags。此路径不取下一张、不切换正反面、不清空拼写输入或选择题状态、不重启音频和计时起点；无 HTML 变化时不替换卡面。连续标记撤销保留当前卡；切卡、编辑、名称写入清除这段撤销提示，实际历史仍由 Core 拥有。弹层期间暂停自动推进并屏蔽学习键盘及手势，返回先关闭弹层；写入失败隐藏未知标记，再次点击标星入口先重读。

旗标颜色复用 `MenuSurface` 和 `FlagMenuChoices`；图标来自 `CARD_FLAGS`，自定义名称和当前选中态实时传入。只有选定具体颜色才调用原标记写入，后台与离页关闭菜单。浏览器批量旗标保留原有作用范围、确认与提交逻辑。

2026-10-04 重构保留两组向左自动展开布局，移除左右面板避让造成的右侧空白，统一轮廓密度换算和阴影；旗标颜色按当前要求覆盖右侧“更多”。系统 Back 由 `StudyKeyAdapter` 识别，快捷键拦截交还 NavDestination，避免吞掉弹层返回。相关菜单、JIDE 观察、公共展开箭头与布局回归通过，增量签名 HAP 编译通过。最终包在 1320×2856 模拟器实测两组向左、颜色覆盖右侧且左右锚点不动、反复点击箭头/文字展开收起、返回、分组收起、外部关闭与重新打开通过；旗标三角以自身中心旋转，展开前后绘制区位置相同。设备记录随签名 HAP 与截图保存到忽略的 `.local/menu-density-fix-20261004/`；真实平板未安装，宽屏、系统大字体、长英文和实际写入/同步未纳入本次设备验证。

实现与专项测试入口见 [旗标与标星记录](flags-marking-audit-2026-10-03.md)。主机测试及 HAP 构建不等于设备交互或两端网络同步验收。

## 集合级全局复习偏好（2026-10-02）

设置 → 复习 → 全局复习偏好提供日切时间、提前学习窗口、时间盒；设置 → 外观 → 学习显示提供剩余卡数和下次复习间隔。两种界面模式均可使用，分类与搜索由 `SettingsStructure.ts`、`SettingsNavigation.ts` 管理，中英标题从同一资源表取得。当前集合是保存范围；每日上限、学习步骤、保持率和自动前进仍归牌组选项或已有会话设置。

协议事实来自 `UPSTREAM.lock` 的 Anki 26.05（`e64c6b1`）和 `third_party/anki/proto/anki/config.proto`。本轮对照本机 `D:\Projects\AnkiDroid` 的 `preferences_reviewing.xml`、`preferences_appearance.xml`、`ReviewingSettingsFragment` 与 `CollectionPreferences`，按真实 Preferences 读写链路接入。

| 入口 | Core Preferences 字段 | 行为与范围 |
| --- | --- | --- |
| 新学习日开始时间 | `scheduling.rollover`（子消息 1，字段 2） | 0–23 时；日边界由 Core 处理 |
| 提前学习窗口 | `scheduling.learn_ahead_secs`（1，3） | 界面以 0–999 分钟编辑、协议保存整秒；0 关闭提前学习，队列仍由 Core 取得 |
| 时间盒提醒 | `reviewing.time_limit_secs`（2，5） | 同样以分钟编辑、保存整秒；0 关闭，成功评分后检查累计学习时间 |
| 显示剩余卡数 | `reviewing.show_remaining_due_counts`（2，3） | 学习顶栏新卡/学习/复习计数；隐藏不改变队列和调度 |
| 显示下次复习间隔 | `reviewing.show_intervals_on_buttons`（2，4） | 固定与悬浮评分按钮共用开关；仅隐藏文字，保留 Core 原始状态与间隔 |

读取链为 `ReviewPreferencesSettings` → `backend/ReviewPreferencesService` → `ReviewPreferencesStore` → `配置服务.getPreferences`（服务 9 / 方法 9）。保存队列在集合可用后重新读取原始 Preferences，只替换显式编辑的字段，再调用 `setPreferences`（9 / 10），最后回读确认。`PreferencesMessages.patchReviewPreferences` 保留未编辑字段、未知 wire 字段、编辑和备份子消息；缺失目标子消息时拒绝保存，避免 Core 的完整子消息 setter 清空其他偏好。未编辑的非整分钟值也原样保留。保存成功广播首页刷新并请求同步；已接受写入独立于组件寿命，保护持续至回读收尾，旧读取不更新离页组件，失败显示可重试错误并核对实际值。

每次取卡由 `AnkiStudySessionBackend.reviewPreferences` 读取同一 Core 偏好，`StudySessionController.loadNext` 将结果放入完整快照并检查代次；读取失败进入页面错误态，不用本机默认值继续学习。时间盒累计值和成功答题数由会话控制器拥有，使用页面现有 `startStudyTimers/stopStudyTimers` 生命周期，无新增周期计时器；不依赖牌组“显示答题计时器”开关。卡面学习期间累计，菜单、编辑、引导、手写、后台、切卡/刷新加载和异步评分期间暂停，恢复或切卡保留本段累计。撤销不扣除已发生的成功答题次数。

达到限额后，在成功评分、页面可安全展示时显示 `DialogFrame/DialogHeader`，普通卡、选择题反馈及最后一张卡均可继续或结束。继续开始新时间盒，并排除读提示时间、延长选择题反馈截止时刻；结束复用离页流程。后台隐藏弹层但保留控制器的待提醒，回到前台重新核对卡片后再展示；销毁释放计时，迟到写入不能复活提示。此处累计的是应用的有效学习时间，明确遵守现有暂停生命周期，不将后台停留视作学习时间。

直接回归：`review-preferences.test.mjs` 覆盖锁定字段号/RPC、保真局部写入、最新读取、串行保存与失败/离页；`study-review-preferences.test.mjs` 执行生产控制器与页面计时/提示方法，覆盖暂停恢复、零值、失败评分、两种按钮布局和中英文案；`study-session-controller.test.mjs` 覆盖偏好读取失败与迟到结果。Rust `native/rsharmony/tests/review_preferences.rs` 使用真实 Core 验证日切、提前学习队列、其他子消息及重开集合后的保存结果。

设备由用户操作，本轮不安装或重启。设备验收仍需检查：两种模式的设置分类、保存失败反馈、日切/提前窗口实际队列、菜单/编辑/后台回来后时间盒、选择题与最后一张卡提示、固定/悬浮布局的两个显示开关，以及深浅色、大字体和输入法外观。Node 与主机 Core 测试、HAP 编译不能替代这些交互与视觉验收。

数字设置的草稿与确认值分开处理：失败后的回读及“重试”重新加载只更新未编辑数字和真实显示开关，保留已编辑文本及 edited 标记；只有确认保存成功才清除数字草稿标记。写入可能成功但确认读取失败时仍显示未确认状态，不用回读覆盖输入。`review-preferences.test.mjs` 执行生产组件方法，覆盖写失败后重试、已接受写入但确认/恢复读取失败，以及离页后的迟到恢复。未编辑的 Core 原始秒数仍由已有协议入口保留。

## 学习手势与四象限引导

### 手写白板

学习「更多」的顺序只由 `model/AppInterface.ts` 的 `study_more` 目录拥有；编辑、JIDE 改卡、撤销操作相邻排列，学习说明固定在末项。页面真实菜单与应用内助手使用同一目录，入口可见性和禁用条件仍由既有上下文判定。`ai-agent-app-structure.test.mjs` 执行实际菜单与分发验证顺序。多个文件音频经 `CardAudioSession` 交给原生 `声音播放器` 按顺序串行播放，重播从头开始；题目面只播题目，答案面依据 `skipQuestionWhenReplayingAnswer` 决定是否先重播题目再播答案。与 AnkiDroid `CardMediaPlayer.replayAll` / `playAllAvTagsInternal` 的多文件和两面重播语义一致；现有 `card-audio-session.test.mjs` 覆盖队列、两面顺序、取消和完成等待。菜单重排不改音频规则。

学习页通过“更多 → 手写”打开白板覆盖层。华为 Pen Kit 可用时挂载完整 `HandwriteComponent`，包含钢笔、圆珠笔、铅笔、马克笔、荧光笔、马赛克笔、橡皮擦、套索及激光笔，不隐藏官方工具；笔迹编辑、一笔成形和报点预测由官方管理。接口以本机 SDK 的 `@hms.stylus.HandwriteComponent.d.ets` 与[官方接入说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/pen-suite)为准，最低 API 21 使用已有基础组件、默认钢笔与画布比例，不依赖后续版本新增可选字段。

`components/StudyPenCanvas.ets` 每次挂载独占一个 `HandwriteController`，只能由 `StudyPenCanvasHost.ets` 动态导入，不能静态进入首页/学习页的启动依赖图。宿主通过 NodeContainer / BuilderNode 挂载全局 WrappedBuilder，参数共用 `StudyPenCanvasParameters.ts`，换题和退出主动 dispose；释放后的异步加载不创建节点。`backend/StudyPenKitAvailability.ets` 同时检查 `SystemCapability.Stylus.Handwrite` 与系统 HSP 的沙箱映射（打包 Penkit.hsp、解包 ets/modules.abc）。此前崩溃日志表明报告 SysCap 但缺包时直接导入会触发系统加载器 SIGABRT，无法用 JS catch 恢复。因此模块缺失或不可访问时直接使用原版白板，不进入可选模块，也不显示不可用空白页；不安装或复制 SDK 的预览 HSP。路径或权限拒绝属于保守回退，不能据此宣称设备永久不支持套件。

`components/学习手写白板层.ets` 拥有引擎选择、官方初始化代次、15 秒初始化超时与原版 `StudyWhiteboard` 会话。官方加载、构建失败或超时自动释放节点并切到 `StudyLocalWhiteboard.ets`，当前学习会话保持原版，不在下一题反复重试套件。原版沿用已有透明 Canvas、画笔/颜色/笔宽、橡皮宽度、仅手写笔、撤销、重做和清空；纯模型 `model/StudyWhiteboard.ts` 管理归一化笔迹、有界历史与多触点隔离，组件管理绘制和工具设置。

学习页首次打开后保持宿主挂载，收起使用 `Visibility.None`；重开、翻面和同卡内容刷新保留画布。原版收起取消未完成的一笔和工具设置，不调用销毁生命周期，重开可继续书写。下一题提交后发送 resetTick，即使 cardId 相同也清空；原版由子组件重置笔迹与历史，官方重建 Controller。完成或退出学习释放会话。旧代次及重复失败回调不影响新画布或覆盖原版观察，迟到初始化也不能重新启用失败的官方分支。

白板在学习页根 Stack 中覆盖卡片，不再把卡片和画布按 1:2 压缩。原版透过 Canvas 保留题目阅读和原有卡片布局，工具栏、画布和底部答案条维持原版位置；官方使用完整覆盖画布，收起即可查看卡片。白板顶部条拥有顶部安全区，底部学习答案条拥有操作区和底部安全区；官方工具栏内部布局归 Pen Kit。手写期间暂停自动前进/时间盒并屏蔽卡片手势，后台或评分中禁止输入。普通卡复用显示答案和评分入口，选择题先收起白板。返回或 Escape 先关闭原版工具设置，再收起；原版 Ctrl+Z/Y 执行白板撤销/重做，官方分支传递相应按键，均不能触发卡片撤销或评分。

`AppInterface.WHITEBOARD_INTERFACE_ITEMS` 是两种 UI 与 JIDE 的共同目录。官方观察发布 `engine=huawei_pen_kit`、支持/初始化/失败/缩放与宿主按钮，`controlsComplete=false`，不伪造官方内部笔刷、颜色、笔宽、弹窗和撤销历史。原版观察发布 `engine=local_canvas`、笔刷选择、设置工具、历史可用性和是否有笔迹，`controlsComplete=true`，隐藏官方控件及未展开的工具设置。收起或后台撤掉观察。两种引擎均没有笔迹识别与 JIDE 内容工具，中英说明明确不能读取或判题，UI 可见性不授予助手绘画或评分权限。

回归入口 `tools/tests/study-whiteboard.test.mjs` 执行真实宿主方法、官方 Controller 拥有关系、自动回退、初始化超时、动态加载/释放、旧回调隔离、按键与 JIDE 结构，并遍历启动依赖图阻止 Pen Kit 提前加载。`study-whiteboard-local.test.mjs` 执行原版模型和真实组件方法，覆盖落笔、擦除、历史边界、取消、旋转重绘、收起重开、下一题清空、工具设置与观察。`study-lifecycle.test.mjs` 检查加载/翻面/评分时的清空时机。此前菜单检查依赖旧内联公式，已改为执行真实菜单几何；首页资源检查的正则曾将 `$r` 字符串误识别为硬编码，现区分资源调用和直接文本并覆盖正反例。按用户明确要求，本次回退修复仅执行代码测试与 HAP 构建，不安装或运行模拟器/设备；Node 检查和编译不能证明官方 HSP 的实际书写效果。

2026-10-05 回退修复的 `npm test` 全量 2503/2503 通过；全量检查发现的旧菜单断言、旧高级面板返回契约及测试依赖缺失已按现有代码同步，保留菜单边界、共享草稿、翻译与禁用行为断言。增量签名构建 `npm run build:app -- -SkipRust -ArtifactDirectory D:\Projects\jidecards-penkit-2026-10-05\fallback-artifact` 通过，警告门禁 unexpected=0；原生输入未改，本次复用已校验的目标架构库。当前产物为该目录的 `entry-default-signed.hap`，未做任何安装或运行验收。

`ReviewControlsSettings.ets` 在两种界面模式都提供「快捷答题方式」单选：关闭、四象限点击答题、学习手势，默认关闭。`model/实验性功能存储.ets` 是偏好唯一入口，运行时仅广播 `studyQuickAnswerMode`，持久化 `study_quick_answer_mode` 并同步旧开关键。没有新模式时兼容旧值：仅开一种保持原选择，旧版双开优先保留四象限。串行落盘成功后才广播，失败恢复模式、兼容键和引导原值并显示错误。切换到四象限时重置本机已读标记，旧用户缺少标记也会收到引导。

`model/StudyGestures.ts` 在 Web 文档内识别输入并按当前状态映射：普通卡题目面双击显示答案，答案面左滑良好、右滑困难；四象限单击题目面显示答案，答案面左上忘记、右上困难、左下良好、右下简单。两种方式互斥，四象限单击立即响应；学习手势在 320ms 内识别双击，双击不评分；滑动后的合成点击、多指/取消、长按、文本选中、交互元素及已滚动的内容不产生评分。模板可在自定义交互区域添加 `data-jide-gesture="ignore"`。卡片与卡面代次随桥接事件传回，页面统一检查菜单、教学、编辑、白板、后台和评分占用。选择题保持提交后右滑继续；只读预览沿用独立语义。

学习页用 `isStudyGesturesEnabled()` / `isTapZonesEnabled()` 从同一模式读取开关，脚本注入、动作解析和分区引导共用这两个判断。2026-10-04 设备日志及生成代码确认，原来的组件 getter 被编译器遗漏，运行时返回 `undefined`，导致两种方式全部失效；普通 TypeScript 测试无法复现这一步，修复验收须包含 HAP 和 ArkWeb 实际触摸。

学习页在首次可用普通卡上显示 `StudyTapZonesGuide`，与卡片 Web 使用相同矩形，无额外分区边距；四格平分可用宽高，顶部/底部工具栏与系统安全区均不计入分区。引导覆盖层复用评分按钮的深浅四档背景色，独立色块使用 50% 透明度透出卡面，位置标签与确认操作保持不透明；暂停计时与输入，明确确认才保存已读，返回关闭不标已读，后台/离页不消耗提示机会。首次通用教学先显示，关闭后再显示分区教学。更多里的学习说明与设置帮助共用 `study_gestures_help`、`settings_tap_zones_hint`。

直接验证：`tools/tests/study-gestures.test.mjs` 覆盖生产事件脚本、动作策略、偏好失败/重启、代次和引导；`study-guide.test.mjs` 核对两种语言的实际说明组合。真实浏览器输入回归为 `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-study-gestures-browser.mjs`，环境见 [工具入口](../../tools/README.md)。`npm test -- study` 仅验证模型和接线；真实 ArkWeb 手势、横竖屏、大字体、两种工具栏及彩色覆盖层仍须设备验收。完整自定义映射、九宫格、多指和摇晃未实现。

## APKG 选择题

格式见 [选择题 APKG v1](../choice-apkg-v1.md)，制作流程见 [Agent 指南](../choice-authoring.md)。`JideChoice.ts` 负责源文件校验、版本标记、模板、精确集合判分和字段一致性；工具 `tools/choice-package.mjs` 复用它打包标准 APKG，应用不直接导入 JSON 或自定义后缀。`AnkiStudySessionBackend` 按字段名和 payload 版本识别题型，不依赖笔记类型显示名称，未知版本按普通卡处理。学习页接收 `StudySessionController` 的题型数据，2–10 个选项分左右两列；答对直接提交 Good，答错直接提交 Hard，不再次评分。“更多 → 自动前进”中的反馈停留时间属于本次学习会话，切题保留；提交后的右滑只切题，不重复写复习记录。回归入口是 `tools/tests/jide-choice.test.mjs` 和 `tools/tests/choice-package.test.mjs`。AnkiWeb 实际往返与真机交互须另行验收。

## 卡片文字显示

字段可视编辑与卡片模板是不同职责：编辑器保存 HTML；普通 `{{Back}}` 替换保留粗体、荧光及 `<br>`，`{{type:Back}}` 的拼写比较按锁定 Anki Core 去掉 HTML，未输入也显示纯文字期望答案。标准 BasicTyping 的背面只有 type 替换，不自动附加原字段；这不是富文本丢失，不能为迎合编辑器预览改写比较语义或迁移既有模板。需要两种显示时由用户模板同时声明 `{{Back}}` 与 `{{type:Back}}`。回归 `study-rich-answer.test.mjs` 固定这一差异；`test-card-colors-browser.mjs` 在真实浏览器验证普通、标准输入及明确保留原文的输入模板。参考 [Anki 字段替换与答案比对](https://docs.ankiweb.net/templates/fields.html#checking-your-answer)。

学习页沿用浏览、统计页的背景链路：`首页.ets` 在 Navigation 外持有唯一 `ThemeBackground`，学习页 NavDestination 透明；顶部条、卡片区外围及答案条订阅 `PAGE_SURFACE_KEY`（本页变量 `页面底色微染值`）。这个键在幻彩主题下是 `#00000000`，普通主题下才是微染底色，不能把它当作固定不透明色，也不能在卡片外边距或底部避让区写死 `surface_page`，否则主题背景只剩顶部可见。卡片本体由 ArkUI 圆角外壳和 `学习卡片HTML构建器.ts` 的 ArkWeb 文档组成，使用 `surface_card` 深浅表面；不要把选中态用的 `主色容器` 铺满正文。

HTML 构建器在模板 CSS 前同时提供默认字色与不透明卡片底色。模板显式设置的字色、底色和 `nightMode` 配色必须成对保留；不能在模板后用 `!important` 强制覆盖背景，否则标准 Anki 黑字白底模板会变成黑字深色底。学习与浏览预览共用此入口；未声明配色时仍使用应用深浅默认表面。CSS 顺序回归见 `tools/tests/card-template-style.test.mjs`，实际浏览器配色与对比度回归见 `tools/test-card-colors-browser.mjs`（Node 参数与 `PLAYWRIGHT_MODULE` 配置同 `tools/test-card-template-browser.mjs`）。

学习页注册现有 `CustomTransition` 协议，首页统一先隐藏退出页、再淡入进入页，并冻结/恢复根背景；不在学习页复制背景或用禁用转场掩盖问题。转场运行验证见 `tools/tests/iridescent-rendering.test.mjs`，背景接线见 `tools/tests/study-flow-contract.test.mjs`。设备验收须比较卡片四周、答案按钮四周与顶部背景是否连续，并检查进入、返回、翻面；Node 测试及 HAP 编译不能证明实际视觉效果。

外观与语言中的 `CardTextSizeControl` 调整本机文字缩放（50%–200%，默认 100%）；`CardTextSizeStore` 启动恢复偏好，学习页和卡片预览通过 ArkWeb `textZoomRatio` 共用该值，不改模板或同步数据。设置内显示百分比和滑块。


## 卡片只读预览

首页点击“预览”后，通过 `DeckPreviewScopeMenu` 的锚点 Popup 选择今日待学、今日到期、今日已学或全部卡片；手机在“更多”父菜单的“预览”行旁向左打开范围子弹窗，箭头指向“预览”；宽屏锚定预览按钮。范围包含子牌组。今日待学复用 Core 当日队列的额度、排序和同笔记隐藏规则，并补入已安排在今日稍后的学习步骤，每张卡只出现一次，不模拟后续评分。今日到期使用 Core `is:due`，包含学习提前量，不受每日额度截断；今日已学仅计 Core 今日复习日志中的实际评分并去重，手动改期不算学习；全部卡片包含暂停和隐藏卡片。今日按 Core 学习日切换时间定义，不按前端自然日计算。

取卡链路为 `DeckPreviewSession` → `DeckPreviewService` → 本地 RPC 1001/0 → `native/rsharmony/src/deck_preview.rs`。`tools/patches/anki-deck-preview.patch` 在 Core 集合锁内通过 SQLite backup 创建一致临时副本，所有搜索、选牌组、队列初始化和跨日取消隐藏都在副本中执行，关闭连接后清理。正式集合不关闭，不选择牌组、不重建队列、不写卡片/FSRS 字段、计数或复习日志、不触碰撤销状态。取卡结果固定顺序；页面退后台、返回或销毁后忽略迟到结果。现有预览页继续只查询渲染服务，编辑仍由明确的编辑入口执行。设计依据见 [独立集合快照预览](../decisions/2026-10-01-deck-preview-snapshot.md)。

`tools/tests/deck-preview-session.test.mjs` 验证范围、协议、菜单生命周期与迟到响应；`native/rsharmony/tests/deck_preview.rs` 使用真实 Core 文件集合比较卡片、笔记、复习日志、牌组计数、集合配置、正式队列和撤销状态，覆盖每日额度、子牌组、重复评分、暂停/隐藏、跨日和非法请求。全量预览需要临时副本空间；快照期间源集合锁短暂阻止并发写入，前台加载占用与预览弹层参与首页同步协调。HAP 构建与实际 Popup/ArkWeb 交互分别按 [验证说明](verification.md) 验收。

首页与浏览页共用 `components/browser/卡片预览页.ets`。正面仅剥除输入占位；背面通过 `StudyAnswerRenderer.renderPreviewAnswer` 复用学习页空输入的正确答案显示，不能直接剥掉 `[[type:...]]`，否则标准输入答案模板会丢失整个答案。普通卡不增加笔记读取；输入卡按真实字段名读取，`nc` 保留组合字符规则，填空按当前卡片 `templateIdx + 1` 提取。额外读取后的显示仍校验加载代次，预览不收集输入、不写评分或修改模板。`preview-runtime.test.mjs` 覆盖中文字段、普通输入、`nc`、多编号填空与迟到读取。

电脑端预览首次 Web 页面加载完成后主动请求一次焦点；后续翻面不重复抢焦点。左右键与横向滑动共用已有预览状态机：右键题目→答案→下一张题目；左键答案→题目→上一张题目，首尾不回绕。表单与可编辑正文保留自身按键行为，预览不写入学习评分。键盘提示必须明确先显示/收起答案再换卡，行为链由 `preview-runtime.test.mjs` 从真实 DOM 按键脚本到页面方法验证。

`model/PreviewInteraction.ts` 是牌组与浏览预览的滑动入口：Core 的 `image-occlusion-canvas` 只负责显示遮罩，允许从该画布开始左右滑动，左滑与右键相同、右滑与左键相同；点击仍保留模板行为。其他 Canvas、链接、表单、可编辑区域及 `data-jide-gesture="ignore"`（包括遮罩画布的父级）不触发预览操作。手势必须全程单指且未取消，纵向滚动、选中文本和多指缩放不切卡。`preview-runtime.test.mjs` 执行生产脚本→桥→预览页，覆盖同卡题目/答案、跨卡及代次更新；`test-image-occlusion-browser.mjs` 在真实 Edge 上从遮罩画布注入触摸输入，验证左右滑与取消，并保留原 Canvas 像素检查。构建与浏览器测试不能替代原问题牌组的 ArkWeb 触屏验收；设备由用户操作。

全屏预览作为覆盖层时，根 Stack 必须有不透明 `surface_page` 底色并拦截命中，内部自行绘制 `ThemeBackground`，背景与内容整体转场。`PAGE_SURFACE_KEY` 在幻彩主题下为透明，只能用于已具备独立背景的内容区；不能用它替代覆盖层底色，否则首页的添加卡片、开始学习等控件会透出。不要恢复半透明的点击关闭遮罩，退出使用预览自己的关闭入口。

预览页移除底部重播音频按钮，和学习页一样从右上角“更多”操作。AI 改卡经 `onEditWithAgent` 传当前卡片 ID；首页与浏览页都进入 AiCardPage 的 edit 模式，配置检查后再次核对预览目标，返回时恢复当前索引并重新加载卡面。未配置时打开 AI 设置，不自动请求模型，不使用浏览页的批量选择或新建模式。回归在 `preview-runtime`。

学习页的首次教学和手动“学习说明”共用 `StudyGuideDialog` 与 `study_guide_*` 分项资源，展开的键盘帮助仍使用 `glossary_shortcuts_help`。快捷键只描述 `StudyKeyAdapter` → `StudyInputPolicy` → 学习页实际处理的动作：Space/Enter、1–4、B、S、Delete、Ctrl+Z、Esc、R，明确普通闪卡与选择题限制。撤销菜单统一显示“撤销操作”。预览独立使用 `PreviewInteraction` 的左右方向键；电脑（deviceType 为 2in1/pc）显示“按左右方向键”，触屏设备保留滑动提示，不把学习评分键当作预览功能。

两页卡片外框共用 `model/CardViewportLayout.ts` 的窗口宽高策略，窗口尺寸变化和旋转会重新计算：竖屏最多 840vp；横屏按窗口宽度的 92% 放宽，下限受 840vp 和实际窗口约束，上限 1600vp。`components/common/CardViewport.ets` 在 `onMeasureSize` 中用本轮父级约束直接测量内容列，并在 `onPlaceChildren` 居中；首帧与旋转使用同一条路径，禁止先渲染默认 840vp 再由 `onAreaChange` 回写状态扩宽。该容器只用于有确定宽高的全屏区域，调用方不要添加内边距或边框。卡片高度使用剩余区域，字体不随外框拉伸，图片沿用 HTML 的等比约束。学习页与预览页统一使用已有的平面卡片样式，沿用牌组详情的圆角、surface_card 底色以及 应用尺寸.卡片边框 / border_subtle 浅边框，不添加外阴影或输入框式深色描边；只读预览不接入评分。牌组模板自身的正文 `max-width` 仍保留，调整外框不会改写导入的模板 CSS。验证见 `card-viewport-layout`、`preview-runtime` 与 `study-guide`。

学习与预览的本地 Web 媒体请求统一由 `utils/媒体响应助手.ets` 的 `interceptMediaRequest` 处理：GET/HEAD、单字节范围 206、不可满足范围 416，非法或多范围回退完整 200。整文件（含 `bytes=0-`）交 ArkWeb 文件描述符读取并关闭；局部范围异步读取，短读继续，提前 EOF 返回 500，响应就绪后才交付。所有页面不得再复制状态码/文件读取逻辑；原生 `[sound:]` 播放链与学习页焦点/快捷键行为保持原样。运行回归见 `tools/tests/media-response.test.mjs`，实际 ArkWeb 拖动仍需问题卡片真机验收。

`components/browser/卡片预览页.ets` 复用学习页的卡片渲染、离线公式、图片遮罩、文字缩放、音频焦点与 Sound/TTS 播放器，仅查询渲染服务，不调用调度器、不提交评分或学习日志。行为对齐 Anki 浏览页预览（`qt/aqt/browser/previewer.py`）：进入与切换卡片都从题目面开始，一次只加载一面（修改题目一侧用 `构建卡片HTML(...,'question')`、答案一侧用 `'answer'`；答案面自带模板的 `{{FrontSide}}`，所以不做两面拼接、不重复）；题目态点击卡片或“下一步”显示答案，答案态“下一步”才切下一张卡，答案态“上一步”回到题目；“上一步/下一步”在加载中或错误态直接切卡，保证坏卡可跳过。预览不收集输入，正面剥除拼写标记，背面填入正确答案。进入预览时固定 ID 顺序，浏览页字段保存后保留当前卡，首页编辑返回恢复位置。顶部条两个入口统一为 关闭 / N/N / 更多（更多菜单内是编辑与 Agent 改卡）。加载、Web文档回调和音频分别用代次丢弃旧工作，编辑/后台时停止声音，组件销毁时释放播放器；浏览页编辑返回仅恢复重播入口，不自动续播。首页自动同步等待预览结束。`model/PreviewInteraction.ts` 在 Web 文档内判定：点击卡片发送翻面意图、左右滑发送下一步/上一步（单指、横向位移≥48px 且占优、1.2s 内、起点不在链接/媒体/表单/画布上）、方向键发送同一组动作；Web 组件上不挂 ArkUI 手势（ArkWeb 先消费触摸，SwipeGesture 收不到）；扩展动作须保持只读边界。相关运行验证在 `tools/tests/preview-runtime.test.mjs`。


## 牌组选项保存范围

牌组选项与高级设置使用 `components/home/DeckOptionField.ets` 的“名称＋当前值＋›”入口，数值、步骤、枚举和普通布尔字段在单项弹窗中编辑，选中项仅用背景色表示，不显示勾号。高级设置首页的“同时修改共用设置的 N 个牌组”直接使用行内 Switch，帮助按钮打开既有说明面板；切换只更新 `options.applyToSharedDecks` 草稿，忙碌时禁用，最终仍由主面板保存。单项弹窗持有本地草稿，取消不写入表单；确认前由 `model/DeckOptionValidation.ets` 在独立候选表单上复用既有校验，避免无效输入或其他字段的编辑状态被覆盖。字段帮助位于弹窗标题栏。高级分类点击后只展示对应分类，返回或完成回到分类目录。回归入口 `tools/tests/deck-option-dialog.test.mjs`。

牌组选项默认仅修改当前牌组。`model/DeckConfigSave.ts` 复制完整 protobuf 配置后比较实际修改；共享预设或默认预设（ID 1）有修改时，通过 ID 0 交由 Anki 原子创建并仅绑定当前牌组，独立预设继续复用原 ID。未修改、仅改牌组限额或全局开关不创建副本；取消和保存失败不污染原预设。高级设置的“同时修改共用设置的 N 个牌组”仅在共享时出现，每次打开默认关闭；全局 FSRS、新卡忽略复习上限、父级限额与健康检查集中在“全局设置（所有牌组）”。父子牌组学习时的限额聚合保持 Anki 语义。未来调整保存范围在该模型集中处理；行为测试见 `deck-config-save.test.mjs`。


## 卡片模板脚本与样式

学习与预览的 Web 生命周期统一由 `utils/CardWebView.ets` → `model/CardWebSession.ts` → `model/CardReviewerRuntime.ts` 管理。页面只提供当前加载代次、HTML 和正反面；只有适配器调用 ArkWeb `loadData`。同一次卡片加载的正反面共用 document/window，翻面替换 `#qa`，依次重新执行模板脚本并等待外部脚本，保留模板自己的全局作答状态和同源 Web Storage。模板 CSS 和通过 CSS 字段嵌入的脚本也放在 `#qa`，按每面执行；jQuery、MathJax 和应用内置脚本只在文档首次加载。每面重新处理公式、遮罩、折叠字段及 onUpdateHook/onShownHook；预览的文档监听只安装一次，动作使用当前卡面版本。

新卡、撤销后重新取卡、编辑刷新及离页会使旧会话失效；新卡采用新文档，防止上一张卡的计时器、监听和全局变量串入下一张。这个隔离范围有意限定为“同卡翻面持久”，不承诺 Anki 桌面整个复习会话的全局变量寿命，也不清空作者的 localStorage/sessionStorage。持久化数据和调度仍归 Anki Core；模板小题得分不是调度评分。

滚动定位由 `CardReviewerRuntime` 统一处理：题目面回到顶部；学习页显示答案时，有 `id="answer"` 则定位到答案起点，没有则回到顶部，避免长答案被跳过。只读预览不请求答案定位，翻面保留当前滚动位置。`card-web-session.test.mjs` 执行生产脚本，覆盖首次加载与同卡翻面的滚动行为。

完成信号由 JS 桥带文档/卡面版本回传，不能把 `runJavaScript` 返回当作页面内异步脚本已执行完毕。首次加载未结束的翻面请求排队，连续更新串行处理最新一面；旧文档回调不能确认新卡，当前脚本资源失败进入页面错误态，不通过重新 loadData 隐式丢掉作答状态。资源超时为 15 秒。

切卡时的原生 Web 底色与加载占位由当前页面的 `cardSurfaceBackground` 拥有，沿用最近一次真实渲染完成的模板背景，不回退为浅色 `surface_card`。`CardReviewerRuntime` 在脚本、公式、布局及两次动画帧后读取实际 html/body 配色，使用 1px Canvas 合成透明度并回传不透明 RGB；`CardWebSession` 先检查文档/卡面版本，再校验颜色格式，旧回调不能改变新卡底色。首次卡片尚未取得颜色时使用原应用表面；背景图片和渐变保留在模板内，原生占位只跟随其基础背景色，不复制图片。

学习与预览都保留占位至渲染确认，以免新文档加载期间先露出默认 HTML 背景。学习等待期间阻止翻面、评分、手势与自动推进，确认后才开始当前面的音频和计时；预览阻止早期翻面，仍允许原有的慢卡/坏卡跳过。标记写入的同卡重渲染继续保留原计时与作答状态。参考 [Anki 官网的淡入及动态页面说明](https://docs.ankiweb.net/templates/styling.html#fading-and-scrolling)、[AnkiDroid 的防白闪 Web 底色](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/java/com/ichi2/anki/AbstractFlashcardViewer.kt) 和 HarmonyOS 官方 ArkWeb「优化跳转至新Web组件过程中的页面闪烁现象」；保持既有同卡翻面、跨卡新文档的脚本寿命边界。

对应回归在 `card-web-session.test.mjs`、`study-lifecycle.test.mjs` 与 `preview-runtime.test.mjs` 直接执行生产版本检查、渲染确认及页面等待行为；`test-card-flip-browser.mjs` 使用真实 CSS、Canvas、导航、模板脚本和公式验证深浅应用主题下的深色、透明及半透明卡片背景。它们不替代原牌组在 ArkWeb 上的连续切卡视觉验收；设备由用户操作。

2026-10-04 按用户要求使用既有 `ceshi` 配置重新签名，以 `install -r` 在 SLG-W50 平板覆盖安装成功；随后强制停止并启动 EntryAbility，系统报告启动成功及应用前台状态。Bundle Manager 核对版本为 2.9.10（2991），未卸载或清理数据。包、构建记录及安装记录保存于忽略的 `.local/card-flicker-fix-20261004/`；原牌组连续切卡的视觉效果仍待用户实机验收。

2026-10-04 上述回归、相关学习/预览/音频/计时/模板/教学检查及文档/架构/组件字段门禁通过；真实 Edge 的学习/预览 × 深浅主题场景通过。`npm run build:app` 更新双架构原生输入并产出签名 HAP，最后的快捷键修正通过 `npm run build:app -- -SkipRust` 增量重编译，警告门禁无新增项。等待渲染时 Escape 仍可返回；未执行设备安装或原牌组的真机视觉验收。

回归入口：`tools/tests/card-web-session.test.mjs` 验证队列、旧回调、错误恢复和适配器；`tools/test-card-flip-browser.mjs` 用真实导航执行生产 HTML、渲染会话与脚本，覆盖学习/预览、深浅色、完整/部分作答、反复翻面、切卡隔离、Storage、外部脚本顺序、公式、遮罩、折叠和预览监听。浏览器命令：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-card-flip-browser.mjs`，可用 `PLAYWRIGHT_MODULE` 指定 Playwright 模块路径，需安装 Edge。ArkWeb 桥及原问题牌组仍需真机验收；浏览器回归不证明任意第三方模板全部兼容。

学习、浏览预览和未保存模板预览共用 `model/学习卡片HTML构建器.ts`。默认配色与列表/代码对齐、笔记类型 CSS、应用布局/媒体兜底分别包在独立 style 中；不能重新合并，部分 Anki 牌组在 CSS 字段用闭合标签嵌入脚本。`utils/CardAssetResponse.ets`（原 MathAssetResponse）统一映射固定的内置 jQuery 3.7.1/MathJax rawfile；未知内置域请求返回 404，其他域沿原媒体/网络逻辑。jQuery 必须先于模板脚本同步加载。新增内置脚本需同时更新固定映射、许可与浏览器回归；不要修改导入笔记类型原文来规避渲染问题。外部作者脚本依赖与实际验证边界见 docs/FEATURE_STATUS.md。

卡片文字对齐采用 Anki/AnkiDroid 的模板语义：应用不在 `body`、`.card` 或 `#qa` 强制设置 `text-align`。本轮对照本机 `D:\Projects\AnkiDroid` 的 `AnkiDroid/src/main/assets/flashcard.css`、`card_template.html` 和 `cardviewer/AndroidCardRenderContext.kt`：默认 `li { text-align: start; }`、`pre { text-align: left; }` 放在模板 CSS 之前，模板同名规则可以覆盖。未声明对齐的正文使用浏览器的 `start`；标准 Anki 笔记类型自带 `.card { text-align: center; }`，仍按模板居中。`#typeans` 的拼写比较与折叠控件保留各自的局部对齐。卡片宽度由现有布局和模板负责，不额外对 `#qa` 添加固定阅读宽度。

`card-template-style.test.mjs` 防止应用恢复全卡对齐及默认规则顺序回退；`test-card-template-browser.mjs` 验证深浅色、两面、无样式、标准模板、body/class/container/字段/行内对齐、列表/代码覆盖和 RTL；`test-card-flip-browser.mjs` 验证学习与预览中反复翻面、切卡时对齐和覆盖规则重新生效。两项浏览器脚本使用上面的 Node 参数和 `PLAYWRIGHT_MODULE` 配置。实际 ArkWeb、平板/折叠屏/电脑宽度与原牌组仍需设备验收。


## 弹窗操作

学习说明的首次提示与“更多”重看共用 `components/StudyGuideDialog.ets`。组件只负责正文排版与快捷操作展开，组合 `DialogFrame/DialogHeader` 固定标题和“知道了”、限制宽高并滚动正文；评分四行直接引用学习按钮的 `study_again/hard/good/easy_background/text` 深浅色资源。评分解释、复习间隔、撤销、今日跳过/暂停、自动前进与选择题分别展示，键盘、手势、四象限的完整帮助仍引用设置的原有资源，默认收起。中英正文归 `study_guide_*` 的分项资源，不再拼接整段系统提示。

外壳独占卡片水平内边距与标题到正文的12vp间距；正文分组间20vp、评分行间8vp、行内12vp，文字可自然换行、行高随内容增长，宽窄布局与安全区继续由公共外壳管理。学习页拥有控制器、输入阻塞、计时与已读写入：仅明确确认才记录已读，返回或卡面失效关闭不记录，重复/迟到关闭不能影响新弹窗。`study-guide.test.mjs` 执行生产页面方法验证首次/手动入口、关闭/确认、打开失败、卡面失效和迟到回调，并核对实际中英资源与设置解释及评分色映射。主题、窄宽屏、大字体、正文滚动与展开外观仍需设备验收，Node/HAP 不替代实际视觉检查。

学习与预览的“更多”菜单共用 `components/common/CardActionMenu.ets`，定位和样式归 `AnchoredMenu`，内容限宽复用 `CardViewportLayout.cardViewportWidth`。学习页拥有菜单显示状态：打开时暂停普通计时和选择题自动推进；点击外部、返回或 Escape 收起后恢复，选中动作先建立编辑/引导/手写阻塞状态再检查恢复条件；后台、隐藏与销毁清除菜单。打开期间屏蔽学习快捷键。`study-menu.test.mjs` 执行真实菜单方法验证暂停、恢复、禁用动作和 Escape；实际布局须另做设备验收。

预览顶栏的“关闭”和“更多”均使用 `按下态按钮`，与学习及浏览顶栏共用文字居中、44vp高度和水平16vp内边距。顶栏 Row 负责垂直居中；CardViewport 负责窗口限宽与居中，顶栏和卡片各自只贡献一次左右12vp页面边距，菜单由 AnchoredMenu 使用同一边距对齐右缘。宽/窄布局仅改变公共顶部间距，状态栏安全区只由顶栏外层计入。预览和浏览不另写原生“更多”按钮几何；最终深浅色、大字体、横竖屏及安全区对齐需设备验收。

学习页更多菜单将“编辑”固定为第一项，“自动前进”置于“卡片操作”分组末项，即使时间为 0 也可进入。`components/StudyAutoAdvanceDialog.ets` 复用 JideCards 的 `surface_card`、`应用尺寸` 与 `DialogHeader`，此弹窗按用户指定将公共操作栏放在底部：左“返回”、右“确定”。主界面为设置名称、当前值和箭头；二级为带选中态的单选列表。二级返回（含系统返回）丢弃当前待选值并回主界面，二级确定更新弹窗草稿并回主界面；主界面确定才应用到会话，主界面返回丢弃整个草稿。不要用连续 `showActionMenu` 代替具有返回层级和确认语义的设置弹窗。

`model/StudyAutoAdvanceDraft.ts` 唯一拥有草稿、层级和待选值；`StudyTiming.ts` 中的 `StudyAutoAdvanceSettings` 拥有已应用的会话覆盖值。未修改项继续读取当前卡牌组默认值，不改写或同步牌组选项。普通卡两项时间都关闭时，开关仍可尝试点击，但保持关闭并通过 `showToastSafely` 显示与 AI 未配置入口同款悬浮提示，正文用 `text_primary`；主弹窗不常驻提示，底部操作栏使用 `DialogHeader.showDivider=false` 去掉最下横线。至少设置一项时间后才能开启；选择题只显示反馈停留时间，关闭表示手动继续。现有非预设时长也必须出现在单选列表并保持选中。弹窗全程暂停两类计时，关闭时恢复；页面代次变化主动关闭，迟到确认不可写入或恢复计时。

回归入口 `tools/tests/study-auto-advance-settings.test.mjs`：直接测试草稿返回/确认、取消不写入、已存在覆盖值、非预设时长、迟到回调及反馈倒计时；文案调用真实 `UiFeedback.resourceText`，使用中英资源文件验证具体秒数，禁止用字符串拼接替身宣称格式化通过。设备验收须检查主界面→二级→返回/确定→主界面、系统返回、底部按钮及深浅色；Node 测试和 HAP 构建不替代视觉验收。

自定义弹窗通过 `components/common/DialogHeader.ets` 将确认、保存、完成固定在标题栏右侧，取消或关闭放左侧；左右操作区等宽，标题相对弹窗整体居中。主操作为透明底色文字按钮，文字跟随 `颜色键.动作主色`，保留调用方的忙碌与校验守卫。媒体管理的操作按未使用媒体和回收站分区排列，禁用按钮保留位置与清晰的灰色文字。系统原生确认框沿用平台布局。

学习页右上角更多菜单提供“编辑”，进入 `pages/EditNotePage.ets` 独立页面，复用新增的标题栏与字段卡片。`model/NoteEditorSession.ts` 在编辑页拥有读取代次、草稿可见性和写入输入快照；`AnkiNoteUpdate` 在集合操作保护内导图和更新。学习页只冻结交互，并在 onShown 恢复，写入通知通过原有 cardContentChangedTick 消费。编辑期间屏蔽学习快捷键及评分；字段读取完成前不挂载空编辑器；取消保留当前卡面并排除编辑耗时，保存保留撤销记录并通过既有加载流程重新获取队首、调度状态与题面。

学习页从其他页面返回时通过 NavDestination 的隐藏/显示回调标记并消费内容刷新，不依赖编辑入口是否发送 AI 专用通知。刷新复用完整加载链更新正反面、模板、拼写元数据和音频；同卡恢复原正反面，失效卡按后端新队首展示。加载或编辑中保留待刷新标记，刷新过程中新增变更完成后再次消费；失败进入可见错误态，禁止把旧题面当作最新内容继续评分。

学习加载和拼写翻面共用请求代次：切卡、编辑、隐藏/后台与销毁立即使旧工作失效；卡片身份、调度状态、HTML准备完成后一起提交。ArkWeb未挂载时缓存当前文档，attach后再显示和启动音频。新增学习操作应复用invalidateCardWork/isCurrentRequest，不让异步回调直接覆盖新卡。

学习与预览共用model/CardAudioSession.ts，负责取消旧音频解析、串行原生播放/清理、销毁后禁止播放。声音与TTS由卡片渲染服务.extractAudioTags一次RPC取得，旧的分开提取入口已删除；音频失败保留卡面和重播恢复。`model/StudyTimerController.ts` 只拥有普通计时与自动推进判定，页面继续拥有卡片、音频、编辑/引导阻塞事实以及评分写入；不为计时再引入状态框架。两个页面各自保留学习调度与只读预览规则。新增媒体入口应复用该会话，不直接调用两套播放器。

未保存笔记与模板预览也复用 CardWebView、HTML 构建器、数学脚本/LaTeX 和媒体拦截。CardAudioSession 可接收文件路径解析器，草稿预览仅将其独占文件映射到 cache，已有媒体仍走 collection.media；学习和已存卡片预览沿用默认路径。Core 未提交渲染、Cloze 编号、临时文件责任与只读回归见[草稿预览](browser-stats.md#未保存笔记草稿预览2026-10-02)。


## 学习会话读写

`StudySessionController` 在每次读取等待后同时检查自身 disposal 与调用方请求代次；调用方遗漏生命周期判断也不能让旧读取继续渲染。完成信息读取同样受生命周期控制。

评分、撤销、笔记编辑、埋藏/暂停、删除和牌组恢复统一从会话入口提交。笔记身份/字段/标签在等待集合前复制，接受后的写入不会因离页撤回；后端完成才释放同步占用。`AnkiStudySessionBackend` 唯一映射到现有 Service，保持单卡删除、牌组级 unbury、笔记编辑保留撤销以及原始调度字节语义。删除确认还校验弹框时的卡片 ID 和请求代次。

`study-session-controller.test.mjs` 直接测试生命周期和输入；`study-autoplay-backend.test.mjs` 直接导入完整后端适配器，平台动态库替身遇到意外 RPC 会失败，不能用这些测试声称设备/NAPI 已通过。

媒体管理保留 AnkiDroid 式完整报告与连续滑动：没有上一页/下一页按钮、文件复选框或逐文件 ArkUI 行。`MediaMaintenanceSession` 拥有检查、清理、续读与原生快照令牌；面板只映射快照，滚动触底时追加下一个文本块，新的检查令牌也进入文本块 key，避免重查复用旧内容。已读块保留以支持向上滑动，前端内存随实际阅读量增长，不宣称恒定内存。

大响应边界：`proto/messages/MediaSnapshotMessages.ts` 对应 `native/rsharmony/src/media_snapshot.rs` 的应用扩展服务 1000；仍走三个既有 N-API 入口，不改变 Core 服务 41。原生端每个 backend 只持有一份检查快照，报告每次最多 16 KiB（优先按完整行、保证 UTF-8 边界），文件名每次最多 256 项。重查、关闭集合、关闭 backend 或显式 release 使旧令牌失效。移入回收站前重查引用，仅处理原快照中仍 unused 的文件，按 256 项调用原始 RPC；失败后旧令牌不可继续使用，需要重新检查。原生普通 RPC 的互斥仍保留，不能以性能优化为由并发访问集合。

`媒体服务.unusedFiles()` 为牌组删除差集按批读取文件名，避免顺带传输全报告与缺失笔记。完整 `检查媒体()` 仅保留为原始协议入口，UI 使用快照。Core 扫描/构造原始结果及原生快照仍为 O(集合规模)，当前优化限制跨桥与前端首次加载，不等于消除 Core 成本。

回归入口：`media-maintenance-session.test.mjs`（连续滚动、销毁、清理前同步检查）、`media-check.test.mjs`（原协议兼容）、Rust `media_snapshot::tests`（十万文件、UTF-8 完整性、有界输出、批量失败及真实 Core 检查/回收站）。真机仍需验证长报告上下滑动、重查后内容更新、清理期间离页及大集合内存峰值。

## 页面剩余职责边界

`StudyInputPolicy.ts` 将键盘事件映射为学习命令，`utils/StudyKeyAdapter.ets` 只映射 Kit 键码。编辑期间不触发学习操作；引导期间也清理松开的 Ctrl。`StudyAnswerRenderer.ts` 使用翻面时的字段/输入快照生成拼写答案，读取失败回退原答案，是否展示仍由学习会话代次决定。纯 HTML 构建器已使用 `.ts`，无需 ArkUI 即可直接测试。编辑生命周期共用 `NoteEditorSession.ts`，内部读取复用 `NoteEditorLoader.ts`；Web 控件装载、焦点和 UI 效果仍由页面负责，音频生命周期属于 `CardAudioSession`，普通计时资源属于 `StudyTimerController`，时长与动作计算仍复用 `StudyTiming`。


学习编辑的图片准备通过 `StudySessionController.saveNote` 的 prepareFields 回调在 commitChange 内运行：先等待集合可用，再导入图片并更新原笔记；文本保存不调用媒体导入。离页后保护持续到整个保存结束，失败不广播写入成功。`study-session-controller.test.mjs` 覆盖集合等待、媒体/笔记失败与离页收尾；`study-note-editor.test.mjs` 覆盖返回请求确认后保留卡面/调度、不保存并排除编辑时间。HTML 工具和草稿入口见 [基础编辑](browser-stats.md#基础字段编辑与草稿保护)。

## 图片遮罩

笔记图片缩略图、媒体管理预览、新增遮罩源图和遮罩编辑画布的灰框共用 [ImageSurfaceStyle.ets](../../entry/src/main/ets/utils/ImageSurfaceStyle.ets)。`surface_image` / `border_image` 各自提供深浅色资源，与页面及卡片底色分离；普通预览通过 `NoteImagePreview` 消费，交互画布只复用外观。样式只设置底色、1vp 描边、12vp 圆角和裁切，不引入 padding/margin、宽高或手势，画布坐标与既有间距不变。牌组背景裁剪、学习 Web 模板图片和主题图属于不同语义，保留原容器。公共接线与几何不变验证在 `ui-shell-controls.test.mjs`；2026-10-03 用户要求亲自验收最终灰框辨识度、主题与图片编辑交互。

参考 `AnkiDroid/pages/ImageOcclusion.kt` 的 Core 页面编辑/保存边界和锁定 Anki 26.05 reviewer 的图形格式。`model/ImageOcclusionRendering.ts` 是学习、预览唯一遮罩渲染器：椭圆采用 rx/ry；angle 为万分之一圈，矩形、椭圆与文字绕左上角旋转，多边形按上游 reviewer 的最小点平移且不应用 angle；文字采用 fs/scale，保留多行。模板 CSS 的三组 shape color/border 生效，默认 inactive 填充允许 CSS 覆盖；异常尺寸跳过，不污染后续 Canvas 状态。大图保持比例并限制 4096² 像素。

`model/图片遮罩模型.ts` 唯一拥有解析、无损序列化、属性和撤销快照。未知图形/属性保留原文，已识别片段不改时逐字回写；修改只更新对应属性，其他 HTML 保留。`components/图片遮罩编辑器.ets` 只绘制与编辑归一化草稿，通过回调返回；固定显示 c1–c7 七个候选，对应红橙黄绿青蓝紫，直接选择后绘制，不再需要新建卡片组。只有实际绘制的考查组生成卡片，文字固定 c0；导入的更大编号和多卡引用继续显示、保留，不自动重排，初次编辑选择首个已有组。图形确认后仍由原保存入口提交。

“只遮当前考查组”和“遮住所有组”分别设置非文字遮罩的 oi=0/1，影响学习时其他组的遮盖；编辑画布继续展示全部彩色框。按钮下面即时说明当前模式、混合模式及去预览草稿查看学习效果的方法。没有遮罩时只选择后续绘制模式；重复选择不创建无效撤销记录，撤销/重做同步后续绘制模式。

编辑器顺序为编号、形状、遮盖模式及说明、图片、文字/多边形与选中图形操作、撤销/重做/清空及说明。标题固定，正文按内容占高且可滚动；编号使用可换行 Flex，不嵌套横向 Scroll。`model/ImageOcclusionEditorGeometry.ts` 负责纯视口尺寸、文字边界与移动限制，Canvas 测量仍归组件；图片按原比例和正文视口限制尺寸，无双区权重或固定大块留白。正文 Column 独占相邻内容的 8vp 间隔，图片自身无 padding/margin；标题→正文由根 Column 独占 12vp，根内边距沿用 `卡片内边距`，宿主继续拥有状态栏/导航安全区。宽窄、横屏和键盘缩小视口都用同一尺寸入口，不复制设备分支。Canvas 优先处理绘制，滚动正文从图片外操作。

多边形逐点点击显示圆形顶点，至少三个非共线点后完成；完成或点击图形后可拖动圆点改顶点，拖动内部移动整体，撤销草稿先移除最后一个点。文字使用公共 `FormTextAreaStyle` 的多行输入，实际字形测量同时决定选择框、命中和移动边界，末行下不添加整行高度，不用解析时的估算宽度限制拖动。多行行距与 reviewer 的字形度量一致，旋转后的外缘也参与移动限制；原 fs/scale 与未知属性保留。关闭按钮和系统返回共用放弃确认，取消手势回滚未完成移动和顶点编辑。

新增入口在添加页；现有笔记由 `NoteEditorLoader/NoteEditorSession` 传递 Core `imageOcclusionFields`，`浏览编辑区` 按字段位置读图，确认只替换遮罩草稿，最终仍由 `EditNotePage` → `AnkiNoteUpdate` 保存原笔记。笔记类型名与字段名可修改，不按名称判断编辑能力。只含文字的新增草稿不能保存为空考查卡片；现有编号不变时不重建卡片，删除编号后 Core 保留的空卡处理语义仍适用。

验证：`tools/tests/图片遮罩编辑器.test.mjs` 执行实际手势与操作方法及解析/序列化；`browser-editor-component.test.mjs` 执行现有笔记入口；`image-occlusion-rendering.test.mjs` 执行生产 HTML 中的脚本。`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-image-occlusion-browser.mjs` 用真实 Edge 检查像素及切换后的文字，支持 `PLAYWRIGHT_MODULE`。Rust `image_occlusion_editing.rs` 使用真实 Core 评分产生记录，再验证图形修改后身份、调度、复习日志和渲染属性。浏览器不替代 ArkUI/ArkWeb 设备验收；尚需验证长图、英文窄屏、键盘、旋转后命中、系统返回确认与同步往返，复习卡面的切换按钮保持已有隐藏状态。

编辑器全部按钮复用 `按下态按钮`，编号/形状/模式传入公共选中态和颜色标记；恢复撤销、取消多边形、缩放、旋转、删除等普通动作不再混用本地工具按钮。“恢复撤销”对应 Redo，恢复刚撤销的操作，始终占据同一位置，无可恢复操作时禁用。操作 Flex 独占横纵 8vp 间隔，按钮不叠加 margin，较长标签可换行；输入与操作分行避免英文窄屏挤压，放弃确认期间统一禁用。`图片遮罩编辑器.test.mjs` 执行真实手势、撤销/重做、模式与七色编号回归，并检查公共按钮复用、最终布局顺序与单一间距贡献。画布仍需用户在原问题设备上验证实际触屏、键盘、精细命中和最终外观；Node 和 HAP 编译不替代设备验收。

## 拼写答案输入外观

`pages/学习页.ets` 的 Type-in-the-Answer 输入使用与 `开始学习按钮` 相同的 `行动按钮高度`、`圆角_行动按钮` 和 `surface_card`，初始、聚焦及失焦均无描边；保留文字输入、光标和 Enter 翻面的原生行为，不附加按钮按压效果。外层透明，左右边距只由卡片区提供，不再叠加输入框外层的第二份水平 padding。

固定布局的外缘关系：卡片、输入框和显示答案按钮左右均距限宽内容区 `页面内边距_水平`；卡片→输入框的间距由输入区 top 唯一提供，输入框→显示答案由答案条 top 唯一提供，两者都用 `操作区顶部间距`（宽版 12vp、窄版 8vp）。导航安全区仍只影响底部；浮动布局保留原有底部避让。`ui-shell-contract.test.mjs` 校验宽/窄、无/有导航条时的实际贡献和无矩形白底，学习行为通过 `npm test -- study` 回归。完整构建不替代设备上的输入法、深浅色及最终视觉验收。

2026-10-03：全局复习偏好（global_review）仅实验版可见，简洁版目录/搜索/助手界面描述均隐藏该卡片。标题 i 复用设置根层说明浮层，解释集合范围、日切、提前学习和时间盒；复习显示（study_display）保持两种模式可见。偏好保存及 Core 运行行为不变。

## 自定义调度脚本兼容与缺失媒体

每卡 studyOptions 同时读取全局 card_state_customizer。StudySessionController 持有本次会话已确认脚本；非空且变化的脚本必须先确认，answer 在未确认时拒绝提交。学习页在卡面、音频和计时开始前显示只读脚本预览，允许退出或明确选择标准 Core 调度。此入口不执行 JavaScript、不修改配置，也不重编码 SchedulingStates 的原始 oneof；相同脚本在会话内不重复提示。JIDE 观察 custom_scheduling_warning 的实际执行边界与确认控件。

媒体快照保留 missing_media_notes，按 256 个 ID 分页（service 1000 method 5）并去重。受影响笔记通过完整 nid 查询交给浏览器；写入 method 6 在 registry lock 内重检并与确认快照取交集，单个 AddNoteTags 事务添加 missing-media。成功／失败后原快照失效，避免重复使用；离页停止查询发布，已接受打标仍完成并广播刷新／同步。报告与文件分页继续原语义，最终浏览查询内存仍是 O(受影响笔记数)。

打标提交成功后重检失败保留 taggedCount，单独提示重新检查；原快照已失效，不能把成功写入误报成可直接重试的失败。媒体面板的 JIDE 实时观察只发布当前渲染控件，并与各按钮实际启用条件一致。
