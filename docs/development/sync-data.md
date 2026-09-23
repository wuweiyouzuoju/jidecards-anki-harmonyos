# 同步与集合生命周期

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：AutoSyncScheduler 保存意图；SyncActivity 拥有集合占用；根同步面板执行同步。
- 快速反馈：`npm test -- sync`；完整验收见 [验证说明](verification.md)。

## 学习会话与同步调度

手动同步在设置页返回后独立唤醒，优先于尚未展示的公告/引导检查，仍等待真实的学习、编辑、导入和已打开弹窗；排队状态按实际阻挡原因显示。已有同步宿主时打开当前任务详情，不用排队提示覆盖其进度。


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

同步宿主被销毁时，`同步面板` 保留正在执行的集合/全量任务和媒体启动 Promise，待提交或回滚及取消调用落定后才释放 `SyncActivity`。Core 的 AbortMediaSync 只发取消信号，清理还需重复查询直至 `active=false`；一次查询失败不能当作完成。离页后不启动尚未接受的全量替换、不回调旧页面，已提交结果仍保存端点/媒体待同步标志并广播 FSRS 刷新。对应竞态由 `sync-disposal.test.mjs` 执行真实组件方法覆盖，通用测试支架为 `sync-panel-harness.mjs`。

备份状态见 [易混淆功能状态](../FEATURE_STATUS.md)：Core `create_backup/maybe_backup` 负责间隔、变更检测和 daily/weekly/monthly 保留；首页安全空闲时触发自动备份，设置页提供开关、立即创建和历史恢复。恢复前先保存当前集合，完成后通过现有替换链刷新集合和媒体路径。备份与同步共享 `AutoSyncScheduler` 操作占用，不能并发读写 collection。

FSRS 的全局开关、牌组高级选项中的“启用 FSRS”和统计页状态统一来自 Anki collection 的 `BoolKey::Fsrs`；参数及重排选项不代表开关。首次启动自动开启仅执行一次。同步面板在集合同步前后读取实际值，仅将 `true→false` 上报为关闭变化；媒体失败不丢失已提交集合的结果。`FSRS控制器` 的 `FSRS_STATE_REVISION_KEY` 仅通知设置/统计页重新读取，不缓存或覆盖开关；牌组选项保存也发送通知。自建服务器复现可核对 `sync: FSRS before/after` 日志，缺失字段在底层默认关闭，不能据弹窗断言用户主动关闭。

自定义服务器入口为 AnkiWeb 云同步卡片内、登录表单下方的一行小字，展开分组后点击打开居中弹窗（手机窗口宽度 < 600vp 时 bindSheet 只能底部弹出，故用 `CustomDialogController`）；取消丢弃地址草稿，保存失败在弹窗内显示。同步设置支持 AnkiWeb（服务器地址留空）与兼容 Anki 26.05 的自建服务器。`model/SyncSettings.ts` 校验 HTTP(S) 基础 URL、保留反向代理子路径并补齐末尾斜杠，也提供手动/自动共用的进程内互斥。`同步凭证存储.ets` 分开保存用户配置地址和服务端重定向端点；注销保留用户配置，切换服务器清除旧 hkey、重定向和待同步媒体标志，密码不落盘。

自动同步默认开启，保留用户关闭选择。手动与自动共用根 Navigation 外的同步宿主；设置页手动请求进入 AutoSyncScheduler 后返回首页，顶栏“更多”和“新建牌组”之间显示进度/待同步/失败/冲突，详情可收起。自动正常传输静默，启动、回前台、返回首页与学习完成时排队，空闲 3 秒检查，活动学习/编辑/导入/后台不启动新任务。开始学习取消待执行检查；已运行的增量同步经 SyncActivity.requestStudyPriority 让路，原生 AbortSync 单独转发、不等待普通调用锁或 NAPI 工作线程；普通 RPC 仍串行。取消句柄注册竞态由任务独占期间重试解决，回滚/提交完成且取消调用落定后释放集合，手动待同步意图不受自动开关影响。集合提交与取消竞争时保留成功结果及已启动媒体；媒体不锁学习。冲突仅显示状态，不占集合，用户确认方向前重新检查最新方向、端点与 USN；已明确启动的全量替换不可被学习自动打断。FSRS 提醒等待空闲首页。EntryAbility.onBackground 只为当前任务申请短时收尾，不保证后台常驻或杀进程后完成。扩展触发时机复用调度器，调整让路协议复用 SyncActivity；不要另建同步流程。

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
