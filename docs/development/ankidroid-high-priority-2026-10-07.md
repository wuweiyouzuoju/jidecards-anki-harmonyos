# AnkiDroid 对照：高优先级改进验收（2026-10-07）

用户要求完成全部四项高优先级，并逐项通过 Computer Use 检查模拟器实际生效、视觉一致性与公共组件使用。当前实现入口见 [学习媒体](study-media.md)、[导入](import-data.md)、[首页](home.md)、[JIDE](agent.md) 和 [互通回归](core-interop.md)。保留当前工作树的编辑器、数学、网站等既有改动；只替换安装模拟器包，未卸载清数据。

## 自动验证

| 范围 | 实际结果与记录 |
| --- | --- |
| 全仓 Node/资源/架构/文档 | 最终题答音频分离修复后 `npm run verify -- repo`，2683项通过、0失败；`.local/high-frontside-repo.log`。 |
| 确认摘要与共用排序 | 随后局部可读性改进：筛选配置、JIDE 维护/牌组选项/FSRS 确认、语言刷新、公共控件/弹窗、ArkTS 字段、资源共81项通过，`.local/high-readable-filtered-tests.log`；架构/公共责任与文档17项通过，`.local/high-readable-boundaries.log`。相关原生和音频输入未变，复用上述验证。 |
| 筛选牌组真实 Core | `native/rsharmony/tests/filtered_deck.rs`：清空归还、重建、配置更新、撤销/重做、空搜索、拒绝普通牌组通过；`.local/high-filtered-core.log`。 |
| 完整原生主机 | 最终 `tools/build-native.ps1 -Target host-test`：fmt、clippy、83项真实 Core/桥接测试通过，`.local/high-final-native-83.log`。首次发现 FSRS 历史计数样例的裸 `did:` 在 Core SQL 中含内部 OR，未与后续状态条件相交；样例改为 `(did:1)` 并新增6张复习/6张新卡及牌组身份断言，保留原有6条计数断言。未改锁定 Core 或调度算法。 |
| 包与恢复 | `npm run test:interop` 通过，`tmp/core-interop/run-jSVlVR/report.json`；包含真实 Core 创建/评分、五种包往返、冲突、取消、恢复失败重试与完整性检查。 |
| 官方 AnkiWeb 集合 | `tmp/core-online/run-stkUzN/report.json`：真实登录，完整下载4117张已有卡；生产 Rust 后端上传唯一合成笔记，参考 Core 下载，修改字段/标签/旗标后双向增量同步，删除本轮数据，已有卡ID全部保留。媒体未启用。日志 `.local/high-online-collection.log`。 |
| 官方 AnkiWeb 集合与媒体 | `tmp/core-online/run-2Dc4jr/report.json`：复用此前已退出客户端的媒体缓存，两端集合仍全新；完整下载4117张已有卡与9501个已有媒体文件，合成 WAV 上传→参考 Core 下载字节核对、双向集合增量、同步删除本轮笔记/牌组/媒体全部通过，原卡ID保留。`.local/high-official-media-resumed.log`。入口 fmt/clippy 通过，`.local/high-online-cache-clippy.log`。 |
| 隔离 Core 服务器媒体 | `tmp/core-online/run-rzNqR1/report.json`：真实完整上传/下载、WAV字节、双向集合增量、合成笔记/媒体同步删除通过；`.local/high-local-sync-media.log`。 |
| 最终 HAP | 可读确认与公共筛选表单修复后 `npm run build:app -- -SkipRust` 成功，unexpected warnings=0；`.local/high-readable-filtered-hap.log`。只向 `127.0.0.1:5555` 替换安装并重开应用，`.local/high-readable-filtered-install.log`。此前音频分离包构建为 `.local/high-frontside-hap.log`。 |

初次官方整个媒体库下载在300秒超时（`tmp/core-online/run-ATHIt5`，`.local/high-online-sync.log`），发生在测试笔记创建前。不得将隔离服务器媒体结果描述成 AnkiWeb 媒体通过。

之后官方媒体续传实际完成并通过；上述官方证据来自独立在线入口，区别于隔离服务器测试。

## Computer Use 验收

| 改进 | 实际观察 | 公共实现 |
| --- | --- | --- |
| 卡面音频 | 隐藏开关保存后重新预览按钮消失，正文保留。最终学习页点击第二段仅播放 `audio-ui-q2.wav`，题面保持；点击第一段只播放30秒 `audio-ui-q1.wav`。中断开启时翻面在第12秒停止原播放并启动答案队列；关闭时翻面后原题面队列仍播放，等待结束后顺序续播。 | 共享 HTML 构建器、`CardAudioSession`、手势桥接；设置 `SettingsToggleRow`。 |
| 筛选牌组 | 系统表单创建仅含 `interop` 的6张卡，详情清空后0张，重建后6张，菜单正常收起与计数刷新。最终菜单去除会报 `deck not normal` 的普通牌组选项，维护行与既有操作外观一致。最终19:23创建表单11种排序全部正确显示，选“随机”后当前值更新；公共调度开关开启显示主题紫色，完整说明不与开关相挤，关闭表单未创建额外牌组。 | `FilteredDeckCommands`、`deckDetailsMoreItems`、列表公共菜单行和详情 `GlassSurface`；创建表单 `DialogHeader` / `FormSelectRow` / `SettingsToggleRow`。 |
| 导入定位 | 结果类别跳转浏览页显示对应7条笔记，返回保留结果批次。最终版导入音频包后点击“新增笔记 · 1”，浏览页显示 `nid:1791367264662`、响应式“笔记”模式标签及1条结果；返回后批次保留。 | `DataActionRow` → `SettingsActionRow`、公共按下态按钮、既有浏览页。 |
| JIDE 接入 | 实际 Registry/Executor 测试验证只读→提案→应用登记确认→共同写入队列。模拟器真实提供者调用列牌组→读配置→提案，确认后测试牌组上限100→5，详情总卡片数5；随后清空归还。最终19:20历史确认卡显示独立的搜索条件、数量上限100→5和“添加顺序”，不再显示 JSON/排序数字。 | 共同动作/偏好声明与现有 `AgentActionCard`；`FilteredDeckOptions` 同时供手动 `FormSelectRow` 与 JIDE 使用；确认/取消采用公共按钮。 |

专用长音频包可重建：`cargo run -p jidecards_core --features anki-core --example audio_ui_fixture --locked`，仅在新 `tmp/audio-ui/run-*` 创建一条笔记、两段题面音频（30秒/2秒）和一段答案音频（2秒），导出含媒体 APKG。

模拟器发现单项播放点击未派发：模板字符串把网页正则中的 `\d` 转为 `d`。两处脚本改用 `[0-9]`，新增执行实际生成脚本的 SVG 子节点点击、单项编号和文档代次回归，避免退回整体重播/翻面。音频相关58项通过，`.local/high-audio-button-fix.log`；设备 `SoundPlayer` 日志证明原生队列确实接到单项文件。

继续对照 AnkiDroid `libanki/.../TemplateManager.kt` 发现完整渲染的 FrontSide 会把题面原声音重新加入答案 AV。客户端改为 Core 部分渲染→题面 AV 提取→填充 FrontSide→答案 AV 提取；题面按钮及视频沿 q 编号，答案沿 a 编号。真实 Core `card_rendering` 4项和两种渲染路径等相关78项通过，`.local/high-frontside-native.log` / `.local/high-frontside-local.log`。最终模拟器19:01:20翻面停止题面播放，答案原生队列 `count=1`，只含 `audio-ui-a.wav`，不会重复加入题面声音。

## 用户操作入口

模拟器简洁模式实际核查：设置→数据管理包含导入文件、导出牌组、备份与恢复、隐藏牌组恢复、媒体管理。备份与恢复面板集中完整备份、从文件恢复、自动备份开关、立即创建历史备份及历史列表恢复；完整备份包含媒体，自动历史备份说明不含图片/音频。牌组清空/重建在当前筛选牌组→更多；音频偏好在设置→外观→学习显示；导入类别直接点数量进入笔记浏览。

按功能行为对照 AnkiDroid，按本应用任务归类入口；同类列表、开关、对话框标题与动作复用公共组件，并核查实际外观。复杂筛选配置继续使用 JIDE 提案，不新增另一套配置页面。测试后隐藏音频=false、中断音频=true、简洁模式已恢复；筛选测试卡已清空归还原牌组。

## 证据边界

尚未执行 AnkiDroid Android APK/运行时、HarmonyOS NAPI 的真实联网同步以及在线取消/冲突完整矩阵。共享锁定 Core 主机结果不能替代这些平台行为。设备进程断电、全部大集合性能、浅/深色与大字体组合也不扩大声明。
