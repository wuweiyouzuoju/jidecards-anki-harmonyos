# 核心互通回归记录（2026-10-02）

[重复执行入口与范围](core-interop.md)

本轮在共享工作树增加 `native/rsharmony/tests/core_interop.rs`、合成媒体、Core 测试依赖、`tools/test-core-interop.mjs`、恢复/命令行为测试和文档入口；保留其他任务已有及并行修改。没有读取或修改用户集合、凭证或真实账号，没有操作设备，没有提交或发布。

锁定事实：`UPSTREAM.lock` 为 Anki 26.05 / e64c6b1；`D:/Projects/AnkiDroid` 是源码参考，其后端为 `0.1.68-anki26.05`。协议指纹、四份 AnkiDroid 源码及八份实际 Core 实现的 SHA-256 保存在每轮报告。没有执行 Android 应用或将源码检查作为互通通过证据。

## 当前验证记录

`npm run test:interop` 最终复跑通过：协议门禁、十二项 Core 行为、四组迁移/会话测试、三份恢复结果的 Core 完整性检查均通过；报告保存在 [`tmp/core-interop/run-9lhdmX/report.json`](../../tmp/core-interop/run-9lhdmX/report.json)。同目录保留五份 APKG/COLPKG、七条笔记/十一张卡/三条复习记录的 `expected.json`、三份恢复集合和分阶段日志，报告包含全部六份交付文件的哈希。先前独立成功轮次 `run-1wjV4c` 也保留，重复执行未覆盖旧结果。

`npm test` 与 `npm run verify -- repo` 均通过全部 Node 测试，最终日志分别为 `tmp-core-interop-all-tests.log` 和 `tmp-core-interop-repo-delivery.log`。`$env:RUST_TEST_THREADS='1'; npm run verify -- native` 已通过环境、完整 Node、Rust fmt/clippy、全部 Core 主机测试、Agent 沙箱主机与 RPC 门禁。专项 `cargo +1.92.0-x86_64-pc-windows-msvc clippy -p jidecards_core --features anki-core --test core_interop --example core_interop_check --locked -- -D warnings` 通过，日志为 `tmp-core-interop-clippy.log`。单独 `cargo test -p jidecards_core --features anki-core --test fsrs --locked -- --test-threads=1` 也通过三项 FSRS 测试。串行设置只控制 Rust 测试间的并发；回归内部的进度/取消及子进程中断仍真实并发执行。

首次默认并行 `npm run verify -- native` 的 Core 互通通过，随后共享工作树的 `tests/fsrs.rs` 进程以 `0xc0000409 (STATUS_STACK_BUFFER_OVERRUN)` 异常退出；不能将该轮记为通过。串行重试通过不证明默认并行异常已修复，没有改动 FSRS 测试或关闭断言。记录日志：`tmp-core-interop-native-gate.log`（失败）、`tmp-core-interop-native-serial.log`（通过）。

早期尝试发现共享工作树其他原生文件存在 Rust fmt 差异；互通行为命令只执行其 Rust 测试目标，fmt/clippy/全库原生测试另由 native 门禁记录。旧版 JSON 配置的键顺序规范化后保持值断言；Core 秒级 mtime 相同的 Always 跳过行为已纳入回归，未削弱字段或历史断言。Node 通用 SQLite 缺少 Core 的 unicase 排序规则，因此真实恢复集合由 Core 自身完整性检查验证；Node 仍核对恢复字节和关联。

没有运行 HAP 构建：本任务仅新增主机测试、测试依赖、工具和文档，未改变产品实现或 NAPI/ArkTS 调用链。native 成功不冒充 HAP 或设备验收。

## 待用户提供的验证条件

设备由用户操作。尚无 AnkiDroid/HarmonyOS 设备返回包、实际媒体/公式/输入答案/IO 交互、设备导入取消与进程中断验收；没有执行安装或重启。

在线同步未执行：没有隔离测试账号，未读取现有同步配置/凭证。增量/全量/媒体同步和跨客户端冲突仍为 `not-run`；提供隔离测试账号和目标服务器后才可继续。完整边界及用户操作步骤见[回归文档](core-interop.md)。
