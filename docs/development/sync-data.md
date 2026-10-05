# 同步与集合生命周期

[返回任务索引](../../PROJECT_CONTEXT.md)

不依赖账号的 Anki / AnkiDroid 核心回归见[核心互通](core-interop.md)：`npm run test:interop` 生成隔离 APKG/COLPKG 与结果报告。它不证明线上同步通过；真实 AnkiWeb 增量、全量和媒体同步需要隔离测试账号，未提供前保持未验证。旗标／星标另有 [card_marking.rs](../../native/rsharmony/tests/card_marking.rs) 的临时 SimpleServer＋两个独立 Core Backend HTTP 同步回归，覆盖普通双向修改、全量、撤销、失败重试与重开；这是本机协议证据，未运行 Android/HarmonyOS 应用。社区调查未找到可直接采用的标记冲突修复后，按用户选择启用 JideCards 待同步标记优先：混合客户端冲突保留 JideCards 旗标／exact marked，整体记录仍按上游 mtime 选择；两个 JideCards 均待同步时由后同步端的标记胜出并传播。上传前为剩余待同步卡片／笔记准备更大的标准修订时间，故不是纯字段时间戳合并。名称仍走原集合配置规则，两个未修改 AnkiDroid 之间不受影响。见[源码对照](flags-marking-audit-2026-10-03.md)和[当前决策及社区来源](../decisions/2026-10-03-marking-sync-priority.md)。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：AutoSyncScheduler 保存意图；SyncActivity 拥有集合占用；SyncSession 执行同步，根同步面板展示快照。
- 快速反馈：`npm test -- sync`；完整验收见 [验证说明](verification.md)。
- 审查与修复记录：[2026-09-27 同步实现审查](sync-audit-2026-09-27.md)；媒体任务唯一启动/消费、首页统计独立队列和设置分组保护的当前契约见下文。

## 同步任务与页面可用性

普通与全量同步采用 Anki 桌面端的所有权方式：Core 自动启动媒体后，`SyncSession.启动媒体阶段()` 只监测，不再调用 SyncMedia。冲突重检用 `syncMedia=false`，若重检已经完成集合合并，则显式传 `startMedia=true` 启动一次。保留服务端媒体 USN 和重定向端点，不能把这些路径改成无条件再启动媒体。`媒体同步状态()` 会消费一次性终态，只有根同步宿主（包括其销毁清理）可以调用；媒体管理与删除牌组后的媒体清理只读 `SyncActivity.isActive()`，整个同步租约期间保守禁止清理。回归：`sync-media-ownership.test.mjs` 覆盖快速失败、全量/无变化/重检、其他页面抢先观察及错误保留。

按阶段提示成功：卡片提交后提示“卡片数据已同步，可以开始学习”，媒体结束后明确提示“媒体同步完成”，每个阶段只提示一次，不能使用两条泛称“同步完成”的提示。关闭媒体同步时，集合结束仍只提示一次整体完成。自动静默任务不打扰，用户主动打开详情时允许展示完成提示。媒体失败保留卡片已保存的说明。媒体详情可关闭，任务仍由根宿主持有；失败重试仍使用原有手动同步入口和租约，不另起无所属的并发任务。既有自动同步默认关闭及升级迁移规则不变。

设置目录、外观、帮助、AI 等独立内容可在集合同步期间直接进入。`设置面板.openSection()` 对调度器、数据维护和高级分组按 `SyncActivity.isCollectionBusy()` 保护；设置页的牌组查询等待集合释放并检查离页状态，直接导出/备份入口也检查集合占用。卡片读写、提醒等真实依赖集合的入口仍保留事务保护。`home-sync-refresh-runtime.test.mjs` 验证设置导航和数据库分组的差异。

## 学习会话与同步调度

手动同步由首页更多菜单直接发起，或在设置页返回后独立唤醒，优先于尚未展示的公告/引导检查，仍等待真实的学习、编辑、导入和已打开弹窗；排队状态按实际阻挡原因显示。已有同步宿主时打开当前任务详情，不用排队提示覆盖其进度。

设置页“立即同步”必须将请求交给 `HomeSyncController.requestManual()`，不能用 `SyncActivity.isActive()` 提前拒绝：等待全量同步方向时仍持有租约，但首页不会显示传输圆圈，提前拦截会同时隐藏进度并封死处理入口。已有任务只重新展示，不另发同步或自动选择方向；登录、注销和服务器变更仍受租约保护。行为回归见 `sync-automatic.test.mjs` 中设置入口连接真实同步会话/控制器的用例。


统计页入口不等待同步和首页刷新；首页的完整 GraphsView 与查询天数通过 `统计页参数` 传入作首屏展示，页面数据库查询/偏好写入仍等待 `SyncActivity.waitForCollection()`。无快照或范围不匹配时显示加载态；快照只展示，不在最新查询完成前推送桌面卡片。后台刷新保留图表，离页取消未执行查询，偏好响应也校验请求代次。回归见 `stats-entry-runtime.test.mjs`。

`AnkiStudySessionBackend.studyOptions` 读取当前卡片实际牌组的完整学习展示选项，筛选卡使用原牌组；`StudySessionController` 随快照传递。自动播放遵循开关，答案手动重播按跳过问题选项串联两面。每次加载重新读取，过期配置响应随请求代次丢弃。

`StudyTiming` 负责屏幕计时/倒计时，不修改评分内部统计；“显示答案后停止”只冻结屏幕。自动前进在学习更多菜单显式开始/暂停，页面唯一计时器调用既有翻面/评分/埋藏方法；编辑、引导和菜单暂停，后台停用自动前进。`AudioQueueCompletion` 为 Sound/TTS 提供完成/取消信号，`CardAudioSession` 等完整队列结束再继续，不能把播放器启动当播放完成；重播可用性提前通过 onReady 返回。回归见 `study-timing`、`native-audio-completion`、`study-lifecycle`、`card-audio-session`。

首页删除提交后校验当前及保存的选择（包含级联子牌组），默认牌组仍保留；偏好清理返回布尔结果，失败不能改称数据库删除失败。提交后排队同步，`deckDeletionBusy` 阻止清理/刷新期间启动自动同步；一般主页刷新也校验失效选择。回归见 `home-deletion-runtime`、`sync-automatic`。

评分触感由 `utils/StudyHaptics.ets` 管理，四档评分使用同一柔和短震，默认开启；现有设置页的学习布局分组可关闭并持久保存本机偏好。EntryAbility 在首屏前恢复开关并预查效果，学习页仅在评分守卫通过后触发，不等待振动、不影响调度或评分落库。预置 soft 不支持时回退 20ms 短震，始终使用 `usage: touch` 遵循系统触感开关；无马达或振动失败不影响学习。调整反馈或偏好在该工具模块集中处理，不向 StudySessionController 引入系统 Kit。

`model/StudySessionController.ts` 编排撤销可用性、取队首、渲染、评分文案和评分/撤销提交，经 `backend/StudySessionBackend.ts` 复用既有服务。页面保留 ArkUI、HTML/音频及请求代次，消费完整快照。所有评分状态字节原样透传，Anki Core/协议不变。

成功评分、撤销、编辑、埋藏/暂停、删除及恢复埋藏通过会话通知 `model/AutoSyncScheduler.ts` 合并待同步意图。会话活动或仍有操作未结束时不启动自动集合同步；完成页或返回首页安全空闲后执行既有同步链。每张答题立即本地落库，不承诺每张即时联网。未同步数据保存在 Anki 集合中，内存调度器只保存触发意图，进程重启由启动同步处理。

`SyncActivity` 在自动面板挂载前预留集合；从完成页恢复学习优先请求增量同步让路，等待集合安全释放后再读取新队列；未决冲突与媒体不参与等待，已经确认的全量替换仍需完成。同步提交广播既有内容刷新信号，完成页重新取队列/撤销状态。页面销毁须调用会话 `dispose()`；尚未完成的已接受写入仍通知同步并保留占用直至结束。以后调整安全时机/合并规则修改调度器和首页适配，调整评分/取卡编排修改会话，不再在学习页面内拼接评分输入。行为测试见 `study-session-controller`、`study-lifecycle`、`study-content-refresh`、`sync-automatic`。


统计页全局时间范围及各图表的时间/分位/视图选择统一使用原生 Select 与 SelectStyle；各区块选择框位于 `统计图表分区` 标题行右侧，页面持有独立索引，图表通过 `@Prop @Watch` 重算原缓存，小时窗口仍写同一偏好并刷新首页/桌面卡片。全局从全部缩至一年时，隐藏的全部时间档位归到一年，分位范围不受影响。日历保留全年横向滚动与常驻底部滚动条，绑定 Scroller 按实测视口让今天列靠右；首次布局、年份/周首日/宽度改变才重新对齐，普通数据刷新保留用户拖动位置。行为回归见 `stats-range-selection`、`stats-calendar-runtime`。


## 核心数据流

同步设置的已登录卡片按账号、同步选项、操作按钮、服务器入口排列。自动与媒体开关统一使用 `components/common/SettingsToggleRow.ets`：标题/说明限定在同一剩余宽度内自然换行，固定开关槽位不压缩，两列间隔 16vp，行高随文字增长；说明不截断、不用绝对定位避让。账号可换行，服务器入口整行可点并复用 `DisclosureChevron`。登录、开关确认、注销与同步回调仍由 `同步分组.ets` 持有，公共行只负责排版与事件转发。设备验收检查两行说明右边界一致、开关不重叠，以及大字号/窄屏下全文可见。

同步宿主被销毁时，`SyncSession` 保留正在执行的集合/全量任务和媒体启动 Promise，待提交或回滚及取消调用落定后才释放 `SyncActivity`。Core 的 AbortMediaSync 只发取消信号，清理还需重复查询直至 `active=false`；一次查询失败不能当作完成。离页后不启动尚未接受的全量替换、不回调旧页面，已提交结果仍保存端点/媒体待同步标志并广播 FSRS 刷新。媒体待同步标志在集合提交后、读取 FSRS 前保存，避免后续读取期间离页丢失恢复信息。对应竞态由 `sync-disposal.test.mjs` 执行真实会话覆盖，通用测试支架为 `sync-panel-harness.mjs`。

备份状态见 [易混淆功能状态](../FEATURE_STATUS.md)：Core `create_backup/maybe_backup` 负责间隔、变更检测和 daily/weekly/monthly 保留；首页安全空闲时触发自动备份，设置页提供开关、立即创建和历史恢复。恢复前先保存当前集合，完成后通过现有替换链刷新集合和媒体路径。备份与同步共享 `AutoSyncScheduler` 操作占用，不能并发读写 collection。

历史恢复提交后由 `LocalBackups` 同时发布首页刷新与卡片内容刷新，失败不发布。备份面板确认时固定并显示所选文件名，执行防重入；结果和实际错误置于正文顶部并即时提示，提交后列表读取失败仍保留“已恢复”，不误报为可重复恢复。`backup_management` 将所选文件、忙碌、结果及错误交给 JIDE 的同一实时观察，设置目录共用对应入口声明。回归：`local-backups-runtime.test.mjs` 执行真实适配器/组件逻辑，覆盖保留选中副本、失败不刷新、具名确认、防重复提交与提交后读取失败。

FSRS 的全局开关、牌组高级选项中的“启用 FSRS”和统计页状态统一来自 Anki collection 的 `BoolKey::Fsrs`；参数及重排选项不代表开关。首次启动自动开启仅执行一次。SyncSession 在集合同步前后读取实际值，仅将 `true→false` 上报为关闭变化；媒体失败不丢失已提交集合的结果。`FSRS控制器` 的 `FSRS_STATE_REVISION_KEY` 仅通知设置/统计页重新读取，不缓存或覆盖开关；牌组选项保存也发送通知。自建服务器复现可核对 `sync: FSRS before/after` 日志，缺失字段在底层默认关闭，不能据弹窗断言用户主动关闭。

自定义服务器入口为 AnkiWeb 云同步卡片内、登录表单下方的一行小字，展开分组后点击打开居中弹窗（手机窗口宽度 < 600vp 时 bindSheet 只能底部弹出，故用 `CustomDialogController`）；取消丢弃地址草稿，保存失败在弹窗内显示。同步设置支持 AnkiWeb（服务器地址留空）与兼容 Anki 26.05 的自建服务器。`model/SyncSettings.ts` 校验 HTTP(S) 基础 URL、保留反向代理子路径并补齐末尾斜杠，也提供手动/自动共用的进程内互斥。`同步凭证存储.ets` 分开保存用户配置地址和服务端重定向端点；注销保留用户配置，切换服务器清除旧 hkey、重定向和待同步媒体标志，密码不落盘。

自动同步在新安装及旧版升级后均默认关闭。`同步凭证存储.ets` 固定使用 `auto_sync_enabled_v2`，不再读取旧 `auto_sync_enabled`，因此旧版明确开启的用户也须在新版重新确认；之后的开关选择跨启动保留，不随每次启动重置。无偏好或读取失败时不自动连接，凭证、服务器和媒体偏好不受影响。设置中每次从关闭切到开启，先提示首页短暂卡顿、点开牌组等待和媒体流量等影响，确认后才持久化；取消、离页或保存失败不启用。首页左上角“更多 → 同步”和设置页“立即同步”统一交给 HomeSyncController.requestManual()，已有任务只打开详情，不重复联网；首页未登录时打开设置并提示登录。手动与自动共用根 Navigation 外的同步宿主；设置页手动请求进入 AutoSyncScheduler 后返回首页，顶栏“更多”和“新建牌组”之间仅在实际集合/媒体同步（syncIndicator=syncing）时显示旋转圆圈，点击区为 44vp，图形为 24vp。冲突和失败显示可点击的红色圆圈感叹号，避免未结束的任务没有可见处理入口；排队、为学习让路、中止和完成隐藏顶部图标。同步中的圆圈和红色圆圈感叹号均可打开任务详情，完整进度文案保留为无障碍标签。冲突/错误仍保存在同步宿主中，通过“设置 → 同步”手动入口重新打开当前任务详情；不因隐藏图标销毁任务或自动选择覆盖方向。自动正常传输不弹详情，成功立即收起。手动同步在集合及已启用的媒体同步全部成功后，通过 `notifySyncResult()` 立即显示完成 Toast 并关闭任务；用户打开过的自动任务详情也在完成时提示。取消保留完成态的 3 秒延时，避免下一次点击手动同步只打开上一次结果；自动静默任务仍不打扰，失败/冲突保留处理入口。回归由 `sync-settings.test.mjs` 覆盖旧开关失效与重新开启持久化，`sync-automatic.test.mjs` 覆盖完成反馈和媒体收尾。启动、回前台、返回首页与学习完成时排队，空闲 3 秒检查，活动学习/编辑/导入/后台不启动新任务。开始学习取消待执行检查；已运行的增量同步经 SyncActivity.requestStudyPriority 让路，原生 AbortSync 单独转发、不等待普通调用锁或 NAPI 工作线程；普通 RPC 仍串行。取消句柄注册竞态由任务独占期间重试解决，回滚/提交完成且取消调用落定后释放集合，手动待同步意图不受自动开关影响。集合提交与取消竞争时保留成功结果及已启动媒体；媒体不锁学习。冲突保留在任务详情中，不占集合，用户确认方向前重新检查最新方向、端点与 USN；已明确启动的全量替换不可被学习自动打断。FSRS 提醒等待空闲首页。EntryAbility.onBackground 只为当前任务申请短时收尾，不保证后台常驻或杀进程后完成。扩展触发时机复用调度器，调整让路协议复用 SyncActivity；不要另建同步流程。

学习页沿用固定底部只显示答案或四档评分的布局，今日跳过与暂停此卡位于更多菜单；浮动布局同样只显示答案或四档评分，工具栏可拖动并保存吸附位置。两种布局的评分名称固定为“忘记／困难／良好／简单”，下方单独展示 Anki 返回的预计复习间隔。首张卡片就绪且页面可见时展示一次学习说明，确认通过 `utils/StudyGuideStore.ets` 写入本机偏好，所有牌组共用；空牌组不消耗首次机会，更多菜单可重看。教学与设置术语详解保持相同定义，阅读时间不计入当前卡答题时长。

```text
ArkUI 页面/组件
  -> backend/* 领域服务
  -> 后端会话（单例与 collection 生命周期）
  -> 后端客户端
  -> libjidecards.so Node-API
  -> rsharmony C ABI
  -> Anki 26.05 Rust Core
```

学习：获取队首 -> 后端渲染 -> ArkWeb 展示 -> 原样提交调度状态 -> 后端写入重排。

媒体：`https://jidecards-media.local/` -> ArkWeb 拦截 -> 沙箱 `collection.media/`。

Agent：页面 -> SessionController -> Runner -> Provider/工具/Scope -> ChangeDraft ->
用户确认 -> DraftExecutor -> 既有 Service。模型不能访问裸 RPC、SQLite、shell 或任意文件。



导出意图定义在 `model/DataTransferIntent.ts`，选项定义在纯类型模块 `model/数据传输模型.ts`；首页与设置页共用 `backend/DataExportWorkflow.ets` 的导出、格式选择和文件保存流程。用户取消保存返回 null，页面保留面板；整库替换仍必须经过原有两步确认，不与合并导入共用写入语义。


## 会话与异步文件迁移

`后端会话` 的 generation 同时守卫打开成功、失败清理、finally 和关闭集合完成：关闭立即失效旧打开，新打开不共享旧 Promise，旧失败不能关闭新句柄。回归：`backend-session-lifecycle.test.mjs`。

`backend/DataTransferFiles.ts` 独占文件描述符、目录遍历、复制和删除，使用 fileIo Promise API；包协议与替换回滚仍在 `数据迁移服务.ts`。暂存 API 现在返回 Promise，调用者必须 await。流复制固定 64 KiB，处理短读、短写、零写入及所有描述符释放路径。安全副本任何阶段失败都清理半成品、重开原集合；导入失败恢复完整副本后重开；成功后的副本清理失败不触发回滚。回归：`data-transfer-files.test.mjs`。

保留全量媒体安全副本的磁盘成本；异步化不减少恢复所需空间。整库替换现在由 `TransferRecovery.ts` 持久保存准备/提交标记，普通集合打开前恢复被中断的替换或回滚，失败阻止打开不一致数据。空间预检、标记时序、取消及验证入口见[数据导入与恢复](import-data.md)；不增加断电或硬件损坏下的保证。

同步任务的平台适配集中在 `backend/AnkiSyncSession.ets`：同步服务、凭证、FSRS 通知、短时后台任务、计时器和日志经明确端口传入纯会话。`components/同步面板.ets` 只持有 `SyncSessionSnapshot`，显隐不终止任务，销毁禁止回写 UI；已接受的集合和媒体 IO 落定后才释放租约。


### 官方同步入口显示开关（2026-09-30）

`model/ReleaseFeatures.ets` 的 `OFFICIAL_ANKIWEB_SYNC_UI_ENABLED = true` 已恢复官方账号表单、注册链接、默认官方服务器提示，以及首页手动/自动同步对原有官方账号的访问。自定义服务器入口继续可用；自动同步仍遵守用户已有开关，不因恢复界面自动开启。
该代码常量不提供用户设置或调试解锁路径。若以后设为 `false`，`SyncSettings.isSyncEndpointVisible` 与 `loadVisibleSyncAuth` 会统一隐藏空地址及显式官方域名对应的界面和账号访问；原始凭证、默认端点协议、服务器保存与同步执行代码不变，不清除账号或偏好。
`tools/tests/sync-settings.test.mjs` 覆盖当前恢复状态、关闭/恢复开关、显式官方域名、原有默认地址登录与凭证保留。云牌组、AI、赞赏入口及共享牌组网站、文档、开源署名均不属于此开关范围。
