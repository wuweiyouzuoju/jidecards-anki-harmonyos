# 同步与集合生命周期

## 同一网络设备配对（2026-10-14）

设备直连标记为实验功能，不保证功能有效。入口标题与展开说明分别复用中英文资源 `device_link_title`、`device_link_hint`；`SettingsStructure` 与 `AppInterface` 使用相同资源，JIDE 同步获得实验性质和有效性边界。

设置 → 同步 → 设备直连由 `components/settings/DeviceLinkSettings.ets` 展示，两端需处于同一 Wi-Fi／热点并打开该页面。`backend/device-link/DeviceLinkService.ets` 拥有 TCP 监听、mDNS 发现、五分钟一次性二维码和认证往返；离开页面释放监听和发现，迟到结果不得更新已离开的界面。`model/device-link/DevicePairing.ts` 校验稳定设备 ID、邀请和持久记录，`LanWire.ts` 处理有界 TCP 分帧及本次连接的挑战证明。

`DevicePairingStore.ets` 独占身份和配对密钥的串行持久化。设备地址仅来自当前发现和再次解析，不作为信任身份持久保存；重启后使用原身份和密钥重新发现并验证对方。二维码密钥只用于本次配对；认证后服务端生成另一把持久密钥，经认证通道发给接收端并由两端保存，旧二维码不能充当重连凭证。后续连接通过保存的密钥证明新的挑战。`LanCrypto.ets` 使用平台 AES256/GCM，认证通过前不发布解密内容。配对记录只发布设备 ID／名称／在线状态给 UI/JIDE，密钥和二维码内容不进入 JIDE 观察。

当前已接通扫描、持久配对、取消配对、个人设备授权、双端学习记录合并、多台个人设备补拉，以及下文的全部卡库与媒体同步扩展。DFS 尚未接通；设备身份认证与数据提交分别报告。现有 AnkiWeb 端点、凭证与媒体任务继续使用原入口，普通设备合并不轮换云端端点或清除云端待同步状态。

### 全部卡库与媒体同步扩展（2026-10-16）

用户要求只扩展，不修改 Anki 上游源码及现有补丁。本实现位于 `native/rsharmony/src/peer_collection.rs` 与 `peer_collection/`，调用锁定 Core 的公开集合构造器、同步服务端序列化/合并函数和 `MediaManager`；未修改调度器或 FSRS。参考的是[开源 Anki 同步服务器接口](https://docs.ankiweb.net/manual/sync-server)，AnkiWeb 在线服务本身[没有公开源码](https://forums.ankiweb.net/t/ankis-growing-up/68610/56)。扩展在本机取得集合独占租约，暂时关闭 Backend 集合，完成扩展事务后重新打开，包括失败路径。此过程会清除当前撤销历史，授权说明明确告知。

新私有服务 `PeerCollection` 的输入由 `tools/protocol/private-rpc.json` 定义，通过生成客户端调用。`model/device-link/CollectionSync.ts` 独占协议顺序，`DeviceCollectionStore.ets` 管理租约、临时文件和流式 SHA256，`DeviceLinkService` 沿用已配对的认证加密通道。当前卡库协议为 v2，包含提交确认后的媒体基线；认证回复声明精确版本，旧版本在导出卡库前明确拒绝，两端均需更新。必须在两端分别开启“允许同步卡库和媒体”；旧个人学习记录权限不会自动授予卡库写入权限，修改任一授权也不清除另一授权。

同步全部牌组、笔记、笔记类型/模板、预设、卡片状态、旗标、标签、集合配置和复习记录。普通合并要求创建身份和结构时间一致；不可合并的结构变化或不同来源卡库会停止，接收设备可明确确认“使用另一台设备的卡库”，先保存 `.device-collection/backups/<token>.anki2`，并通过公开 Core 备份接口创建标准归档，可在现有“本地备份”入口恢复，然后在本机事务中替换。网络协议没有要求远端覆盖本机的模式。替换会重置本机云同步基线，下一次 AnkiWeb 同步可能要求选择方向。媒体仍按独立版本合并，不随卡库替换删除对端未列出的文件。

扩展的逻辑版本、内容摘要与删除记录单独保存在 `.device-collection/collection-state.json` 和 `media-state.json`，不把 Anki 云端 USN 当作设备确认。普通合并保留云端基线，并将接收的数据标为待同步。复习历史按 ID 合并，同 ID 异内容拒绝；卡片先按修改时间保留较晚的手动暂停/旗标/重排，同秒冲突再按毫秒复习记录和稳定版本排序。删除记录在云端清理 graves 后继续保留，普通合并中删除优先于旧设备的并发修改，避免第三台旧设备将内容带回。检测到本机重新出现已确认删除的身份时，只推进扩展侧的恢复代次，不改 Core 的结构时间；双方恢复代次不一致须明确选择全量方向，防止恢复内容被旧墓碑再次删除。并发修改仍存在选择一个版本的边界，不承诺文本逐字段合并或推断异常设备时钟下的真实先后。

每次传完整卡库元数据；媒体根据 SHA256 差异请求并分块传送，包括同名更新和删除。[官方媒体规则](https://docs.ankiweb.net/manual/syncing#media)要求先完成同步再传播删除：本扩展只为已确认成功传输的文件保存可传播的删除基线，单次导出或中断的首轮同步不构成基线。单个媒体上限 100 MiB、单次媒体包 4 GiB、元数据 64 MiB、对象 250000 项、媒体/标签各 100000 项；网络头先检查相应上限再创建接收文件。文件名拒绝路径和跨平台保留字符，不跟随媒体符号链接。接收后先校验并缓存全部需要的媒体，再启动卡库写入。卡库事务提交前刷盘 `collection-commit.json`，同时记录事务前后修改戳、版本表及媒体提交意图；恢复按修改戳判断 SQLite 已提交或已回滚。日志未恢复时禁止后续普通集合调用越过它；集合打开、另一次设备任务和云同步也重放媒体日志。替换同名媒体前把旧内容保存到 `media-backups/`。备份、缓存与删除版本目前保留，尚无自动整理入口；大库扫描耗时和磁盘占用需要设备验收，不承诺硬件损坏下恢复。

取消或断连不撤销另一端已提交的事务，失败不会显示双端成功，可重新发起同步；当前没有网络断点续传。清理仅限本任务临时包，不删除备份/恢复日志。三台设备需逐对同步传播内容，当前“与所有在线个人设备合并”仍仅用于旧学习记录同步。媒体、卡库和旧进度同步共用集合互斥；JIDE 使用共享设置目录及组件发布的授权、结果、覆盖确认状态，不获得新增写入权限，也不读取码值、密钥或同步包。

验证入口：`native/rsharmony/tests/peer_collection.rs` 使用真实 Core 卡库与本地标准同步服务器，覆盖内容、旗标、同秒复习、待上传数据、删除传播、结构拒绝/备份替换、损坏媒体回滚和日志恢复；`device-link-runtime.test.mjs` 使用生产编排与真实 TCP/AES-GCM，覆盖独立双端授权、分块同步、接收端替换、校验失败及重试；`device-link-progress-store.test.mjs` 同时验证新文件适配层的短读短写、生成 RPC、租约及自有包清理。完整验证结果见本轮交付。以上不证明真实 HarmonyOS 两机 mDNS、热点、扫码、大库性能或真实 AnkiWeb 账号行为，实验性质保留。

本轮审计发现并修复以下边界，回归保存在上述入口，避免依赖对话记忆：

| 问题 | 扩展层处理与复现入口 |
| --- | --- |
| 未完成首轮同步就删除媒体会删掉对端完整文件 | 双端提交确认后才保存删除基线；`audit_unconfirmed_media_deletion_preserves_the_other_devices_complete_file` |
| 较晚的暂停/旗标被较早的远端答题覆盖 | 修改时间先于同秒回答排序；`audit_later_manual_suspend_and_flag_survive_an_earlier_remote_review` |
| 同一卡片 ID 指向不同笔记/模板时静默覆盖 | 写入前拒绝身份冲突；`audit_card_id_collision_with_a_different_note_is_rejected_before_writes` |
| SQLite 已提交但版本表写入失败时丢失媒体恢复意图 | 卡库与媒体意图共用持久提交日志；`audit_committed_collection_recovers_its_media_after_a_ledger_disk_failure`，以及 `lib.rs` 的 `pending_peer_recovery_blocks_normal_rpc_and_failed_open_leaves_core_closed` |
| 删除与并发复习冲突、恢复后旧删除重放 | 删除优先、级联卡片引用检查，恢复代次要求明确方向；`audit_delete_and_concurrent_review_do_not_resurrect_or_block_the_collection`、`audit_restoring_deleted_identities_requires_direction_and_explicit_replace_converges` |
| 过滤牌组原牌组缺失、损坏清单、旧媒体检查快照 | 正常过滤状态原样保留，缺失引用须先清空过滤牌组或检查卡库；卡库写入前校验清单结构与必需对象；内部关闭/重开使旧媒体检查 token 失效；`audit_filtered_state_is_preserved_and_missing_original_decks_are_rejected`、`audit_malformed_metadata_is_rejected_before_collection_writes` |

前四项在修复前已通过回归复现失败，修复后通过。集合配置接收后通过 `notifyFsrsStateChanged()` 通知原有拥有者重读，避免已挂载设置与统计页显示旧开关；不改变 FSRS 或调度计算。ArkTS 规则扫描中的三条 `import type` 提示均位于允许该语法的纯 `.ts` 文件，属于误报，实际编译结果单独验收。

2026-10-16 卡库/媒体审计验收：`npm run verify` 完整通过，包含全仓 3452 项 Node 检查、全部真实 Core 主机测试（其中卡库/媒体 16 项）、sandbox、RPC 索引、协议/Core 对照、双架构 Rust 及 clean 签名 HAP。另行执行启用 `anki-core` 的 clippy 且以警告为错误，通过；HAP 精确警告检查未接受项为 0。相对实施前快照，472 个上游源码/协议文件内容一致，现有 `tools/patches` 和 `UPSTREAM.lock` 无改动。日志、源码指纹、规则扫描及签名包保存在 `.local/peer-sync-audit-20261016/`，包的大小与 SHA256 见 `artifact/acceptance.json`。本轮未安装设备，真实两机网络/后台/页面外观、大库性能及真实 AnkiWeb 账号仍未验收；本地标准服务器测试不能替代这些范围。

本轮验证记录：`CARGO_BUILD_JOBS=2 npm run verify` 的环境、全仓、Rust 主机、sandbox、RPC、协议/Core 对照及双架构 clean 签名包门禁通过；启用 `anki-core` 的 clippy 零警告通过。之后的界面失败刷新补充通过 `npm run verify -- repo`、设备网络/文件适配回归及 `npm run build:app -- -SkipRust -Clean -ArtifactDirectory .local/device-full-20261016/artifact`；此步只改平台源码，复用本轮已构建的双架构原生库。标准服务器专项还验证媒体上传、同名更新、删除、云端确认后的三端直连不会复活已删文件。Anki 上游源码和协议的开始/结束摘要比对无变化，现有核心补丁无修改。产物与日志保存在上述本机目录；未安装设备，未访问真实 AnkiWeb 账号。

直接回归：`device-pairing.test.mjs`、`device-link-runtime.test.mjs`（进入 `npm test -- sync`）；后者执行生产平台适配源码，以 Node TCP 和真实 AES/GCM 替代 Kit 验证两端配对、重启后新端口重连、身份撤销、篡改和持久身份竞争。它不证明 HarmonyOS 的 mDNS、扫码、权限、热点路由或两机行为；这些仍需设备验收。新设置与 JIDE 共用 `SettingsStructure` / `AppInterface` 声明，当前状态由组件发布，不新增 JIDE 写入权限。

2026-10-14 的初始配对版本通过增量签名 HAP，产物位于 `.local/device-link-20261014/artifact/`；该包不含之后接入的学习记录合并。后续数据层验证范围见下文，不能用配对包认证新的原生输入。未安装设备，也未执行分布式文件系统拷贝或真实两机验收。

分布式文件系统候选只用于不可变传输包与媒体拷贝，活动集合保留在本地。官方说明是文件互访与 Close-to-Open 一致性，不主动复制完整文件；离线保留需先拷贝到本地。当前官方指导要求同账号、同应用；这不能代替面向他人的通用配对分发。锁定 Core 在 `storage/sqlite.rs` 开启 WAL 和独占锁，不能将 `collection.anki2` 放入分布式目录供两端同时打开。后续具体适配应核查目标设备的 `connectDfs` 能力并单独验证拷贝完成与校验，不从共享路径可见推断文件已完整下载或卡库已合并。

### 个人设备学习记录合并

用户明确要求个人设备直连同步合并学习记录，并继续保留 AnkiWeb；不能用仅传 APKG 或复制文件代替此目标。[Anki 官方冲突说明](https://docs.ankiweb.net/manual/syncing#conflicts)说明正常增量同步可保留两端复习历史，同一卡片在两端复习时保留双方历史并使用最近回答的状态。锁定 Core 的 `sync/collection/chunks.rs` 分别执行 `merge_revlog` 与 `merge_cards`；前者调用按记录 ID 插入的 `storage/revlog/add.sql`，后者按待同步状态和记录修改时间选择卡片状态。因此“保留双方复习历史”与“确定唯一当前调度状态”是两个需要同时验证的行为，不自行累加间隔或在前端重写调度。

`model/device-link/ProgressSync.ts` 拥有传输顺序、64 KiB 二进制块、长度和 SHA256 校验、两端提交确认；认证加密沿用 `TrustedLanConnection`，远端不提供本机路径。`DeviceProgressStore.ets` 取得 `SyncActivity` 集合租约并登记 `AutoSyncScheduler` 操作，经过生成的 `PeerProgressRpc` 调用原生私有服务。临时文件在本机 `.device-progress/` 中生成；Core 排他创建文件，任务仅清理自己成功创建的 token。取消状态归 `DeviceLinkService`，通过 `isCancelled` 查询传给两端编排，在文件校验完成后、接受 Core 合并前再次检查，防止校验期间取消后又启动新写入。网络取消或页面离开不打断已进入 Core 的事务，真实调用及文件清理完成后才释放占用。两端提交是各自的事务，连接中断不能回滚另一端已提交的数据，重试仍依靠记录身份去重。

`native/rsharmony/src/peer_progress.rs` 校验私有 RPC 方法并转发已跟踪的 `tools/patches/anki-peer-progress.patch`。Core 在自己的锁内导出有界 JSONL 快照，并用单事务合并：同记录 ID 同内容去重，同 ID 不同内容拒绝并回滚；新复习记录及更新卡片使用 `usn=-1`，集合的云端 USN、last-sync 和 schema-change 不变。卡片状态采用 Core 已算出的快照，不重新调度；以毫秒复习 ID 选择最近回答，同一历史再按修改时间及稳定状态比较解决精确相等的冲突。合并版本需要推进时仅提高卡片修改时间，保证待上传状态能被常规同步接收。牌组位置及旗标仍保留接收端值，不混入学习记录同步。

当前要求两端为同一人的同源卡库，卡片数量、ID、笔记 GUID/类型、模板序号、创建时间、结构版本、FSRS 开关、调度版本、创建时区和有效日切一致；过滤牌组须先清空。身份或配置不一致时整次事务拒绝，提示先用 AnkiWeb 建立共同基线。它不创建新卡片、更新笔记文本/模板、传播删除或合并不同人的进度。单文件上限 512 MiB、单行上限 512 KiB；每次先传完整历史快照，尚不提供增量索引或断点恢复，失败后重新导出并依靠记录身份去重。时间排序依赖设备时钟，时钟异常与全量云同步覆盖仍需单独处理，不能承诺任意时钟条件下推断真实答题先后。

配对后两端分别开启“这是我的个人设备”，使用独立的“合并学习记录”操作行发起合并；“与所有在线个人设备合并”逐台补拉，直到一整轮两端均无新增历史或状态更新，最多五轮。持续变化或某台失败时分别报告，不把一轮传完当作整个组收敛。UI 与 JIDE 共用设置目录，发布授权设备 ID、每台操作的可用状态、确认状态和实际任务结果；不新增 JIDE 写入权限，不发布密钥或二维码。设备直连区默认收起；标题复用 `SettingsActionRow.expanded` 表达展开/收起，使用相同边距与公共箭头；箭头沿用既有菜单行的收起向右、展开向下及中心旋转动效，不能另设上下方向。展开通过 `ExpansionReveal` 共享设置页 List 滚动器，在正高度布局回调内直接下滑一次，不设延时或等待网络；收起和离页取消待执行滚动，传输中的状态与取消入口在收起时仍可见。正文复用设置卡片、动作行、开关及既有同步图标；设备名称只展示身份与在线状态，执行动作不显示导航箭头。合并完成显示本机新增历史/更新卡片数；取消配对沿用系统确认框，返回或取消不修改配对记录。二维码不再插入正文，由 `DevicePairingDialog` 组合公共 `NativeDialogHost`、`DialogFrame` 和 `DialogHeader`；关闭按钮、遮罩与系统返回均走窗口代次守卫，配对完成/过期自动关闭，离页释放窗口，旧回调不能关闭新码。JIDE 发布展开与弹窗状态，不发布码值。

要求与验证：

- 同源卡库在两台设备离线学习不同卡片后，双方复习记录和对应调度状态均保留。
- 同一卡片在两端离线复习后保留双方记录，同一秒回答以毫秒历史确定当前状态；状态计算仍来自锁定 Core。旗标不纳入直连学习记录合并，保留接收方值。
- 重复同步、失败重试和重启后同步不得重复计数；同记录 ID 但内容不同须识别为冲突，不能简单当作已存在而静默丢弃。标准 Core 的按 ID 忽略插入不足以证明此边界已解决。
- 设备间接收的变更仍能上传 AnkiWeb；交替进行设备同步与云同步后，不丢记录、不重复记录，不错误清除云端待同步状态。
- 三台及更多个人设备在补拉完成后复习记录与当前状态收敛；每台分别报告待处理、失败或完成。

直接验证入口：`native/rsharmony/tests/peer_progress.rs` 使用临时真实 Core 卡库验证离线双方历史、同秒三端状态、重复/重开去重、损坏/身份/同 ID 内容冲突回滚及 FSRS 状态与本地标准同步服务器交替收敛；没有访问真实 AnkiWeb 账号。`device-link-runtime.test.mjs` 执行生产网络适配与真实 Node TCP/AES-GCM，覆盖个人授权、分块传输、三端补拉和哈希失败；`device-link-progress-store.test.mjs` 执行生产文件适配和生成 RPC，验证真实临时文件的短读短写、哈希、租约及自有文件清理。这些主机测试均已通过，不证明 HarmonyOS mDNS、扫码、热点、页面切换或真实账户行为。

### 2026-10-16 直连复核

按上述要求复核配对/持久身份、双端个人授权、传输校验、事务占用、取消/离页、三端补拉、失败去重和云同步兼容性。修复离页期间发现解析返回后仍可连接、主动连接未纳入宿主清理、接收端取消误报普通失败，以及校验期间取消后仍开始 Core 合并的问题。主动与被动连接均由 `DeviceLinkService.channels` 拥有，正常关闭移除主动连接；停止先使异步代次失效，随后关闭网络并把在线状态清零。认证期间和持久状态读取的迟到结果也检查代次。`device-link-runtime.test.mjs` 新增真实 TCP/AES 回归，覆盖迟到发现、离页关闭主动连接、已接受事务完成及双端校验期间取消；测试已在修复前复现对应故障。

`cargo test -p jidecards_core --features anki-core --test peer_progress` 的四项真实 Core 回归全部通过，覆盖双方历史与状态、三端同秒答题、重开去重、损坏/身份/历史冲突回滚和与本地标准云同步服务器交替同步。设备配对/网络/文件适配、牌组菜单及 JIDE 观察专项通过；按 home/sync 选择器去重并复用已通过专项后，关联的707项检查通过（含文档、ArkTS 组件与资源约束），复现入口仍为 `npm test -- home`、`npm test -- sync` 及 `ai-agent-app-structure.test.mjs`。`npm run build:app -- -SkipRust -ArtifactDirectory .local/device-link-audit-20261016/artifact` 增量签名构建通过，未接受警告为0；本轮未修改原生输入，复用现有双架构原生库。证据保存于 `.local/device-link-audit-20261016/`。该复核针对旧学习记录功能，之后的卡库和媒体扩展见上文。APKG 分发和 DFS 未实现；本轮未安装设备，真实两机 mDNS/扫码/热点、后台、性能及真实 AnkiWeb 账户没有本轮设备验收证据。

2026-10-14 集成验证：`npm run verify` 的环境、全仓 3403 项 Node 测试、Rust fmt/clippy 与全部 Core 主机测试（含四项学习记录回归）、sandbox、RPC 索引和 30 项协议/Core 对照通过；双架构 Rust 与 clean HAP 编译成功。初次 HAP 警告门禁指出清理函数缺少异常声明，修正后按实际 ArkTS 变化补跑增量签名 HAP，未接受警告为 0；追加取消配对和多设备取消回归后，最终设备连接/存储/配对及 JIDE 结构 43 项检查通过。原生输入未再变化，复用已通过阶段，未重新执行整条 `verify`。最终包及构建/警告报告保存于 `.local/device-link-20261014/progress-artifact/`，日志在同级 `progress-verify.log`、`progress-hap-final.log`、`progress-final-tests.log`。未安装设备，真实两机、热点、页面尺寸与主题外观及真实 AnkiWeb 账户仍未验收。

2026-10-14 后续 UI 对齐验收：展开/布局/收起、二维码窗口完成/过期/返回/旧回调/离页、公共设置行箭头及 JIDE/文档等相关 95 项检查通过；签名增量 HAP 通过，未接受警告为 0。最终 UI 包与构建/警告报告位于 `.local/device-link-20261014/ui-artifact/`，覆盖之前 `progress-artifact/` 的 UI；日志在同级 `ui-alignment-tests.log` 和 `ui-hap-final.log`。同类标签选择和牌组“更多”也核对了直接布局回调，没有秒级滚动延时。随后修正设置行箭头方向与动效，相关 31 项回归和增量签名 HAP 通过，未接受警告为 0；同级日志为 `ui-arrow-tests.log`、`ui-arrow-hap.log`，测试直接对照既有 `MenuItem` 的方向规则。原生数据层输入未变，复用前述 Core/协议验证；尚未做真机滚动耗时、窄/宽屏与最终外观验收。

面向其他人的牌组分发仍保留接收者的独立学习记录；分发能力未接通，不能通过个人设备授权替代接收方的牌组导入流程。

[返回任务索引](../../PROJECT_CONTEXT.md)

同步按钮与面板共用 `ActionStatus`；`SyncSession` 的 failure 与冲突 attention 分开，暂停/等待不展示成功。反馈责任与验证范围见 [交互恢复与局部动效](interaction-feedback.md)。

不依赖账号的 Anki / AnkiDroid 核心回归见[核心互通](core-interop.md)：`npm run test:interop` 生成隔离 APKG/COLPKG 与结果报告。它不证明线上同步通过；2026-10-07 的独立真实 AnkiWeb 集合与隔离服务器媒体结果见[验收记录](ankidroid-high-priority-2026-10-07.md)，不扩大为完整线上故障矩阵通过。旗标／星标另有 [card_marking.rs](../../native/rsharmony/tests/card_marking.rs) 的临时 SimpleServer＋两个独立 Core Backend HTTP 同步回归，覆盖普通双向修改、全量、撤销、失败重试与重开；这是本机协议证据，未运行 Android/HarmonyOS 应用。社区调查未找到可直接采用的标记冲突修复后，按用户选择启用 JideCards 待同步标记优先：混合客户端冲突保留 JideCards 旗标／exact marked，整体记录仍按上游 mtime 选择；两个 JideCards 均待同步时由后同步端的标记胜出并传播。上传前为剩余待同步卡片／笔记准备更大的标准修订时间，故不是纯字段时间戳合并。名称仍走原集合配置规则，两个未修改 AnkiDroid 之间不受影响。见[源码对照](flags-marking-audit-2026-10-03.md)和[当前决策及社区来源](../decisions/2026-10-03-marking-sync-priority.md)。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：AutoSyncScheduler 保存意图；SyncActivity 拥有集合占用；SyncSession 执行同步，根同步面板展示快照。
- 快速反馈：`npm test -- sync`；完整验收见 [验证说明](verification.md)。
- 审查与修复记录：[2026-09-27 同步实现审查](sync-audit-2026-09-27.md)；媒体任务唯一启动/消费、首页统计独立队列和设置分组保护的当前契约见下文。

## 自定义同步端点与证书边界

`components/settings/同步分组.ets` 提供自定义服务器地址，`同步凭证存储` 保存端点，实际请求沿 `SyncSession` → `同步服务` → Core。系统受信任证书的 HTTPS 使用平台/Core 的正常校验。

`同步服务.设置自定义证书` 只有 Service 封装，当前 UI/JIDE 没有调用者，也没有证书选择、持久化、重启恢复或移除流程。不能把生成的 `Sync_set_custom_certificate` RPC 或该封装当作可用的私有 CA 配置功能。核查时同时搜索 Service 调用者、`同步分组` 和生成调用清单，不从 README 或历史盘点反推已接通。

## 同步任务与页面可用性

首页常驻同步按钮的空闲标记对照本机 `D:/Projects/AnkiDroid/AnkiDroid/src/main/java/com/ichi2/anki/DeckPicker.kt` 的 `updateSyncIconFromState` 和 `deckpicker/DeckPickerViewModel.kt` 的 `fetchSyncIconState`：未登录与 Core `FULL_SYNC` 显示红色圆圈感叹号，`NORMAL_SYNC` 显示提示圆点，`NO_CHANGES` 无标记。`model/HomeSyncStatusController.ts` 独占检查代次和合并请求，调用既有 `同步服务.同步状态检查`；状态读取可联网，但不提交同步，不受自动同步开关控制。仅在前台首页、集合可用且无操作/弹窗/同步任务时读取，失败按 AnkiDroid 回到普通图标并记录诊断。账号/服务器变化、导航、后台、任务启动及销毁后的旧结果不得发布或保存重定向端点；返回首页、集合变更和任务关闭重新检查。实际任务的旋转圈、冲突/错误感叹号及排队文案优先于空闲标记。

`HomeSummaryHeader` 将标记叠在原 `IconActionButton` 内，原按钮独占点击区域，标记不处理点击、不增加父级间距，也不参与外缘尺寸；宽窄按钮仍由 `HomeHeaderLayout` 缩放，安全区仍只由首页外层贡献。朗读名称与 `AppInterface` 同用 `homeSyncLabelKey`；首页发布真实 `sync_account_state`、`sync_indicator`、`sync_status` 给 JIDE。未登录点击走原设置登录入口，需要全量同步点击走原同步会话及方向确认，已有任务点击打开详情。直接回归：`tools/tests/home-sync-status.test.mjs`；真实联网和设备外观需单独验收。

2026-10-06 验证：状态/竞态和 JIDE 读取用例、同步领域回归通过；首页唯一失败为 `home-composition.test.mjs` 的详情栏测试未装配 `detailHeaderActionHeight`，使用修改前首页源码仍复现。最终界面契约检查另有 `ui-shell-contract.test.mjs` 因共享工作区设置页按钮改动仍匹配旧返回文案而失败，本任务没有修改该入口或削弱断言。中间构建遇到同期设置/JIDE 的类型和图标资源错误；待这些输入就绪后，最终增量签名 HAP 复核通过，unexpected=0，含首页可见性守卫。记录和最终包在 `.local/home-sync-badge-2026-10-06/final-artifact/`，相关测试日志在上级目录。本次未安装设备，未验证真实联网和最终外观。

普通与全量同步采用 Anki 桌面端的所有权方式：Core 自动启动媒体后，`SyncSession.启动媒体阶段()` 只监测，不再调用 SyncMedia。冲突重检用 `syncMedia=false`，若重检已经完成集合合并，则显式传 `startMedia=true` 启动一次。保留服务端媒体 USN 和重定向端点，不能把这些路径改成无条件再启动媒体。`媒体同步状态()` 会消费一次性终态，只有根同步宿主（包括其销毁清理）可以调用；媒体管理与删除牌组后的媒体清理只读 `SyncActivity.isActive()`，整个同步租约期间保守禁止清理。回归：`sync-media-ownership.test.mjs` 覆盖快速失败、全量/无变化/重检、其他页面抢先观察及错误保留。

媒体启动被接受后立即读取一次进度，后续每秒检查；打开同步详情和恢复前台时，通过 `SyncSession.pollMediaStatus()` 立即刷新主页按钮及详情快照。读取串行，交互触发在已有读取后合并补查一次；完成、失败和销毁后，旧定时器不得再消费终态。销毁清理等待当前读取落定后才中止并确认线程退出，防止两次状态查询争抢一次性结果。Core 暂无媒体进度时保留上一份有效计数。主页沿原 `statusChanged` 发布 `sync_indicator` / `sync_status` 给 JIDE，入口及能力声明不变。回归：`sync-media-refresh.test.mjs` 覆盖普通、全量和重检路径的首读、前台/详情刷新、快速终态、并发及销毁；设备上的后台挂起、最终按钮重绘和真实网络传输仍需单独验收。

按阶段提示成功：卡片提交后提示“卡片数据已同步，可以开始学习”，媒体结束后明确提示“媒体同步完成”，每个阶段只提示一次，不能使用两条泛称“同步完成”的提示。关闭媒体同步时，集合结束仍只提示一次整体完成。自动静默任务不打扰，用户主动打开详情时允许展示完成提示。媒体失败保留卡片已保存的说明。媒体详情可关闭，任务仍由根宿主持有；失败重试仍使用原有手动同步入口和租约，不另起无所属的并发任务。既有自动同步默认关闭及升级迁移规则不变。

设置目录、外观、帮助、AI 等独立内容可在集合同步期间直接进入。`设置面板.openSection()` 对调度器、数据维护和高级分组按 `SyncActivity.isCollectionBusy()` 保护；设置页的牌组查询等待集合释放并检查离页状态，直接导出/备份入口也检查集合占用。卡片读写、提醒等真实依赖集合的入口仍保留事务保护。`home-sync-refresh-runtime.test.mjs` 验证设置导航和数据库分组的差异。

## 自定义服务器弹窗与生命周期

`components/settings/同步分组.ets` 仍拥有地址草稿、校验错误、登录状态和保存占用；`自定义服务器弹窗` 通过五个 `@Link` 共享这些状态，持久化继续由 `saveCustomSyncServer` 完成。`createServerDialog` 必须是字段初始化的箭头工厂，每次打开仍重建控制器并取当前动效参数。普通方法中的 `CustomDialogController` 虽然能编译，但目标 SDK 保留 `this.serverInput` 等原始值，打开时 `SynchedPropertyTwoWayPU` 无法订阅；换成裸 `$field` 也可能未转换。不能用生成字段 `__field` 或捕获后跳过弹窗掩盖问题。

离开设置时关闭并释放控制器，迟到的原生关闭回调只执行 dismiss，不再读取已销毁状态。地址保存、登录和自动同步偏好提交可独立完成；迟到成功/失败不更新已销毁 UI。登录开始时捕获账号、密码和端点，成功后仍持久化已接受请求的凭证，密码不落盘；离开自动同步确认框不视为授权。设置目录、地址规范化、账号保护和 JIDE 能力入口保持原有语义。

窗口和表单外壳已接入公共 `NativeDialogHost` / `DialogFrame`：字段工厂只声明实际 builder 并消费公共窗口配置，`openServerDialog` 给公共宿主传入保存守卫与取消草稿回滚。窗口退出调用 `dispose()`；表单遮罩和标题关闭继续交 `closeServerDialog`，保存完成主动关闭仍不回滚已保存地址。公共外壳提供键盘、安全区和正文滚动限高；不再在服务器组件重复固定宽高、卡片内边距或原生遮罩。

后续同日统一验收已连接 SLG-W50 / API24，使用该设备既有测试签名覆盖安装并验证自定义服务器的打开、非法地址错误、关闭/重开、返回与遮罩关闭；API23 手机模拟器另验键盘与取消草稿，均未修改已保存地址。上述初始修复的“没有连接设备”是先前验证阶段，当前实际覆盖及剩余设备范围见 [原生弹窗验收](appearance.md#视觉与交互一致性)。

回归入口：[check-sync-server-compiled.mjs](../../tools/check-sync-server-compiled.mjs) 执行真实 CompileArkTS 输出的打开、渲染、输入、保存、取消、重新打开与生命周期；全应用位置扫描在 `arkts-component-fields.test.mjs`，原业务回归在 `sync-automatic.test.mjs` / `sync-settings.test.mjs`。2026-10-09 本次检查复现旧产物的订阅失败，新 release 产物通过；其余原生弹窗无同类 `@Link`，设置面板的 `activeSection` 在父页面 build 中正确传状态对象。签名 release HAP 与原入门编译产物检查通过，新增编译警告为零。没有连接设备，HarmonyOS 6.1 / API24 的手机和平板交互尚未验收；Node 检查不代替 ArkUI 重渲染、字节码和真机。

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

备份面板“立即创建备份 / 恢复所选备份”使用公共按下态按钮的 `fillWidth` 填满各自等权区域；行只拥有8vp中间间隔，没有额外水平边距。左右按钮外缘到面板边界均为 `DialogFrame` 的16vp内边距，宽度变化与外层安全区不增加单侧间距。

2026-10-07 19:48模拟器竖屏实际检查：备份列表加载后，两按钮等宽、左右外侧到面板边缘对称，复用原公共按钮样式；未触发恢复写入。构建及同轮帮助/按钮验收记录见[帮助规范](in-app-help.md#帮助入口与弹窗规范)，横屏/无安全区组合未在本轮扩大声明。

FSRS 的全局开关、牌组高级选项中的“启用 FSRS”和统计页状态统一来自 Anki collection 的 `BoolKey::Fsrs`；参数及重排选项不代表开关。首次启动自动开启仅执行一次。SyncSession 在集合同步前后读取实际值，仅将 `true→false` 上报为关闭变化；媒体失败不丢失已提交集合的结果。`FSRS控制器` 的 `FSRS_STATE_REVISION_KEY` 仅通知设置/统计页重新读取，不缓存或覆盖开关；牌组选项保存也发送通知。自建服务器复现可核对 `sync: FSRS before/after` 日志，缺失字段在底层默认关闭，不能据弹窗断言用户主动关闭。

自定义服务器入口为 AnkiWeb 云同步卡片内、登录表单下方的一行小字，展开分组后点击打开居中弹窗（手机窗口宽度 < 600vp 时 bindSheet 只能底部弹出，故用 `CustomDialogController`）；取消丢弃地址草稿，保存失败在弹窗内显示。同步设置支持 AnkiWeb（服务器地址留空）与兼容 Anki 26.05 的自建服务器。`model/SyncSettings.ts` 校验 HTTP(S) 基础 URL、保留反向代理子路径并补齐末尾斜杠，也提供手动/自动共用的进程内互斥。`同步凭证存储.ets` 分开保存用户配置地址和服务端重定向端点；注销保留用户配置，切换服务器清除旧 hkey、重定向和待同步媒体标志，密码不落盘。

自动同步在新安装及旧版升级后均默认关闭。`同步凭证存储.ets` 固定使用 `auto_sync_enabled_v2`，不再读取旧 `auto_sync_enabled`，因此旧版明确开启的用户也须在新版重新确认；之后的开关选择跨启动保留，不随每次启动重置。无偏好或读取失败时不自动连接，凭证、服务器和媒体偏好不受影响。设置中每次从关闭切到开启，先提示首页短暂卡顿、点开牌组等待和媒体流量等影响，确认后才持久化；取消、离页或保存失败不启用。首页常驻“同步”按钮和设置页“立即同步”统一交给 HomeSyncController.requestManual()，已有任务只打开详情，不重复联网；首页未登录时打开设置并提示登录。手动与自动共用根 Navigation 外的同步宿主；设置页手动请求进入 AutoSyncScheduler 后返回首页，常驻同步按钮的点击区与图标尺寸由 HomeHeaderLayout 提供，实际集合/媒体传输（syncIndicator=syncing）时按钮固定槽位显示旋转圈，成功显示勾号，失败显示叉号。冲突和失败保留可点击的红色圆圈感叹号，避免未结束的任务没有可见处理入口；排队、为学习让路、中止和完成不显示传输旋转圈；同步按钮仍常驻，任务关闭后恢复空闲标记。同步中的圆圈和红色圆圈感叹号均可打开任务详情，完整进度文案保留为无障碍标签。冲突/错误仍保存在同步宿主中，通过“设置 → 同步”手动入口重新打开当前任务详情；不因收起详情销毁任务或自动选择覆盖方向。自动正常传输不弹详情，成功立即收起。手动同步在集合及已启用的媒体同步全部成功后，通过 `notifySyncResult()` 立即显示完成 Toast 并关闭任务；用户打开过的自动任务详情也在完成时提示。取消保留完成态的 3 秒延时，避免下一次点击手动同步只打开上一次结果；自动静默任务仍不打扰，失败/冲突保留处理入口。回归由 `sync-settings.test.mjs` 覆盖旧开关失效与重新开启持久化，`sync-automatic.test.mjs` 覆盖完成反馈和媒体收尾。启动、回前台、返回首页与学习完成时排队，空闲 3 秒检查，活动学习/编辑/导入/后台不启动新任务。开始学习取消待执行检查；已运行的增量同步经 SyncActivity.requestStudyPriority 让路，原生 AbortSync 单独转发、不等待普通调用锁或 NAPI 工作线程；普通 RPC 仍串行。取消句柄注册竞态由任务独占期间重试解决，回滚/提交完成且取消调用落定后释放集合，手动待同步意图不受自动开关影响。集合提交与取消竞争时保留成功结果及已启动媒体；媒体不锁学习。冲突保留在任务详情中，不占集合，用户确认方向前重新检查最新方向、端点与 USN；已明确启动的全量替换不可被学习自动打断。FSRS 提醒等待空闲首页。EntryAbility.onBackground 只为当前任务申请短时收尾，不保证后台常驻或杀进程后完成。扩展触发时机复用调度器，调整让路协议复用 SyncActivity；不要另建同步流程。

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
