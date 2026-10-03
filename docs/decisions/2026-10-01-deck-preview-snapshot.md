# 首页范围预览使用独立集合快照

## 决策与原因

首页预览提供今日待学、今日到期、今日已学、全部卡片四个范围，使用与牌组长按菜单一致的 Popup 几何。范围在进入预览时固定，翻面和切卡仅修改本机展示状态。

正式学习的取卡并非纯查询：选择牌组、首次建立队列和跨学习日恢复隐藏都会修改集合或内存状态。直接调用正式调度器后恢复数据无法可靠保留正在进行的队列、撤销及同步状态。另行实现每日额度和隐藏规则也会偏离锁定 Core。

因此在 Core 集合锁内使用 SQLite backup 创建包含 WAL 数据的一致副本，释放源锁后打开独立 Collection，并复用锁定版本的搜索和队列实现。今日待学读取现有队列及当天已排定的学习步骤，不模拟答案；今日到期与今日已学使用 Core 搜索定义；全部范围包含子牌组以及暂停/隐藏卡。今日范围的跨日恢复只在副本中执行。

## 实现与影响

- ArkTS 的 `DeckPreviewSession` 管理请求代次、顺序和销毁；`DeckPreviewService` 只发本地 RPC 1001/0。此编号独立于锁定 Anki protobuf 与生成的服务索引。
- Rust FFI 适配位于 `native/rsharmony/src/deck_preview.rs`。上游源适配保存为 `tools/patches/anki-deck-preview.patch`，`tools/build-native.ps1` 与跨平台 CI 入口 `tools/test-anki-core.mjs` 检查并幂等应用，添加 SQLite backup feature 和一个公开的快照取卡入口。
- 临时文件放在集合父目录，兼容 HarmonyOS 沙箱；关闭副本连接后删除文件。失败不回退到正式集合取卡。源集合持续打开，当前牌组、正式队列与撤销状态保持原样。
- 复制耗时和磁盘空间随集合大小增长，备份期间源锁会阻止写入。首页加载与弹层参与既有同步/公告占用，返回或后台丢弃迟到结果。现有渲染与用户明确编辑入口保持各自职责。

## 验证

运行 `tools/tests/deck-preview-session.test.mjs`、既有预览运行测试、菜单测试和构建补丁测试。真实 Core 的 `native/rsharmony/tests/deck_preview.rs` 对比预览前后数据库全部相关表、撤销字节及正式队列首卡，覆盖额度、子牌组、历史去重、隐藏/暂停、跨日与失败请求。完整 `npm run verify` 还包括原生、RPC 与双架构签名 HAP；Popup 和 ArkWeb 实际交互另做设备验收。领域入口见 [学习、预览与媒体](../development/study-media.md)。
