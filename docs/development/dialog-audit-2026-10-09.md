# 2026-10-09 弹窗逻辑检查

牌组长按入口于 2026-10-12 改为复用 DialogFrame 的居中弹窗；下方清单保留检查当日快照，当前入口与对齐范围见[首页](home.md#牌组上下文操作与-ankidroid-的对齐范围2026-10-15)。

范围：当前工作区 `entry/src/main/ets` 的原生 CustomDialog、DialogFrame、独立 DialogBackdrop、系统确认框/操作菜单、bindSheet、bindPopup，以及公共 AnchoredMenu / CardActionMenu 的调用方。文件清单由源码入口扫描生成，见末尾；入口次数不是独立产品弹窗数量，同一组件可能多处组合。

本轮检查打开、×/取消/完成、遮罩、系统返回、子层优先级、忙碌保护、重复事件、异步结果和销毁后的回调。代码审查与 Node 行为回归不代表已完成每个弹窗的设备触控验收。

## 已确认并修复的问题

| 问题 | 原因与修复 | 代码 / 回归 |
| --- | --- | --- |
| 旧“插入链接”回调能关闭下一次窗口，甚至应用旧选区 | 只检查文本快照，没有检查窗口身份；关闭及有参数提交都绑定 NativeDialogHost 的代次，同时检查编辑器前台、工具轮和源码模式 | `NoteFieldEditor.ets`、`NativeDialogHost.ets`；`note-rich-editor`、`native-dialog-host` |
| 旧牌组选项单项编辑回调能改值或重新打开帮助 | 关闭已隔离，但提交和帮助未隔离；两者也绑定原窗口 | `DeckOptionField.ets`；`ui-help-entry` |
| 自定义同步服务器旧保存/关闭回调能操作重开的表单 | 为 onSave/onClose 使用同一原生窗口 guard | `同步分组.ets`；`ui-common-state-dialog-lifecycle` |
| 七处纯读取期间所有出口被锁住 | 重新定位默认值、标志名称、浏览器笔记类型映射、笔记类型管理/编辑、空卡报告、撤销/重做状态把加载等同于写入；允许关闭只读加载，保留已接受写入/草稿确认的保护，读取结果在销毁后失效 | 相应 Dialog/Feature；`browser-flag-names`、`notetype-management`、`ui-dialog-layout`、`collection-history-session`、`ui-common-state-dialog-lifecycle` |
| 历史状态关闭后父级忙碌状态可能残留 | 子会话销毁不再发布 finally；组件消失时显式释放 onBusy，集合操作租约仍由会话在真实完成后释放 | `CollectionHistoryDialog.ets`；`ui-common-state-dialog-lifecycle` |
| 空卡删除后列表不刷新 | 删除保持“处理中”，随后调用的用户刷新入口被自身忙碌守卫挡住；拆分用户检查入口与删除完成后的内部报告刷新 | `空卡列表面板.ets`；`ui-common-state-dialog-lifecycle` |
| 空卡确认删除的对象能随选择变化、确认能重复或在离开后执行 | 确认时冻结卡片 IDs，结果只消费一次，销毁后不启动删除；已接受删除完成后广播刷新 | 同上 |
| 备份恢复、首页牌组删除确认可能重复或离开后执行 | 增加确认占用、一次性消费和宿主存活检查；恢复名称保持打开确认时的快照。已接受的持久化继续完成，结果不写销毁后的 UI | `备份管理面板.ets`、`HomeDeckDeletion.ets`；`local-backups-runtime`、`home-deletion-runtime` |
| 模板删除旧确认能删除同一索引上的下一模板，甚至最后一个模板 | 绑定模板对象身份；重查剩余数量；取消/确认只消费一次 | `笔记类型编辑器.ets`；`notetype-management` |
| 云端牌组退出确认能叠加，并与下载交错 | 退出确认和完成引导持有 exitPending；未决期间关闭、重试、下载和选择不能再进入；finally 释放，销毁后不关闭新宿主 | `CloudDeckFeature.ets`；`cloud-deck-feature` |
| 创建过滤牌组等到模板返回才读取输入，销毁后还回调父级 | 提交前冻结搜索/数量/排序/调度/名称；已接受写入继续并广播，旧 UI 不再回调。自定义学习同样在销毁后抑制提示/父级回调 | `创建过滤牌组面板.ets`、`自定义学习对话框.ets`；`filtered-deck-commands`、`custom-study-dialog`、`ui-common-state-dialog-lifecycle` |
| 浏览侧栏原生菜单与保存搜索删除确认的迟到事件仍可触发操作 | 菜单结果重查宿主存活与当前忙碌；保存搜索确认一次性消费、删除入口检查页面存活 | `浏览侧边栏.ets`、`浏览页.ets`；`browser-sidebar-decks`、`ui-common-state-dialog-lifecycle` |
| AI 普通/高风险二次确认在离开页面或草稿替换后仍可执行 | 基线读取后、每级确认及执行前重查页面、草稿 ID、风险、基线和操作/附件快照；取消/确认一次性消费，迟到结果不写新草稿 | `AI制卡页.ets`；`ui-common-state-dialog-lifecycle`、现有 Agent 执行器回归 |
| AI 草稿基线读取期间可连续进入准备流程并叠加确认 | 在第一次 await 前占用确认流程，贯穿高风险两级确认；取消或创建窗口失败恢复 pending，失败后可重新尝试 | `AI制卡页.ets`；`ui-common-state-dialog-lifecycle` |
| 兑换完成后写已销毁的 sheet 状态 | 权益持久化继续；active 失效后不再写解锁、提示、庆祝或 busy 等 UI 状态 | `RedemptionPanel.ets`；`theme-unlock-celebration`、`ui-common-state-dialog-lifecycle` |
| 同步后 FSRS 提示在首页销毁后仍能出现/写设置 | 读取结果和用户确认返回时重新检查首页存活，已接受写入的失败提示也受存活保护 | `首页.ets`；`fsrs-state` |
| 取消隐藏牌组与注销确认缺少宿主/账户校验 | 取消与确认只消费一次；执行时检查宿主，注销额外绑定打开确认时的鉴权对象，不能注销后来切换的账户 | `设置页.ets`、`同步分组.ets`；`ui-common-state-dialog-lifecycle` |
| 媒体、标签清理和历史删除取消后旧确认仍有效 | 媒体标记缺失/清空回收站、设置及浏览器清理标签、删除标签/历史会话统一一次性消费；媒体额外绑定报告快照并重查忙碌，首页布局建议也只消费一次 | `媒体管理面板.ets`、`设置面板.ets`、`浏览页.ets`、`AI制卡页.ets`、`首页.ets`；`ui-common-state-dialog-lifecycle` |
| 保存搜索/删除历史/牌组删除完成后仍操作已离开的 UI | 已接受持久化、同步请求和失效选择清理继续完成；旧页面不刷新、重置会话、写错误/忙碌或显示提示；牌组媒体清理完成后也重查可见性 | `浏览页.ets`、`AI制卡页.ets`、`首页.ets`、`HomeDeckDeletion.ets`、`AgentHistoryCoordinator.ts`；`ui-common-state-dialog-lifecycle`、`home-deletion-runtime`、`agent-history-coordinator` |

## 为什么多个弹窗反复出现相似问题

图片/音频 × 无效的直接原因是字段工厂编译后没有注入内容 controller：源码的可选调用 `this.controller?.close()` 没有报错，却没有关闭实际原生窗口。原生返回路径又把业务退出处理和原生 dismiss 分开，导致其他出口也可能失效。媒体编译产物检查保留真实的无参 `setController()`，不会由测试替身补注入来掩盖问题。

其他缺陷来自公共外壳与业务调用方之间未完整约束的生命周期：外壳只能发出关闭意图，实际窗口、忙碌、草稿及资源由不同拥有者维护；只读加载被当成写入锁，旧窗口回调没有身份，系统确认缺少取消失效/一次性消费，异步完成没有重查宿主。复用布局不会自动解决这些状态问题。只检查组件引用、源码形状或初次打开也不能验证完整的关闭/重开/销毁路径。

所有原生内容的关闭意图必须回到实际窗口拥有者，不能依赖 `this.controller?.close()`，也不能用仅丢引用的 `release()` 代替实际关窗。`NativeDialogHost` 负责窗口身份和释放；草稿、子层返回、持久化和忙碌仍由业务拥有。回归同时执行公共宿主与真实调用方，并覆盖关闭后重开、取消后迟到事件、销毁中的读取/写入以及确认时的对象快照。

## 检查保留的业务差异

- 图片/音频管理使用显式窗口关闭回调、会话代次及一次性清理；选取/录音/播放/提交状态由媒体会话保护。×、完成、遮罩和系统返回共用业务退出策略。
- 学习引导先退帮助/详情；自动前进二级返回先退回主级；父级帮助退出先关闭帮助，再关闭编辑窗口。没有把子层返回改成直接关闭全部。
- 牌组选项计算可失效并退出，接受后的保存继续保护；未保存的笔记、笔记类型和首页引导草稿保留原确认。
- 同步、集合恢复、媒体原生扫描/清理、导入及录音/绘图等资源操作仍按所属会话的租约和清理协议保护。允许关闭普通读取不等于中止已经开始的原生任务。
- 官方公告属于必须明确确认的引导，继续吞掉系统返回；普通欢迎/说明、许可证、帮助等按各自回调退出。
- 白板笔/橡皮设置和透明度气泡由绑定状态控制；系统关闭同步清除状态，笔设置关闭事件带工具身份，不能误清新打开的橡皮设置。兑换 sheet 经 onWillDismiss/回弹策略统一忙碌判断。
- 锚定菜单和卡片动作菜单的选择重新检查当前可见项目与 enabled；菜单滑动会话在组件消失时解绑。本文未将仍有独立布局的旧页面弹层写成全部已迁移公共外壳。

## 验证记录

Node 行为检查统一使用 `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test <测试文件>`。日志位于工作区外 `D:/Projects/jidecards-dialog-audit-*.log`，避免混入产品文件。

| 检查 | 最终结果 | 日志后缀 |
| --- | --- | --- |
| 20 个直接受影响的测试文件：公共窗口、链接/帮助、读取关闭、空卡、备份、云端牌组、自定义学习、历史、首页删除、兑换、侧栏、FSRS、同步及文档/ArkTS 结构 | 218 / 218 通过 | `final-targeted.log` |
| 8 个媒体及确认相关文件：`ui-common-state-dialog-lifecycle`、`note-media-management`、`note-audio`、`maintenance-ui-cognition`、`filtered-deck-commands`、`study-guide`、`study-auto-advance-settings`、`settings-about-runtime` | 103 / 103 通过；其中 17 项生命周期检查与上一组重叠 | `media-and-confirmations.log` |
| 编译产物检查工具自身的反例：`note-media-compiled`、`sync-server-compiled` | 3 / 3 通过；旧的无 controller 注入实现仍会失败 | `compiled-checker-tests.log` |
| 图片/音频真实编译产物 | 8 组场景、24 次窗口通过；覆盖空/已选择、完成/取消、重开、遮罩、忙碌及系统返回 | `compiled-media.log` |
| 同步服务器真实编译产物 | 5 个 Link 接线、7 次打开、保存失败/成功及销毁回调通过 | `compiled-sync.log` |
| 扩大筛选后的工作区失败复查：11 个文件 | 106 项中 100 通过、6 失败，见下表 | `workspace-failures.log` |
| `npm run build:app -- -SkipRust -ArtifactDirectory D:\Projects\jidecards-dialog-audit-2026-10-09` | 增量构建成功；复用已校验的 Rust 库；本次增量日志无新增未接受警告，不代表全量零警告 | `final-build.log` |

本轮直接相关检查去重后共 307 项通过。较早曾运行 ui/home/browser/sync/media/agent/study 筛选的并集（260 文件、2508 项），随后仅复查修改相关文件和失败文件，未重新执行完整并集，不宣称全部测试通过。影响计划在 `impact.log`；任务范围内 `git diff --check` 通过。

构建产物：`D:/Projects/jidecards-dialog-audit-2026-10-09/entry-default-signed.hap`，259,784,449 字节，SHA-256 `46f856061e2f76e25fc822bf356ca7bcce3b54f69236bcc48dffcc9f5571156a`。已核对 debug CompileArkTS 输出含本轮 AI 确认、窗口身份和媒体确认修改；媒体及同步工具执行该次构建对应缓存，不使用旧 common 路径遗留产物。日志保留输入文件 SHA-256。平台替身不验证 ArkUI 调度、布局、动画或字节码。

### 2026-10-09 共享工作区失败快照

以下是当日其他正在变化的绘图/首页菜单实现及对应测试的失败记录；当时未通过改写这些实现、削弱断言或添加空替身来消除失败。它们不代表当前失败清单；后续全仓复核见[2026-10-10 过期知识检查](stale-knowledge-audit-2026-10-10.md)。

| 测试 | 当时原因（历史） |
| --- | --- |
| `ai-agent-page-awareness`（1 项） | 新增绘图清理调用 `getHostContext()`，既有编辑器测试的 UIContext 替身未提供该接口 |
| `deck-preview-session`、`ui-shell-deck-actions`（2 项） | 方法提取测试仍初始化旧 `deckLevelMenuId`，当前页面读取 `deckMenuId`；测试中 undefined 被判断为有菜单，提前消费返回。实际组件有空串初值；尚未修改这些测试 |
| `common-boundary`（1 项） | 新公共菜单依赖 `utils/ActionIcons`，不符合当前公共目录依赖契约 |
| `motion-style-contract`（1 项） | 公共菜单实现已改为分组动效，原测试仍要求旧的整体 popupTransition 源码形状 |
| `ui-press-feedback`（1 项） | 新增 `NoteDrawingEditor` 的文字层点击 Column 缺少测试要求的公共按压 owner |

设备范围：本轮尚未安装、未做全弹窗触控/系统返回/横竖屏设备验收。

## 源码入口清单

<!-- dialog-inventory -->

扫描命中 87 个文件。按入口次数统计：原生工厂 15；原生内容 12；公共外壳 46；独立遮罩 17；系统确认 26；系统操作菜单 2；Sheet 1；Popup 3；内容覆盖 0；锚定菜单 6；卡片动作菜单 5。同一文件可同时拥有多种入口；公共外壳自身的遮罩也计入次数。

| 文件 | 入口种类及次数 |
| --- | --- |
| [components/AnkiWeb引导对话框.ets](../../entry/src/main/ets/components/AnkiWeb引导对话框.ets) | 独立遮罩 1 |
| [components/CollectionHistoryDialog.ets](../../entry/src/main/ets/components/CollectionHistoryDialog.ets) | 公共外壳 1 |
| [components/CustomSchedulingWarning.ets](../../entry/src/main/ets/components/CustomSchedulingWarning.ets) | 公共外壳 1 |
| [components/HomeIntroPanel.ets](../../entry/src/main/ets/components/HomeIntroPanel.ets) | 公共外壳 1 |
| [components/IridescentGiftDialog.ets](../../entry/src/main/ets/components/IridescentGiftDialog.ets) | 原生内容 1 |
| [components/IridescentGiftPanel.ets](../../entry/src/main/ets/components/IridescentGiftPanel.ets) | 公共外壳 1 |
| [components/StudyAutoAdvanceDialog.ets](../../entry/src/main/ets/components/StudyAutoAdvanceDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/StudyGuideDialog.ets](../../entry/src/main/ets/components/StudyGuideDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/StudyLocalWhiteboard.ets](../../entry/src/main/ets/components/StudyLocalWhiteboard.ets) | Popup 2 |
| [components/agent/AgentMemoryEditorDialog.ets](../../entry/src/main/ets/components/agent/AgentMemoryEditorDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/agent/AgentMemoryPanel.ets](../../entry/src/main/ets/components/agent/AgentMemoryPanel.ets) | 原生工厂 1；系统确认 1 |
| [components/browser/BrowserBatchConfirm.ets](../../entry/src/main/ets/components/browser/BrowserBatchConfirm.ets) | 公共外壳 1 |
| [components/browser/BrowserDeckDialog.ets](../../entry/src/main/ets/components/browser/BrowserDeckDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserDisplayDialog.ets](../../entry/src/main/ets/components/browser/BrowserDisplayDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserDueDialog.ets](../../entry/src/main/ets/components/browser/BrowserDueDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserFlagDialog.ets](../../entry/src/main/ets/components/browser/BrowserFlagDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserMoreMenu.ets](../../entry/src/main/ets/components/browser/BrowserMoreMenu.ets) | 卡片动作菜单 1 |
| [components/browser/BrowserNotetypeFeature.ets](../../entry/src/main/ets/components/browser/BrowserNotetypeFeature.ets) | 公共外壳 1 |
| [components/browser/BrowserRenameTagDialog.ets](../../entry/src/main/ets/components/browser/BrowserRenameTagDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserRepositionDialog.ets](../../entry/src/main/ets/components/browser/BrowserRepositionDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserResetDialog.ets](../../entry/src/main/ets/components/browser/BrowserResetDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserSavedSearchDialog.ets](../../entry/src/main/ets/components/browser/BrowserSavedSearchDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserSelectionActionsDialog.ets](../../entry/src/main/ets/components/browser/BrowserSelectionActionsDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserTagsDialog.ets](../../entry/src/main/ets/components/browser/BrowserTagsDialog.ets) | 公共外壳 1 |
| [components/browser/BrowserViewMenu.ets](../../entry/src/main/ets/components/browser/BrowserViewMenu.ets) | 锚定菜单 1 |
| [components/browser/FlagNamesDialog.ets](../../entry/src/main/ets/components/browser/FlagNamesDialog.ets) | 公共外壳 1 |
| [components/browser/卡片信息.ets](../../entry/src/main/ets/components/browser/卡片信息.ets) | 独立遮罩 1 |
| [components/browser/卡片预览页.ets](../../entry/src/main/ets/components/browser/卡片预览页.ets) | 卡片动作菜单 1 |
| [components/browser/批量操作栏.ets](../../entry/src/main/ets/components/browser/批量操作栏.ets) | 卡片动作菜单 1 |
| [components/browser/查找替换对话框.ets](../../entry/src/main/ets/components/browser/查找替换对话框.ets) | 独立遮罩 1 |
| [components/browser/浏览侧边栏.ets](../../entry/src/main/ets/components/browser/浏览侧边栏.ets) | 系统操作菜单 2 |
| [components/common/CardActionMenu.ets](../../entry/src/main/ets/components/common/CardActionMenu.ets) | 锚定菜单 1 |
| [components/common/DialogFrame.ets](../../entry/src/main/ets/components/common/DialogFrame.ets) | 独立遮罩 1 |
| [components/common/DirectorySelect.ets](../../entry/src/main/ets/components/common/DirectorySelect.ets) | 原生工厂 1 |
| [components/common/DirectorySelectDialog.ets](../../entry/src/main/ets/components/common/DirectorySelectDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/common/NoteDraftPreview.ets](../../entry/src/main/ets/components/common/NoteDraftPreview.ets) | 公共外壳 1 |
| [components/common/NoteDuplicateDialog.ets](../../entry/src/main/ets/components/common/NoteDuplicateDialog.ets) | 公共外壳 1 |
| [components/common/NoteFieldEditor.ets](../../entry/src/main/ets/components/common/NoteFieldEditor.ets) | 原生工厂 3 |
| [components/common/NoteLinkDialog.ets](../../entry/src/main/ets/components/common/NoteLinkDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/editor/NoteDrawingEditor.ets](../../entry/src/main/ets/components/editor/NoteDrawingEditor.ets) | 公共外壳 1 |
| [components/editor/NoteEditorFormatDialog.ets](../../entry/src/main/ets/components/editor/NoteEditorFormatDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/editor/NoteFieldCard.ets](../../entry/src/main/ets/components/editor/NoteFieldCard.ets) | 原生工厂 1 |
| [components/editor/NoteMediaDialog.ets](../../entry/src/main/ets/components/editor/NoteMediaDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/home/CloudDeckFeature.ets](../../entry/src/main/ets/components/home/CloudDeckFeature.ets) | 系统确认 1 |
| [components/home/DeckOptionField.ets](../../entry/src/main/ets/components/home/DeckOptionField.ets) | 原生工厂 2；原生内容 1；公共外壳 1 |
| [components/home/DeckOptionsFeature.ets](../../entry/src/main/ets/components/home/DeckOptionsFeature.ets) | 公共外壳 1 |
| [components/home/DeckRenameFeature.ets](../../entry/src/main/ets/components/home/DeckRenameFeature.ets) | 公共外壳 1 |
| [components/home/DeckReparentFeature.ets](../../entry/src/main/ets/components/home/DeckReparentFeature.ets) | 公共外壳 1 |
| [components/home/HomeDeckDeletion.ets](../../entry/src/main/ets/components/home/HomeDeckDeletion.ets) | 系统确认 2 |
| [components/home/HomeDeckDetails.ets](../../entry/src/main/ets/components/home/HomeDeckDetails.ets) | 锚定菜单 1 |
| [components/home/HomeDeckRowMenu.ets](../../entry/src/main/ets/components/home/HomeDeckRowMenu.ets) | 卡片动作菜单 1 |
| [components/home/HomeDeckSearchDialog.ets](../../entry/src/main/ets/components/home/HomeDeckSearchDialog.ets) | 公共外壳 1 |
| [components/home/创建过滤牌组面板.ets](../../entry/src/main/ets/components/home/创建过滤牌组面板.ets) | 独立遮罩 1 |
| [components/home/自定义学习对话框.ets](../../entry/src/main/ets/components/home/自定义学习对话框.ets) | 独立遮罩 1 |
| [components/settings/AboutActionDialog.ets](../../entry/src/main/ets/components/settings/AboutActionDialog.ets) | 原生内容 1；公共外壳 1 |
| [components/settings/AboutSettings.ets](../../entry/src/main/ets/components/settings/AboutSettings.ets) | 原生工厂 1 |
| [components/settings/NotetypeTemplatePreview.ets](../../entry/src/main/ets/components/settings/NotetypeTemplatePreview.ets) | 公共外壳 1 |
| [components/settings/RedemptionPanel.ets](../../entry/src/main/ets/components/settings/RedemptionPanel.ets) | 原生工厂 1；Sheet 1 |
| [components/settings/同步分组.ets](../../entry/src/main/ets/components/settings/同步分组.ets) | 原生工厂 1；原生内容 1；公共外壳 1；系统确认 2 |
| [components/settings/备份管理面板.ets](../../entry/src/main/ets/components/settings/备份管理面板.ets) | 公共外壳 1；系统确认 1 |
| [components/settings/外观分组.ets](../../entry/src/main/ets/components/settings/外观分组.ets) | 原生工厂 1 |
| [components/settings/媒体管理面板.ets](../../entry/src/main/ets/components/settings/媒体管理面板.ets) | 独立遮罩 1；系统确认 2 |
| [components/settings/查找重复对话框.ets](../../entry/src/main/ets/components/settings/查找重复对话框.ets) | 公共外壳 1 |
| [components/settings/模式切换菜单.ets](../../entry/src/main/ets/components/settings/模式切换菜单.ets) | 锚定菜单 1 |
| [components/settings/空卡列表面板.ets](../../entry/src/main/ets/components/settings/空卡列表面板.ets) | 独立遮罩 1；系统确认 1 |
| [components/settings/笔记类型管理面板.ets](../../entry/src/main/ets/components/settings/笔记类型管理面板.ets) | 公共外壳 2；系统确认 1 |
| [components/settings/笔记类型编辑器.ets](../../entry/src/main/ets/components/settings/笔记类型编辑器.ets) | 公共外壳 1；系统确认 2 |
| [components/云端牌组弹窗.ets](../../entry/src/main/ets/components/云端牌组弹窗.ets) | 独立遮罩 1 |
| [components/创建牌组面板.ets](../../entry/src/main/ets/components/创建牌组面板.ets) | 公共外壳 1 |
| [components/同步面板.ets](../../entry/src/main/ets/components/同步面板.ets) | 独立遮罩 1 |
| [components/字段帮助面板.ets](../../entry/src/main/ets/components/字段帮助面板.ets) | 原生内容 1；公共外壳 1 |
| [components/学习手写白板层.ets](../../entry/src/main/ets/components/学习手写白板层.ets) | Popup 1 |
| [components/官方公告弹窗.ets](../../entry/src/main/ets/components/官方公告弹窗.ets) | 独立遮罩 1 |
| [components/提醒编辑面板.ets](../../entry/src/main/ets/components/提醒编辑面板.ets) | 独立遮罩 1 |
| [components/数据迁移面板.ets](../../entry/src/main/ets/components/数据迁移面板.ets) | 原生工厂 1；公共外壳 1 |
| [components/欢迎弹窗.ets](../../entry/src/main/ets/components/欢迎弹窗.ets) | 独立遮罩 1 |
| [components/添加笔记面板.ets](../../entry/src/main/ets/components/添加笔记面板.ets) | 独立遮罩 1 |
| [components/牌组定制面板.ets](../../entry/src/main/ets/components/牌组定制面板.ets) | 独立遮罩 1 |
| [components/牌组选项面板.ets](../../entry/src/main/ets/components/牌组选项面板.ets) | 独立遮罩 1 |
| [components/许可证面板.ets](../../entry/src/main/ets/components/许可证面板.ets) | 公共外壳 1 |
| [components/设置面板.ets](../../entry/src/main/ets/components/设置面板.ets) | 系统确认 1 |
| [pages/AI制卡页.ets](../../entry/src/main/ets/pages/AI制卡页.ets) | 公共外壳 1；系统确认 4 |
| [pages/学习页.ets](../../entry/src/main/ets/pages/学习页.ets) | 原生工厂 2；公共外壳 1；系统确认 1；卡片动作菜单 1 |
| [pages/浏览页.ets](../../entry/src/main/ets/pages/浏览页.ets) | 系统确认 3 |
| [pages/设置页.ets](../../entry/src/main/ets/pages/设置页.ets) | 系统确认 1 |
| [pages/首页.ets](../../entry/src/main/ets/pages/首页.ets) | 独立遮罩 1；系统确认 2；锚定菜单 2 |
| [utils/ConfirmNoteDiscard.ets](../../entry/src/main/ets/utils/ConfirmNoteDiscard.ets) | 系统确认 1 |
