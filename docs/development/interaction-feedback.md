# 交互恢复与局部动效

[返回任务索引](../../PROJECT_CONTEXT.md)

这是学习恢复、结果提示、按钮状态、浏览连续性、键盘弹层、菜单划选、状态文字和编辑轮盘的当前责任说明。业务写入沿原有会话与 Core；公共组件只绘制反馈和路由短期指针。两种动效档位来自 `model/MotionStyle.ts` / `utils/AppMotion.ets`，均不增加应用翻卡动画。

## 八项实际进度

| 项目 | 已接入行为与唯一入口 | 验证进度 |
| --- | --- | --- |
| 1 学习失败原地恢复 | `StudySessionController` 保留待核对的原评分输入；`StudySessionBackend` 核对稳定 Core 历史步号、完整卡片及 reps。只有历史与卡片均未变才允许重送，单步历史及 reps 增一才视为已提交，冲突或探测失败继续阻止评分。`学习页.recoverStudy/retryStudy` 保留可见卡片、拼写和选择，暂停计时，只在用户重试后继续；未完成评分核对不能改取另一张卡。删除、撤销和恢复埋藏响应失败的重试只重新读取。 | 评分丢响应、未提交、探测失败、冲突与卡片保留直接回归已通过；完整 Node 回归通过。 |
| 2 操作结果与撤销提示条 | 学习埋藏/暂停、浏览批量操作使用 `ResultNotice`。宿主核对操作前后历史，只有新单步记录才显示撤销；提交调用既有 `CollectionHistoryBackend.apply(false, expected)`，Core 原子校验期望状态。结果六秒自动关闭，恢复错误持续保留，卸载取消计时。 | 新记录/无变化/多步、提示计时、原子撤销已有直接回归；完整 Node 回归通过。 |
| 3 按钮状态反馈 | `ActionStatus` 固定20vp绘制槽；`PrimaryActionButton`、`按下态按钮` 的可选 feedback 与 `IconActionButton` 共用。新增页两个保存按钮、编辑保存、首页同步与同步面板、JIDE 请求及制卡批次保存读取真实拥有者状态。同步冲突为 attention，失败为 failure，暂停/等待不显示成功。失败保留原草稿，重试仍沿原入口。 | 保存/同步/制卡既有会话回归与新状态回归完整 Node 回归通过。 |
| 4 列表连续性 | `BrowserSearchSession.search(..., retainResult)` 在刷新失败时保留分页会话，页面保留已展示列表并提供只读重试；成功刷新补回原已消费范围。`浏览行数据源` 按身份增删改，未变行不通知；`卡片表格` 使用稳定 key、局部 opacity 及 ArkUI `maintainVisibleContentPosition(true)` 保留可见区外增删时的位置。新查询/模式切换仍重建查询语义，空结果显示空态。 | 分页失败保留、局部通知和稳定 key 直接回归已通过；实际滚动布局待设备体验。 |
| 5 键盘与弹层衔接 | `EntryAbility` 的主窗口拥有键盘上缘；`WindowSafeLayout.keyboardViewportHeight` 根据宿主窗口原点裁切，已缩小的窗口不再重复减键盘高度。`DialogFrame/AnchoredMenu` 使用公共状态。`NoteFieldEditor.focusInput` 带代次/前台/禁用守卫恢复源模式和可视模式选区或光标，轮盘手势在键盘变化、隐藏、销毁时取消复位。 | 坐标裁切与选区、光标、旧焦点回调直接回归已通过；软键盘实际事件时序待设备体验。 |
| 6 普通动作菜单单指划选 | `MenuHoldController/MenuHoldGesture` 与 `MenuSlideSession` 共享生命周期；宿主显式向外壳和条目传递同一作用域，不依赖 Builder 边界的隐式注入，按住200ms展开，滑过实时可用的实测目标高亮，松手选择；移出/取消/第二指/卸载均不执行。子菜单停留220ms只展开，松手叶项才执行；菜单滚动边缘只滚动。首页更多/创建、牌组预览窄宽入口、学习/浏览/预览更多、浏览模式/筛选/排序、设置模式均接入。删除仍先确认；牌组排序拖动和编辑轮盘不采用滑动执行语义。 | 点击保留、补发点击抑制、取消、禁用、层级、滚动目标与实际行 Builder 传递直接回归通过。竖屏模拟器确认首页更多按住划到设置松手进入、移出松手关闭不执行；其余菜单及真机完整时序待体验。 |
| 7 数字与文字变化 | `ChangingText` 接入学习剩余、浏览选中与结果数量；120/180ms 局部淡入淡出，灵动档附4vp位移。最大实测宽度保留到卸载；快速更新完成当前过渡后合并到最新值，旧完成回调不会更新卸载组件。 | 快速更新与卸载直接回归已通过；大字体/长翻译实际布局待设备体验。 |
| 8 半圆编辑轮盘 | `NoteEditorWheel` 使用既有档位开合/移动/吸附；旋转及纵向移动取消回到开始位置，滚轮取消恢复开始位置；多指、键盘变化、后台与隐藏统一释放。按压描边与持续格式选中独立；粗体/斜体/下划线/荧光保持多选，旋转/松手只定位，点击与长按沿原工具入口。 | 轮盘22项直接行为回归含取消复位已通过；触摸、切边和软键盘体验待设备验收。 |

## 一手源码参考

2026-10-08 实际读取下列 Telegram 源码，采用其交互机制再用 ArkUI 实现；未搬运 Android/iOS 平台实现：

| Telegram 来源 | 本项目采用的机制 |
| --- | --- |
| [ActionBarMenuItem.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/ActionBar/ActionBarMenuItem.java)、[ActionBarPopupWindow.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/ActionBar/ActionBarPopupWindow.java) | 按住入口、实时命中可用项、取消不执行、子菜单和弹层生命周期 |
| [BottomSheet.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/ActionBar/BottomSheet.java)、[SizeNotifierFrameLayout.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/SizeNotifierFrameLayout.java) | 键盘由窗口拥有，弹层按当前可见高度适配，关闭取消旧交互 |
| [Bulletin.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/Bulletin.java) | 短结果、附近动作、有效期与展示生命周期；Core 撤销安全由本项目原入口负责 |
| [MediaActionDrawable.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/MediaActionDrawable.java)、[RadialProgress2.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/RadialProgress2.java) | 同一几何槽承接实际处理中与结果状态 |
| [RecyclerItemsEnterAnimator.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/RecyclerItemsEnterAnimator.java)、[RecyclerListView.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/RecyclerListView.java) | 稳定列表身份、只反馈变化项、取消旧交互 |
| [AnimatedTextView.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/AnimatedTextView.java) | 短状态局部过渡和快速更新合并，保持布局 |
| [ContainedViewLayoutTransition.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/Display/Source/ContainedViewLayoutTransition.swift) | 显示状态连续过渡，取消后由实际状态收敛 |

## JIDE 与维护边界

`model/InteractionFeedback.ts` 是反馈动作、划选时间与恢复边界的共同声明；`AgentAppStructure` 直接返回这份支持说明并纳入 revision。`学习页/浏览页` 发布真实 `study_feedback/browser_feedback` 的消息、忙碌及 enabled，轮盘另发布 pressed_tool、rotating、moving、edge_contact。保存与 JIDE 请求发布实际 feedback 值。

反馈按钮是宿主 UI 回调，`writeTool` 留空，不宣称 JIDE 能模拟手势或直接重送评分。应用助手既有领域读取、提案、确认和写入规则继续由原工具拥有；语义观察不授予操作许可。修改入口要一起维护共同声明、真实观察与相关领域能力，不能只修改文字描述。

直接回归入口：`interaction-recovery.test.mjs`、`interaction-feedback.test.mjs`、`menu-slide.test.mjs`、`browser-search-pagination.test.mjs`、`note-editor-wheel.test.mjs`；领域回归按 [分级验证](verification.md) 选择。Node 执行真实非渲染方法，不能证明 ArkUI 测量、系统键盘/指针时序和真机观感。

## 本次验收记录

2026-10-08 八项实现与共同声明已接入，完整 Node 回归2968项通过；增量签名 HAP通过，unexpected warnings=0，包名与签名身份校验通过。产物为仓库旁 `jidecards-interaction-feedback-2026-10-08/entry-default-signed.hap`。在既有 `127.0.0.1:5555` 模拟器只使用覆盖安装，确认普通菜单点击、首页更多按住划到设置后松手进入、移出松手关闭不执行，以及外观页“动效风格”下的说明小字已去掉。设备检查发现 Builder 跨界的隐式作用域注入未生效，已改为所有同类入口显式传递，并直接执行真实平面/嵌套行 Builder验证。最终版本不保留临时触摸诊断日志。

随后统一设置选择行：颜色主题改用 `FormSelectRow` 的预览插槽，同级表单间距改为 `FormRowLayout.rowGap` 的8vp；控件高40vp、标签与控件间隔12vp、单项说明/错误间隔4vp。此次修改的 UI 447项与 JIDE 603项回归通过，重新签名构建通过且 unexpected warnings=0，并覆盖安装同一设备。竖屏页面实际布局中四个选择框均高140px；主题模式与颜色主题、动效风格与牌组样式的相邻边界均相隔28px，右边界均为1219px，对应当前设备的40vp高度和8vp间距。带说明的动态背景开关仍按内容自然撑高；宽屏、大字体与安全区开关组合未逐一完成设备验收。公共规则见[外观：公共表单控件](appearance.md#公共表单控件)。

学习失网/评分丢响应与实际 Core事务、软键盘焦点时序、滚动连续性、嵌套菜单/边缘滚动/删除确认、轮盘触摸和长翻译布局仍未完成完整设备验收；实际账号联网同步及 AI 请求未执行。Node直接回归与签名构建不能代替上述体验。共享工作树原有改动保留，未卸载、清数据或更换包名/签名身份。

## 界面转场统一验收

2026-10-08 进一步查全页面与弹窗效果入口：设置目录/分组和手机牌组详情原先直接替换，设置主壳另给6个已有弹窗重复套了淡化。现由 `SurfaceTransition` 合成页面、覆盖预览、弹窗与蒙层效果，页面栈沿原完成/取消协议接入；9个目的地的真实注册回调直接验证前进与返回一致。设置首次直达分组不叠加外层转场，后续只在分组身份变化时触发；手机列表使用可见性切换保留挂载和滚动位置，宽屏常驻详情不当作页面导航。

14个旧弹窗和公共 `DialogFrame` 统一内嵌效果；13个原生 CustomDialog 宿主共用开合参数，由平台拥有窗口几何，内部公共外壳通过 nativeHost 禁用重复效果。5个原先长期持有的窗口改为每次打开时构造，直接回归验证切换档位后取到新时长。反馈、帮助、媒体、学习引导、自动前进、同步服务器的原确认/取消/忙碌与关闭责任不变。`InteractionFeedback` 的页面/弹窗支持说明直接进入 JIDE 结构和 revision，没有增加模拟动画或评分工具。

本次受影响检查为 UI 453项、首页424项、JIDE603项，以及原生弹窗调用方107项直接回归，均通过；不是重新执行全部 Node 测试。最终增量签名 HAP通过，accepted warnings=162、unexpected=0，身份校验通过；产物为仓库旁 `jidecards-surface-motion-2026-10-08/entry-default-signed.hap`，对同一模拟器只做覆盖安装。竖屏、灵动档位实际捕捉到设置分组进入/返回、手机牌组详情进入/列表返回、原生“意见反馈”弹窗打开/系统返回关闭的中间淡化帧及最终状态。采样截图只证明效果发生，不用于声称时长或帧率达标；未执行反馈发送、复制群号、学习评分、账号同步或集合写入。

宽屏常驻侧栏、深色、大字体、软键盘与连续快速跨页仍未逐一完成完整设备验收；两档参数及取消/接管由直接回归覆盖，不能代替这些显示与事件时序。公开责任与差异见[外观规范](appearance.md#视觉与交互一致性)，新增同类界面应接入现有入口及 `motion-style-surfaces.test.mjs`。
