# Anki / AnkiDroid 核心互通回归

[返回任务索引](../../PROJECT_CONTEXT.md) · [数据导入](import-data.md) · [同步](sync-data.md) · [验证](verification.md)

## 可重复入口与隔离

在仓库根运行 `npm run test:interop`。默认只读取相邻 `../AnkiDroid` 的四份源码参考；可用 `npm run test:interop -- --ankidroid-source D:/Projects/AnkiDroid` 指定源码位置。脚本不接收集合、账号、凭证、设备或覆盖输出参数。

前提：Node 24、`UPSTREAM.lock` 锁定的 Rust 主机工具链与 Anki checkout、protoc 和对应主机链接器可用；按仓库原生构建说明准备上游补丁和翻译目录。不安装 Python Anki 包，不连接 AnkiWeb。缺少依赖、协议指纹变化、参考后端版本不符或行为断言失败都返回非零；保留本轮失败日志。

每次建立 `tmp/core-interop/run-*` 新目录，保存 `report.json`、分阶段日志、`expected.json`、五份样本包和 `synthetic-collection/`。包和快照记录 SHA-256。独立测试的额外集合位于系统临时目录，测试完成后删除自己创建的目录；导出样本保留便于用户手动验收。固定 GUID 用于识别合成样本，数字 ID 由 Core 分配，每轮不同。重复运行不覆盖之前结果。

真实集合、用户配置、同步凭证和真实账号不进入工具输入；不安装、不重启、不操作设备，不提交或发布。`report.json` 分开记录已运行的主机阶段和 `not-run` 的设备/在线范围，主机成功不能将后者改为通过。

## 责任与事实来源

- [Core 行为回归](../../native/rsharmony/tests/core_interop.rs)：锁定 Anki Core 创建笔记、生成卡片、实际评分和导出；APKG/COLPKG 导入、进度及取消经过生产 Rust C ABI 和注册表。RPC 编号从已校验的基线按方法名查找，不复制手写编号。
- [回归命令](../../tools/test-core-interop.mjs)：校验协议、读取 AnkiDroid 参考版本及源码哈希、记录实际 Core 实现哈希、执行 Core 和迁移行为，保存分阶段结果。AnkiDroid 本地参考版本为 `gradle/libs.versions.toml` 中的 `0.1.68-anki26.05`；若只有源码归档，则记录文件哈希，不能伪造 Git 提交。
- [恢复适配](../../tools/core-interop-recovery.mjs)与[子进程回归](../../tools/tests/core-interop-recovery.test.mjs)：只注入主机文件 API，执行真实 `DataTransferFiles.ts` / `TransferRecovery.ts`。独立 Node 回归使用自建 SQLite；互通命令传入本轮 Core 创建的干净关闭集合，复用同一份 SQLite 与媒体，再由[Core 完整性检查](../../native/rsharmony/examples/core_interop_check.rs)重开三份恢复结果。
- 同一命令执行既有 `data-transfer-files`、`import-options-runtime`、`backend-session-lifecycle` 行为测试，覆盖选择器取消、提交/取消竞争、失败重试、占用释放、重开及恢复失败阻止打开。它们替换平台 API，不证明 ArkUI 观察更新或设备文件选择器行为。

AnkiDroid 参照入口：`libanki/.../BackendImportExport.kt` 透传合并选项、调度、配置、媒体与 legacy；`AnkiDroid/.../BackendImporting.kt` 使用包导入响应；`BackendExporting.kt` 在整库导出前关闭并重开。这里只读取源码并核对其共享 Core 协议，未运行 Android Backend 或 Android 应用。

## 样本与行为断言

样例牌组为 `Interop synthetic::Core 26.05`，七条笔记、十一张卡，标签包含层级标签及中文。

| 样本 | 必须生成的模板序号（从 0 开始） |
| --- | --- |
| Basic | 0 |
| Basic 正反卡 | 0、1 |
| 可选反向，空开关 / 非空开关 | 0 / 0、1 |
| 输入答案 | 0，Core 渲染结果保留 `[[type:Back]]` |
| 改名 Cloze，c1 / c3，c3 重复出现 | 0、2，名称不用于判断 Cloze |
| 标准图片遮罩，矩形 c1 / c6 | 0、5，使用 Core 标准四字段与遮罩语法 |

字段含 HTML、中文、Emoji、MathJax 行内/块公式、PNG 与 WAV 引用；媒体包括实际 PNG、PCM 音频及模板引用的静态 CSS。Core 实际执行 Hard / Good / Easy 评分，生成非空 revlog 和 FSRS 状态；不在测试中模拟调度算法或伪造复习记录。

| 场景 | 直接行为断言 |
| --- | --- |
| latest / legacy APKG 导出→导入→再导出→再导入 | note/card ID、GUID、模板序号、字段、标签、类型/字段/模板配置、卡调度/FSRS/自定义数据、原始复习记录、媒体字节一致；渲染有实际内容与类型特征 |
| latest / legacy COLPKG 往返 | 上述内容及整库未知配置、FSRS 开关一致；数据库重新打开后检查；无媒体包仍保留 ID 与历史 |
| 未知配置 | `other` 中嵌套 JSON 与未来键在类型、字段、模板、牌组预设中保留；COLPKG 保留 collection 配置；APKG 保留接收端未知配置，不将来源全局配置作为整库覆盖 |
| 重复导入 | 数量、ID、字段、调度和复习记录不变，不重复写历史 |
| 已有 numeric ID 冲突 | 接收端原笔记/卡不变；新 GUID 对应 note/card ID 重映射，revlog 引用映射后的卡，无悬挂关联 |
| 较新才更新 / 始终更新 / 保留 | 人为控制合成集合 mtime，覆盖新旧来源及笔记/类型独立策略；保留现有卡调度和历史。锁定 Core 的 Always 在相同 mtime 时仍视为已导入，schema 合并样本也显式设置不同修订时间 |
| 类型 schema 冲突与合并 | 不合并时报告冲突并保留原字段；合并时未来字段和值进入原 GUID，原卡与历史不丢失 |
| 调度、配置及媒体选项 | 导入调度关闭或导出不含调度时，新增卡重置且 revlog 为空；关闭配置导入不引入来源预设；关闭媒体导出时无复制媒体 |
| 同名不同内容媒体 | 保留接收端原媒体；新媒体按 Core 重命名，字段引用实际改写；新文件字节正确 |
| 损坏包与取消 | 损坏 APKG/COLPKG 不损坏接收端集合；观察真实 importing 进度后通过独立通道取消，得到 INTERRUPTED，接收端原有合成笔记/卡快照不变，随后重试成功 |
| 替换中断与恢复失败 | 子进程在 prepared 后终止，新实例恢复原 SQLite、媒体及关联，移除旧 WAL/SHM/journal；恢复 IO 再失败保留完整副本，下次重试从头恢复 |
| 已提交清理失败 | committed 后清理失败不回滚成功数据，下一次启动继续清理 |

legacy 格式会重排未知 JSON 的键，比较其解析后的值；APKG 增加类型 `original_id` 来源记录，快照仅规范化该来源记录。除这两项外保持严格比较。调度快照排除导入管理用的 mtime/USN 和跨集合的牌组数字 ID，牌组名另行比较；note/card ID 与原始 revlog ID/cid 仍逐项比较。复习记录核对 ease、interval、last interval、factor、time 与 type。默认无 ID 冲突时要求保留 ID；冲突用专门映射测试，不把重映射误报为损坏。

## 用户操作的设备验收

用户自行准备专用测试实例和空测试集合，不使用现有个人集合。本工具不选择账号、不发现配置、不安装、不重启。用户未提供设备返回包前，报告保持 Android/HarmonyOS 互通未验证。

1. 将本轮 `sample-latest.apkg` 导入专用测试集合，打开调度、配置选项；核对七条笔记、十一张卡、两种可选反向开关、改名/稀疏 Cloze、输入答案和 IO 矩形显示。再导入一次，数量和历史不变。
2. 检查 HTML/中文/Emoji、行内/块公式、PNG、音频和 IO 的实际渲染、播放及翻面；用同一合成卡评分后导出包含调度/配置/媒体的 APKG 返回包。重复一次 legacy 格式。
3. 在专用空测试集合中执行 `sample-latest.colpkg` 和 legacy 的恢复及导出返回，检查 ID/模板/字段/标签/媒体/复习记录；整库包的覆盖验收只在该专用实例进行。
4. 在该专用实例执行导入取消、损坏包、进程中断恢复，再检查可重开、原数据或已提交结果、无重复笔记和历史。记录设备、系统/客户端版本、操作步骤、选项、返回包 SHA-256 和异常。

设备返回包必须显式确认为仅含本轮合成数据后才能交给后续回归，不将用户真实集合当作测试材料。当前自动入口只生成样本与验证主机往返；没有把设备返回包或 Android 行为自动标记为通过。

## 未验证范围

- AnkiDroid Android Backend 的实际执行、APK/UI 和设备返回包；Anki 桌面 GUI；jidecards C++ NAPI、ArkWeb/媒体播放、输入答案交互、IO 画布及设备进程中断。Core 渲染字符串通过不代表上述显示/交互通过。
- AnkiWeb / 自建兼容服务器的增量同步、全量上传/下载、服务器重定向、媒体增删与断点恢复、跨客户端冲突/USN 合并。必须由用户另行提供隔离测试账号和目标服务器，不能使用已保存凭证或真实账号。
- 电源故障、磁盘硬件损坏、任意压缩炸弹和平台磁盘耗尽；主机恢复证明进程中断协议，不扩大为断电持久化保证。

门禁分别执行 `npm run verify -- repo` 与 `npm run verify -- native`。本任务仅新增主机测试、工具和文档，不改动产品调用链；HAP/设备不由该命令验证。当前工作树的实际结果见[本轮记录](core-interop-2026-10-02.md)，后续每次运行以自己的 `report.json` 和门禁退出码为准。
