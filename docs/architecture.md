# jidecards 当前架构

> 本文只描述当前源码结构与稳定边界。版本、SDK 和待验证事项见
> [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)。一次性设计与执行记录位于
> [superpowers/](superpowers/README.md)，不作为当前事实来源。

## 1. 系统边界

jidecards 是 HarmonyOS 原生 ArkUI 应用。界面和平台能力由 ArkTS 实现；卡片
数据、模板渲染、调度和同步复用锁定的 Anki 26.05 Rust Core。项目不引入 Anki
桌面端的 Qt、Python、Add-on、mpv 或桌面 LaTeX 运行时。

主调用链：

```text
ArkUI 页面/组件
  -> ArkTS 领域服务（protobuf 编解码与业务调用边界）
  -> 后端会话（单例、collection 生命周期）
  -> 后端客户端
  -> libjidecards.so（Node-API C++ 纯转发）
  -> rsharmony（Rust C ABI、句柄和缓冲区所有权）
  -> Anki 26.05 Rust Core
```

稳定约束：

- ArkTS 不直接读写 `collection.anki2`，也不实现 SM-2、FSRS 或队列选择算法。
- `SchedulingStates` 在 ArkTS 侧保持原始 protobuf 字节并原样回写。
- C++ 桥只转发 `openBackend`、`runMethodRaw`、`closeBackend` 三个函数。
- Rust FFI 捕获 panic；跨边界缓冲区由 Rust 分配并由对应释放函数回收。
- Service 不持有页面状态；失败转换为类型化后端错误，由调用页面决定 UI 回滚。
- 覆盖安装只能使用 `hdc install -r`，不得以卸载应用的方式处理签名或安装问题。

## 2. ArkTS 应用结构

`entry/src/main/ets/` 的主要职责如下：

| 目录 | 当前职责 |
| --- | --- |
| `pages/` | 首页、学习、浏览、统计、设置、添加笔记、学习提醒和 AI 制卡/改卡页面 |
| `components/` | 页面可复用 UI；浏览、统计、设置和 Agent 组件各有子目录 |
| `backend/` | Anki 领域服务、后端会话/客户端，以及公告、云端牌组和 Agent 平台服务 |
| `backend/agent/` | Provider 适配、Runner、工具实现、会话控制、密钥/检查点存储及草稿/辅助动作确认执行器 |
| `model/` | 纯模型、设置/偏好存储、主页映射、主题、同步流程及发布开关 |
| `model/agent/` | Agent 协议、工具 Schema、策略、草稿、澄清、历史与校验模型 |
| `proto/core/` | protobuf reader/writer 与 UTF-8 基础实现 |
| `proto/messages/` | 按 Anki 服务拆分的请求/响应编解码 |
| `utils/` | 主题、转场、媒体响应、音频/TTS、尺寸等平台工具 |
| `formability/`、`widget/` | 2×4 统计桌面服务卡片 |

不要在文档中维护文件数量；目录在快速迭代中会变化，实际清单应使用 `rg --files`。

## 3. 页面与导航

`首页.ets` 持有 `NavPathStack`，按名称创建学习、浏览、统计、设置、添加笔记、
学习提醒和 AI 页面。窄屏牌组详情是首页内部覆盖层，不是独立目的地。页面返回时
通过显式 `onPop`/变更信号刷新相关数据，不能假设 `onPageShow` 一定会因
Navigation 的 push/pop 触发。

学习页的核心状态为加载、问题、答案、完成和错误；回答期间有防重入保护。切换
卡片时先回到加载状态，再请求队列和渲染结果。AI 改卡返回只重渲染当前卡片内容，
不重新评分、不埋藏、不重取学习队列。

## 4. Anki 服务边界

服务号和方法号的唯一维护点是
[`entry/src/main/ets/backend/服务索引.ts`](../entry/src/main/ets/backend/服务索引.ts)。
当前已封装集合、卡片、牌组、配置、牌组配置、调度、AnkiWeb、链接、笔记类型、
笔记、卡片渲染、搜索、图片遮罩、导入导出、媒体、统计和标签等服务。

升级 Anki 时必须从新版本生成的 `backend.rs` 重新核对编号和 protobuf，不得根据
旧文档抄写。proto 定义以本地 `third_party/anki/proto/anki/` 中锁定提交为准；
该目录是本地依赖，不受 Git 跟踪。

## 5. 关键业务流

### 学习

```text
选择牌组
  -> 调度器服务设置当前牌组并获取队首
  -> 卡片渲染服务生成节点流
  -> ArkTS 组装 HTML，ArkWeb 展示
  -> 显示答案并播放受控媒体/TTS
  -> 原样提交 current/new SchedulingStates
  -> Anki Core 写入并重排队列
```

卡片媒体使用 `https://jidecards-media.local/` 作为受控拦截锚点，由 ArkWeb
`onInterceptRequest` 映射到沙箱 `collection.media/`。不要使用早期计划里的
`https://anki.local/media/`。

### 导入、导出与同步

文件选择、沙箱暂存和用户 URI 由 ArkTS 处理；包格式、集合变更和同步协议由
Anki Core 处理。全量集合导入/恢复需要区分“关闭 collection”和“后端已经消费
collection”两种生命周期，入口在 `后端会话.ts`，不能用一个布尔状态代替。

### 云端牌组与公告

- 云端牌组从公开 HTTPS JSON 目录读取元数据，系统下载代理写入 `.part`，校验后
  才交给既有导入服务。协议见 [cloud-deck-hosting.md](cloud-deck-hosting.md)。
- 官方公告从公开 HTTPS JSON 读取；客户端实行单请求、十分钟检查窗口、两秒总
  截止和最近 32 个已确认 ID。运维流程见
  [official-announcement-hosting.md](official-announcement-hosting.md)。

### 应用内 Agent

```text
AI 页面
  -> AgentSessionController
  -> AgentRunner（有界 Responses/SSE 工具循环）
  -> Provider Adapter + AgentToolCatalog + AgentScope
  -> 读取结果、ChangeDraft 或辅助 AgentAction 提案
  -> 用户确认（ChangeDraft 高风险再次确认）
  -> AgentDraftExecutor（卡库草稿）/ AgentActionExecutor（辅助动作）
  -> 既有 ArkTS Service -> Anki Core
```

模型不能访问裸 RPC、数据库、文件系统或 shell。工具目录是模型可见契约的唯一
来源，稳定 ID 的读权限不自动转化为写权限，真正写入前必须重新核对 baseline。
辅助动作的确认账本由会话持有，执行器与读取/提案工具分开；记忆和分析授权不走 Anki Service。
2.7.9 默认关闭所有 Agent UI 入口，开发者调试可统一解锁；页面仍固定 `searchMode: 'off'`。详细现状见
[agent-2-design.md](agent-2-design.md)。

## 6. 状态、主题与本地化

- UI 共享状态经明确的 `@StorageLink`、`@Provide/@Consume` 或页面参数传递；
  Service 不反向依赖页面。
- ThemeMode（浅/深/跟随系统）与 ColorTheme（主色）是正交设置；新文本和交互色
  使用资源 token，并满足项目约定的对比度检查。
- 所有用户可见字符串使用资源文件；`base` 与 `en_US` key 必须一致。
- 切换应用语言后通过重新启动 Ability 使整个 UI 一致刷新。

## 7. 验证

| 命令 | 用途 |
| --- | --- |
| `npm run doctor` | Node、Git、DevEco/SDK、Java、Rust/Cargo、Clang、CMake、Ninja 与 Hvigor 诊断；同时检查 protoc、Anki checkout、rustfmt/clippy；使用 bundled GNU 模式时检查 Zig 依赖。签名与链接器可用性以实际构建为准 |
| `npm test` | protobuf、服务、页面壳、i18n、同步、云端功能和 Agent 契约测试 |
| `tools\build-native.ps1 -Target host-test` | Rust FFI 与真实 Anki Core 主机测试 |
| `npm run build:app` | Rust 双架构、ArkTS 与签名 HAP 完整构建 |

自动化测试结果只对执行时的提交和工作树有效。设备验证必须记录系统/API、设备
形态、安装方式和实际操作，不得用旧计划里的 checkbox 或静态截图替代。

## 8. 文档职责

- 根目录 `README.md`：用户与贡献者入口、当前版本和公开功能。
- `DEVELOPMENT_PLAN.md`：当前基线、发布限制、验证门和后续工作。
- 本文：稳定架构、数据流和模块职责。
- `agent-2-design.md`：当前源码中的应用内 Agent 行为与安全边界。
- `development/coding-agent.md`：负责修改仓库的编程 Agent-first 规则。
- `superpowers/`：历史设计与执行记录，仅用于追溯。
- `PROJECT_CONTEXT.md`：本地 AI 协作索引；不得复制长篇历史流水账。
