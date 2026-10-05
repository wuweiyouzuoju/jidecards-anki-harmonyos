# 数据导入、导出与恢复

[返回任务索引](../../PROJECT_CONTEXT.md) · [集合生命周期](sync-data.md)

## 入口与责任

首页及设置的“导入文件”共用 `model/home/DataTransferSession.ts`、`backend/AnkiDataTransfer.ets` 与 `components/home/DataTransferFeature.ets`。面板 `components/数据迁移面板.ets` 只保存选项草稿；导入类型、选择器、进度、取消、结果和占用由会话拥有。`components/import/` 分别展示 APKG 选项、CSV 映射与笔记统计。业务及协议回归进入 `npm test -- sync`，最终执行 `npm run verify`。

首页“新建牌组 → 导入文件”和设置“数据管理 → 导入文件”统一调用 `startImport()`：先通过同一过滤项选择 APKG / CSV / TSV / TXT，平台 `FileUri.name` 提供文件名，纯模型 `ImportFile.ts` 按后缀分流，随后展示 APKG 选项或 Core 文本预览。只识别格式，不绕过 Core 文件校验；未知格式和 COLPKG 不会进入普通导入。选择器取消关闭面板，失败保留重试，离页后的返回不暂存或写入。

面板标题按任务变化并显示导入文件名，不再提供跨任务的模式下拉。设置独立展示“导入文件”“导出牌组”“备份与恢复”；牌组菜单直接打开当前牌组导出。备份页上部连接创建完整 COLPKG 备份（媒体可选）及从文件恢复（确认覆盖），下部保留不含媒体的自动/手动历史备份。子任务关闭返回备份页，系统返回优先关闭最上层任务，执行期间不释放占用。设置搜索、入门速览和中英文路径与入口一致。

`settings/DataActionRow.ets` 共用数据操作与备份入口：水平边距仅由外层提供，行内只贡献上下 8vp，最小高度 58vp 可随文字增长；提示占剩余宽度，箭头固定。导入面板继续复用 `DialogFrame` 的限宽、固定标题、滚动正文及安全区约束。

外部 APKG 用 `importUri(uri, true)` 打开同一选项面板；等待确认期间保留 `HomeWorkCoordinator` 的 URI 租约，确认后直接使用已授权 URI，不再弹选择器。关闭/离页释放未提交文件，已接受导入等待真实调用结束才释放队列。历史的 `importUri(uri)` 直接执行接口保留给内部调用与测试。云端精选牌组继续沿用其串行下载、成功配额和逐项失败策略，不复用整库替换语义。

## APKG 与文本

- APKG 复用 Anki `ImportAnkiPackage`，开放笔记/笔记类型的较新才更新、始终更新、保留，以及复习进度、牌组配置、类型合并。面板打开或选中文件后先读取 Core 保存的五项选项，不用本机硬编码默认值覆盖它们；每次打开重新读取，本次草稿独立复制。读取失败保留错误并禁用提交，可关闭后重新打开或重新选文件。加载选项与系统选择文件是不同阶段；外部 URI 在选项加载/确认期间保持租约，离页后迟到结果不能导入。内部直接 `importUri(uri)` 保留 Core 自行决定选项的行为。任一更新策略选为“始终更新”时才显示覆盖本地修改的小字说明；两项都改回其他策略后隐藏。
- CSV / TSV / TXT 使用 UTF-8，`GetCsvMetadata` 负责分隔符检测、Anki 文件头、带引号/多行字段及前五行预览；`ImportCsv` 负责实际解析、重复匹配和写入。应用不另写 CSV 解析器。可选择牌组、笔记类型、字段列、标签/GUID 列、重复处理、匹配范围和 HTML。文件指定的逐行牌组/笔记类型可保留；改变分隔符或类型会重新读取预览与映射，界面有重置说明。HTML 媒体引用不会自动复制文本旁的文件。
- 协议以锁定 `third_party/anki/proto/anki/import_export.proto` 为准。`CsvImportMessages.ts` 保留 deck/notetype oneof 和字段列的 1-based 索引，0 表示未映射；`CsvImport.ts` 检查映射范围并复制草稿。新增 RPC 别名从 `tools/rpc-index-methods.json` 生成，不能手写编号。
- 成功后保留 `ImportSummary` 结果页，显示读取、新增、更新、重复、类型冲突、首字段匹配、缺失类型/牌组及空首字段数量。数量单位是笔记；一条笔记可能生成多张卡片。结果页禁止再次提交，避免重复操作。失败保留错误并允许重选文件。

## 文本导出（2026-10-02）

设置的“导出牌组”和牌组菜单共用导出面板，可选择 APKG、笔记文本或卡片文本。文本由 Core `ExportNoteCsv` / `ExportCardCsv` 生成，格式为 UTF-8、制表符分隔 `.txt`，带 Anki 文件头；名称中的 Csv 不表示逗号分隔文件。笔记导出原始字段，可选 HTML、标签、牌组、笔记类型及 GUID；卡片导出渲染后的正反面，可选保留 HTML。牌组范围通过 `ExportLimit.deck_id` 交给 Core。

`TextExportMessages.ts` 只编码格式与选项，`DataTransferIntent.ts` 的 `exportText` 经原有 `DataTransferSession`、`AnkiDataTransfer` 和 `DataExportWorkflow` 执行。仍用系统保存选择器，取消不显示成功；暂存文件在保存、取消或失败后清理。文本不携带媒体文件和复习进度，HTML 媒体引用须另行管理。导出期间保持原集合占用，不引入第二套迁移状态。

`tools/tests/text-export.test.mjs` 验证实际协议、面板意图、保存取消及清理；进入 `npm test -- sync`。真实 Core 导出内容见原生回归，设备选择器、中文路径和长文本布局另需设备验收。

## JIDE 子集导出（2026-10-04）

`propose_export_subset` 仅在 JIDE 暴露，不新增菜单入口。Scope 要求全部 ID 已发现，非空、唯一、正安全整数，最多1000项；notes/cards 分别使用 Core `ExportLimit.note_ids/card_ids`，空列表不能编码成整库。APKG 可选媒体和调度；文本按 mode 导出原始笔记字段或渲染卡面，不携带媒体文件/调度。

提案保存实际目标快照，卡片快照同时包含关联笔记，确认前修改内容也会拒绝旧提案。`AgentActionExecutor` 在原集合占用下复查并调用 `数据迁移服务.exportSubset`，然后释放占用再复用 `完成导出` 的保存选择器与临时文件清理；取消返回 cancelled/saved=false，不修改牌组归属。`ExportLimitMessages` 共用 notes/cards oneof 编码，原整牌组导出保持既有参数。协议及取消回归见 `text-export.test.mjs`、`ai-agent-maintenance.test.mjs`，真实 Core 文件内容/范围和源集合不变见 `jide_maintenance.rs`。

## 进度和取消

`ImportOperation` 是单次导入的取消令牌；`DataTransferFiles.ts` 用 64 KiB 流复制并最多约每 100 ms 上报真实字节进度。Core 阶段由 `ImportProgressService.ts` 每 150 ms 串行查询 `LatestProgress`，显示 Anki 的真实阶段文字，不制造总百分比。进度查询失败不改变导入结果；取消请求继续重试，直到调用结束。

Rust 注册表为 `LatestProgress` / `SetWantsAbort` 提供只访问 Core 共享进度状态的独立通道，C++ 同步转发这两个短调用，避免被导入持有的集合互斥锁或线程池阻塞；其他 RPC 继续串行。轮询在 finally 中停止并排空后才解除占用。取消不等于已经回滚，界面等待最终结果；只有 Core 的 `INTERRUPTED` 或文件复制取消才显示取消，提交先完成时仍显示成功。整库安全副本、数据库重开与回滚阶段禁用取消。APKG 的事务及媒体处理仍遵循 Core，取消后可能留下未引用媒体，可使用媒体检查处理。

## 整库恢复日志

`TransferRecovery.ts` 唯一拥有 `filesDir/transfer-recovery`，`数据迁移服务.ts` 编排关闭、保存副本、导入、重开验证与提交。选择文件后的空间预检覆盖原数据库、媒体、两倍压缩包大小及 64 MiB 余量；这是最低工作空间估计，不能保证任意压缩比的包都能展开，后续空间不足仍走回滚。

1. 关闭集合后复制 `collection.anki2`、可选 `collection.mdb` 和全部 `collection.media`。完整复制后创建 `prepared` 标记，之前不修改现有数据。
2. 调用 Core 替换。只有迁移拥有者用 `确保已打开(filesDir, true)` 验证新集合，随后写 `committed`；普通调用不得跳过恢复。
3. 所有普通打开/重开先执行恢复检查。存在 `prepared` 且无 `committed` 时恢复原数据库和媒体，并删除目标旧 WAL/SHM/journal。恢复再次中断仍保留完整来源，下次从头重试；失败阻止打开不一致的集合。同一目录的并发恢复共享一个 Promise。
4. 成功导入或成功回滚写 `committed`，清理前先将目录重命名为 `transfer-recovery-discarded`，避免清理中断后把半份副本当成恢复来源。清理失败不回滚成功提交，下一次打开重试清理。

这是进程中断恢复，不是长期历史备份；没有增加断电下文件系统持久化保证，也不处理硬件损坏。数据库与媒体全量副本成本仍存在。

## 依据与验证

跨客户端核心回归入口为 `npm run test:interop`：[隔离样本、行为断言与设备/在线边界](core-interop.md)。该命令执行锁定 Core 的 APKG/COLPKG 往返以及真实集合的主机恢复，不读取用户集合或账号。设备和在线同步仍独立验收。

参考 [Anki APKG 导入说明](https://docs.ankiweb.net/importing/packaged-decks.html)、[文本导入说明](https://docs.ankiweb.net/importing/text-files.html)；实现以项目锁定源码的 `rslib/src/import_export/text/csv/metadata.rs`、`rslib/src/import_export/package/apkg/import/mod.rs`、`rslib/src/backend/collection.rs` 为事实来源。恢复采用先保留完整副本、写阶段标记、提交后清理的本地协议，不声称复制了 Anki 的恢复实现。

- `import-options-runtime.test.mjs`：统一选择器的格式分流、取消/离页及防重入、选项传递、外部文件确认/关闭、结果防重提、CSV 预览/映射、取消竞态及协议回写；`import-flow-contract.test.mjs` 核对首页、设置与备份的公共接线。
- `data-transfer-files.test.mjs`：短读写、取消释放描述符、空间不足、实际临时文件系统上的失败回滚、启动恢复、恢复再次中断及提交清理失败。
- `backend-session-lifecycle.test.mjs`：恢复失败阻止重开、重试与打开代次。
- `native/rsharmony/src/lib.rs`：真实 Core CSV 引号/多行预览、重复导入统计；长集合调用期间进度/取消可达性。
- UI 复用 `DialogFrame` 的固定标题和滚动正文：外框唯一拥有宽度、内边距与限高；正文块只负责块内间距。APKG/CSV 的公共 `ImportSelect` 将标签放左侧、选择框放右侧，行内间距12vp，无额外水平内边距；选择框沿用 `SelectStyle` 的40vp高度、内容宽度与56%最大宽度，标签占剩余空间并可换行，长选项省略但菜单保留完整文本。设备检查覆盖窄/宽屏、浅/深色、系统安全区与大字号，不能以 Node 测试或 HAP 编译替代。

导入能力扩展阶段执行 `npm run verify` 通过仓库、原生、RPC 与双架构签名 HAP 门禁；按钮文案调整后再次执行 `npm test` 和 `npm run build:app -- -SkipRust -Clean`，无新增编译警告。x86_64 模拟器使用 `install -r` 保留原集合，检查手机竖屏浅色下的 APKG 选项、模式切换后选项保留、CSV 选择器及取消返回。界面操作没有提交导入或替换原集合。真实 Core CSV 导入及重复处理由原生临时集合测试验证；恢复中断由主机临时文件系统测试验证。

入口调整阶段再次通过 `npm run verify`；补齐空牌组提示后执行 `npm test` 和 `npm run build:app -- -SkipRust -Clean`，签名 HAP 构建无新增警告。模拟器覆盖安装并保留原有牌组，实际核对首页“导入文件”、统一选择器打开及取消返回、设置目录跳转。继续检查设置数据行及备份子面板时设备断开（`hdc list targets` 返回空），因此新设置行、CSV 文件选中后的真实预览、备份子任务返回及多主题/尺寸矩阵尚无本轮设备验收结果；其状态与接线回归已执行。

设备验收边界：尚未在真机执行大文件导入、导入中杀进程恢复，也未完成宽屏、深色及大字号矩阵；这些场景不能从现有模拟器检查或构建结果推定通过。
