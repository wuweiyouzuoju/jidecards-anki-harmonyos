# AnkiDroid 对照入口

[返回文档导航](README.md) · [当前功能状态](FEATURE_STATUS.md)

本页维护领域映射、事实来源和验证口径，不另存一份容易过期的功能缺口矩阵。原 2026-09-23 对照快照可从 Git 历史追溯；其中的功能状态、测试数量和“下一轮”建议不代表当前工作树。新增或评价能力时，先沿下表读取当前领域文档和真实调用链。

## 基线事实

- jidecards 版本来自 `AppScope/app.json5`，Anki 版本来自 `UPSTREAM.lock`。
- 本地 AnkiDroid 参考目录为相邻 `../AnkiDroid`；版本来自其 `AnkiDroid/build.gradle`，backend 来自 `gradle/libs.versions.toml`。源码归档没有 Git 历史时记录文件哈希，不推测提交或最新发行版。
- 共享 Anki 版本不等于桥接、渲染或设备行为完全相同。生成 RPC、真实业务接入、可见入口和实际验收是不同层次。

## 领域与当前事实来源

AnkiDroid 路径以下相对其源码根；jidecards 的具体实现、已接通入口和剩余限制以所链接领域为准。

| 领域 | AnkiDroid 源码定位 | jidecards 当前拥有者 |
| --- | --- | --- |
| 学习、评分、撤销、媒体、白板和操作偏好 | `AnkiDroid/src/main/java/com/ichi2/anki/reviewer/`、`ui/windows/reviewer/` | [学习与媒体](development/study-media.md) |
| 搜索、选择、列与偏好、批量操作、编辑、笔记类型和统计 | `AnkiDroid/src/main/java/com/ichi2/anki/browser/`、`NoteEditorFragment.kt`、`notetype/` | [浏览与统计](development/browser-stats.md#浏览列表)；易混淆入口见[功能状态](FEATURE_STATUS.md) |
| APKG/COLPKG、文本导入导出、结果定位和中断恢复 | `libanki/src/main/java/com/ichi2/anki/libanki/BackendImportExport.kt`、`AnkiDroid/src/main/java/com/ichi2/anki/export/` | [数据导入与导出](development/import-data.md) |
| 同步、全量冲突、媒体和集合占用 | `AnkiDroid/src/main/java/com/ichi2/anki/sync/`、`services/` | [同步与数据](development/sync-data.md) |
| 包互通、身份/历史保持、取消与恢复的证据 | AnkiDroid backend 版本和导入导出源码哈希 | [核心互通](development/core-interop.md) |
| 系统设置、备份、提醒、无障碍和平台差异 | `AnkiDroid/src/main/java/com/ichi2/anki/preferences/`、`multiprofile/`、`provider/` | [设置对齐](../entry/src/main/ets/components/settings/SETTINGS_PARITY.md)、[界面](development/appearance.md)与[功能状态](FEATURE_STATUS.md) |
| JIDE 专用能力与默认隐藏范围 | 不将 Android 扩展或桌面插件视作对应能力 | [应用内 Agent](development/agent.md)；发布开关来自 `ReleaseFeatures.ets` |

## 对照与验证口径

- 对照能力先查完整入口 → 编排 → Service/Core → 成功刷新及失败恢复；不能把生成 RPC 当成产品功能，也不能把缺少手动菜单等同于全应用不支持。
- 普通界面能力、仅 JIDE 可用能力、发布关闭能力、仅底层能力与设备待验分别标注。浏览全选、偏好、所选导出、立即评分与并排编辑的当前状态归上表的浏览拥有者，不沿用实施前清单。
- `npm test -- browser` / `study` / `sync` 验证对应主机范围；`npm run protocol:test-core` 和 `npm run test:interop` 验证各自的真实 Core 与隔离样本边界。
- HAP/APK 构建、设备交互、在线同步和性能基准另行记录。测试数量、远端 CI 配置或共享后端不能证明实际故障率与完整兼容性。命令边界见[验证说明](development/verification.md)。
