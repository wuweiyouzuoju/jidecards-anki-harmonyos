# 旗标与标星增量同步冲突默认 JideCards 优先

状态：当前决策。用户在提出设备中立目标后，明确选择“社区没有解决方案的话就 JideCards 优先”。2026-10-03 调查未找到可直接采用、覆盖本次旗标／星标复现的上游修复，因此重新启用本方案，取代[上一阶段设备中立决策](2026-10-03-marking-conflict-compatibility.md)。这是 JideCards 的兼容兜底，不是所有 Anki 客户端共有的冲突规则。

## 社区调查与选择依据

- [2020 年旗标跨设备不同步报告](https://forums.ankiweb.net/t/flags-dont-sync-between-different-devices/574)：移除旗标后另一台电脑仍显示旧旗标。维护者未能复现，建议检查插件；帖子没有给出本次相同 mtime 冲突的已验证修复。相似症状不能认定为同一原因。
- [2025 年同步冲突讨论](https://forums.ankiweb.net/t/23-10-desktop-add-a-feature-to-automatically-periodically-re-optimize-fsrs-parameters/36715?page=6)：列出旗标／取消旗标等卡片操作会参与冲突，讨论单独修订信息和冲突后重算。讨论本身不是已经交付的统一标记合并规则。
- [FSRS Sync Reconciliation PR #4717](https://github.com/ankitects/anki/pull/4717) 调查时仍为 Open；[作者实现说明](https://anki-core--4717.org.readthedocs.build/en/4717/FSRS_SYNC_RECONCILE_IMPLEMENTATION.html)仅检测 FSRS／复习状态冲突，保留原始记录胜出规则。从候选检测和合并代码判断，它不能解决单纯旗标冲突，也未提供笔记 marked 决胜。
- 已关闭的 [旗标名称缓存问题 #1907](https://github.com/ankitects/anki/issues/1907) 属于名称同步后不刷新，与颜色／marked 的并发合并不同。本机名称入口已经在同步后重读配置。
- [当前上游旗标写入](https://github.com/ankitects/anki/blob/main/rslib/src/card/mod.rs)仍不更新卡片 mtime；[当前增量合并](https://github.com/ankitects/anki/blob/main/rslib/src/sync/collection/chunks.rs)仍对待同步记录使用严格更大的 mtime。结合本机原版双客户端 HTTP 复现，未发现锁定版本可直接采用的修复；这不等于证明社区不存在任何其他研究。

## 问题与选择

Anki 26.05（`UPSTREAM.lock`）的 SetFlag 保留卡片 mtime，以免使学习队列失效。原增量同步只用严格更大的 mtime 决定待同步记录的冲突，两个离线客户端改同一卡片旗标时可能各自拒绝远端，随后清除待同步 USN，永久留下两个不同值。相同秒的 marked 修改也需要明确决胜。

选择在 JideCards 的 Core 增量合并处保留本地待同步记录的标记，并用标准修订时间使保留结果可被原服务端和 AnkiDroid 接收。单张卡只有一个旗标，冲突选本地颜色；笔记的星标选本地是否存在完整、忽略大小写的 marked。不会按位 OR 颜色编号。

## 责任与边界

- [Rust 生产构造入口](../../native/rsharmony/src/lib.rs) 的 `init_anki_backend` 开启策略，FFI 和真实 HTTP 测试共用该入口。Core Backend／CollectionBuilder 默认关闭，服务器强制关闭；策略跟随集合 reopen 和 `as_builder`，不写入同步配置。
- [跟踪补丁](../../tools/patches/anki-marking-sync-conflicts.patch)以锁定源码为基线；`build-native.ps1` 与 `test-anki-core.mjs` 均幂等应用，不能应用时失败。忽略的 third_party 不是交付事实来源。
- 下载 chunk 时，仅对本地 USN 仍待同步、同 ID 且标记不同的记录执行本地优先。整体记录仍按原 mtime 规则选择，再覆盖旗标低三位或 exact marked，保留选中记录的调度、高位、字段及其他标签，保留待上传 USN。
- 上传 chunk 前，将剩余待同步卡片／笔记的 mtime 设为 `max(保留记录时间, 当前秒) + 1`，检查溢出；该元数据变化使原严格比较规则接受上传值。未更改 collection schema、protobuf、RPC 编号、chunk 元组、SetFlag／UpdateNotes 写入、FSRS 或调度算法。
- 元数据准备在原增量同步事务内，Core 已清学习队列；失败／取消由原事务回滚。学习中设置旗标仍不改 mtime，不要求前端另算 SchedulingStates。
- 本地记录已同步时继续接收 AnkiDroid 单方后续修改。优先判断使用待同步卡片／笔记记录，不建立额外标记事件日志；本地编辑同一记录的其他字段也会使记录进入待同步集合。
- 两个 JideCards 设备均有待同步修改时，后执行增量同步的一端保留自己的待同步标记，再传播给另一端；这是同步顺序决胜，不是实际编辑时间决胜。两个未修改 AnkiDroid 之间仍遵循上游规则，本补丁无法改变它们之间的行为。
- flagLabels 保留原整体集合配置合并和最新配置局部写入流程；全量同步方向仍由既有用户确认决定。

## 验证和实际限制

[card_marking.rs](../../native/rsharmony/tests/card_marking.rs) 使用临时目录、合成账号和本地 HTTP SimpleServer。JideCards peer 经生产工厂开启策略；参考 peer 的标记写入及同步 merge 保持原版 Core 行为，服务器未开启策略。

回归覆盖双向七色和清除、兄弟卡、高位、exact marked、字段和子标签、名称保真、撤销／重做、失败重试、重开和全量往返。混合客户端两种离线冲突顺序明确断言 JideCards 结果；两个 JideCards 的两种顺序断言后同步端的待同步标记胜出，双方收敛。清旗标／加星和设置旗标／取消星均覆盖，随后参考 peer 单方更改仍可同步。参考 peer 先同步还覆盖其 mtime 领先一小时并修改 due、高位、字段和其他标签，要求这些较新的数据保留。活动队列测试使用标记修改前取得的答题状态完成答题，再撤销答题、标星和旗标。

命令：`cargo test -p jidecards_core --features anki-core --locked --test card_marking`；完整门禁及产物以调查文档最新验收记录为准。

本机回归不等于 Android/HarmonyOS 真机或线上 AnkiWeb 验收。没有更改另一端应用，也没有穷尽所有客户端版本、时钟异常和网络交错；不作无条件的跨端绝对保证。用户自行安装，本任务不操作设备或账户。
