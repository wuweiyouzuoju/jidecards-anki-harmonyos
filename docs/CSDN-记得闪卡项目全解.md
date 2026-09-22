<!--
CSDN 标题建议：
把 Anki 26.05 Rust Core 接到 HarmonyOS：记得闪卡 jidecards 源码架构全解（欢迎共建）

CSDN 摘要建议：
jidecards（记得闪卡）不是套壳背单词应用，而是一个用 ArkTS/ArkUI 编写界面、通过 C ABI 与 Node-API 复用 Anki 26.05 Rust Core 的 HarmonyOS 开源闪卡客户端。本文不复述 README，而是沿真实源码拆解学习调度、卡片渲染、本地媒体、AnkiWeb 同步、APKG/COLPKG 迁移、统计卡片和受控 AI Agent，并给出可直接参与的开发方向。

CSDN 标签建议：HarmonyOS, ArkTS, Rust, Anki, FSRS

发布前图片处理：若 CSDN 无法转存 raw.githubusercontent.com 图片，请手动上传仓库 screenshots/ 下的同名文件并替换链接。
-->

# 把 Anki 26.05 Rust Core 接到 HarmonyOS：记得闪卡 jidecards 源码架构全解（欢迎共建）

> 历史快照：本文记录 2026-09-08 的一次源码审读。文中的版本号、文件数量、测试数量、发布开关名称和设备验证结果只代表当时工作树；当前版本、构建基线和发布状态请以根目录 README、PROJECT_CONTEXT.md 和 docs/DEVELOPMENT_PLAN.md 为准。

如果要在 HarmonyOS 上做一个真正能长期使用的闪卡客户端，最难的部分不是写几个“正面/背面”页面，而是调度算法、模板渲染、媒体、同步、导入导出和数据兼容。

[jidecards（记得闪卡）](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) 的选择很直接：HarmonyOS 侧用 ArkTS/ArkUI 做原生交互，不另造一套调度器和数据库，而是把 Anki 26.05 的 Rust Core 接进来。

我这次没有按 README 复述功能，而是沿着实际入口、调用链、构建配置和测试读了一遍当前代码。下面所有版本与能力判断都以可执行源码为准。

截至 2026-09-08 本文检查时：

- 工作区源码版本是 `2.3.3`，`versionCode=2303`；事实来源是 `AppScope/app.json5`。
- Compatible SDK 是 API 21，Target SDK 是 API 23；事实来源是 `build-profile.json5`。
- 支持 `phone`、`tablet`、`2in1`；事实来源是 `entry/src/main/module.json5`。
- 核心业务链路已完成真机验证，应用已成功上架华为应用市场；但现有验证不等于穷尽所有设备、系统版本和异常组合，边界场景仍需持续补充回归。
- `entry/src/main/ets` 下有 249 个 ArkTS/TS 文件，约 6.64 万行；原生桥由 Rust 与 C/C++ 组成。
- 73 个 Node 测试文件实际跑出 788 条用例，全部通过。
- AI Agent 的实现和测试仍在源码中，但当前发布开关 `SHOW_AI_AGENT_CHANNELS=false`，2.3.3 不公开入口。

这最后一点很重要：源码里“已经有”与用户安装后“已经开放”，是两件事。

![记得闪卡首页](https://raw.githubusercontent.com/wuweiyouzuoju/jidecards-anki-harmonyos/main/screenshots/app-preview-01.png)

## 一、它已经不只是“能复习”的最小客户端

从页面调用的 Service 和实际注册的后端方法看，当前项目覆盖了闪卡使用的完整主链路。

### 1. 学习与调度

- 从 Anki 队列获取队首卡片，展示问题与答案，按 Again / Hard / Good / Easy 四档评分。
- 支持 FSRS 开关、目标记忆保持率、牌组选项和重新调度。
- 支持撤销、埋藏、暂停、恢复、删除当前卡片和学习完成页。
- 支持普通问答、完形填空、输入答案和图片遮罩。
- `[sound:...]` 由 HarmonyOS 原生播放器播放；`[anki:tts]` 由 CoreSpeechKit 朗读。
- 支持底部工具栏、可拖拽吸附的浮动工具栏、物理键盘快捷键，以及实验模式下的 Tap Zones 快速答题。

学习页不是自己计算“下次几天后”。它只负责收集用户动作，并把后端给出的状态原样交还后端。这是整个项目最重要的正确性边界，后面会展开。

### 2. 牌组、制卡与浏览器

- 层级牌组的新建、重命名、删除、排序、隐藏、别名和背景图裁剪。
- 新建普通、填空、输入答案、图片遮罩等笔记；字段数量与顺序来自真实笔记类型。
- Cards / Notes 两种浏览模式，Anki 搜索语法、牌组树、标签树、已保存搜索和 AND/OR 组合。
- 编辑字段与标签，并实时预览卡片正反面。
- 批量改牌组、设置标志、暂停、恢复、删除、设置到期日、重新定位新卡、更改笔记类型、查找替换。
- 标签的重命名、删除、补全和搜索。

浏览页本身已经有约 2450 行，背后同时调用搜索、笔记、笔记类型、卡片、牌组、调度、统计、标签和配置服务。它是一个很典型的“业务复杂度来自 Anki 语义，而不是 UI 数量”的页面。

### 3. 统计与桌面服务卡片

统计页实际挂载了 13 类区块：今日计数、未来预测、年历热力图、复习量、卡片状态、小时分布、难度、间隔、稳定度、真实保持率、记忆率、回答按钮和新增卡片。

其中稳定度、可提取性等数据依赖 FSRS；页面支持按牌组筛选、近一年/全部范围以及图表偏好。项目还实现了一个 2×4 桌面服务卡片，把首页的 8 页学习摘要放到桌面，点击后通过 `jidecards://stats` DeepLink 直接进入统计页。

这条跳转不是文档设想，而是已经写进 `module.json5`、`EntryAbility.ets` 和桌面卡片页面的完整链路。

### 4. 同步、迁移与维护

- AnkiWeb 登录、同步状态检查、普通集合同步、媒体同步、全量上传/下载和中止同步。
- 自定义同步端点与自定义 CA 证书。
- `.apkg` 牌组合并导入/导出。
- `.colpkg` 全量个人数据备份与恢复。
- 媒体检查、缺失/未引用文件定位、回收站恢复与永久清理。
- 数据库检查、空卡、重复笔记、未使用标签、笔记类型管理。

仓库的默认云端牌组目录目前还配置了 6 组可公开下载的 APKG：四六级、高考、中考、AI 机器学习、IT 计算机和中国法律。下载不是简单用普通 HTTP 把大文件一次性塞进内存，而是交给 HarmonyOS 文件传输代理，带进度、无进度超时、临时文件和 ZIP 签名校验，下载完成后再进入正常 APKG 导入链路。

### 5. HarmonyOS 侧的原生体验

- 浅色、深色、跟随系统三种外观模式，蓝、绿、紫、青、橙、金、灰 7 套颜色主题。
- 中文和英文两套资源；当前两边各 1327 个字符串 key，名称完全对齐。
- 多条定时学习提醒，使用 HarmonyOS 代理提醒能力。
- 沉浸式窗口与动态安全区适配，覆盖旋转、折叠屏展开/折叠和分屏场景。
- 前后台切换时刷新桌面卡片和学习提醒；桌面数据刷新使用短时任务，避免应用进入后台后异步任务被立即挂起。

## 二、真正的核心：ArkUI 不重新实现 Anki

项目的主调用链可以压缩成一行：

```text
ArkUI 页面/组件
  → backend/* 领域 Service
  → 后端会话
  → 后端客户端
  → libjidecards.so（Node-API C++）
  → rsharmony（Rust C ABI）
  → Anki 26.05 Rust Core
```

这里有三个刻意保持很窄的边界。

### 1. ArkTS Service 只做领域调用和 protobuf 编解码

例如 `调度器服务.ts` 暴露的是“获取队首卡片”“提交评分”“埋藏或暂停”“设置到期日”，而不是一个任意 `runRpc()`。UI 不需要知道服务号和 protobuf 字段，Agent 更拿不到裸 RPC。

服务号和方法号集中在 `backend/服务索引.ts`。Anki 26.05 的后端分派使用固定编号，例如：

```typescript
export const 服务号 = {
  后端同步: 1,
  后端集合: 3,
  后端卡片: 5,
  后端牌组: 7,
  后端调度器: 13,
  后端卡片渲染: 27,
  后端搜索: 29,
  后端导入导出: 39,
  后端媒体: 41,
  后端统计: 43
} as const;
```

这意味着升级 Anki 上游不能只改版本号。服务编号、方法编号、proto 字段和生成代码都要重新核对，否则最危险的结果不是“编译失败”，而是请求被送到错误的方法。

### 2. C++ Node-API 层只做异步桥接

`native_module.cpp` 对 ArkTS 只导出三个函数：

```typescript
openBackend(init: Uint8Array): number
runMethodRaw(handle, service, method, input): Promise<Uint8Array>
closeBackend(handle): void
```

`runMethodRaw()` 把 ArkTS 的 `Uint8Array` 复制到原生任务，放入 `napi_async_work`，完成后再解析 Promise。C++ 层不理解卡片、牌组、FSRS，也不拼业务错误文案。

这种“笨桥”是优点：跨语言层越薄，上游协议变化时越容易定位问题。

### 3. Rust FFI 负责句柄、内存和 panic 边界

`rsharmony` 用全局注册表为每个 Anki Backend 分配非零句柄；每个实例放在 `Arc<Mutex<...>>` 中，因此同一 Backend 的调用会串行化，不同句柄彼此独立。

FFI 返回的是显式状态码和拥有所有权的 `AnkiBuffer`：

```text
0  OK
1  INVALID_ARGUMENT
2  HANDLE_NOT_FOUND
3  BACKEND_ERROR
4  NATIVE_FATAL
```

所有进入 Anki Backend 的调用都包在 `catch_unwind()` 中。Rust panic、锁中毒、后端 protobuf 错误分别映射到不同状态，panic 不会穿过 C ABI 把 ArkTS 进程带走。C++ 拿到字节后复制，再调用 `anki_buffer_free()` 归还 Rust 分配的内存。

这部分代码不长，却是整个应用稳定性的地基。

## 三、为什么学习页不自己计算 FSRS

Anki 的 `SchedulingState` 是包含 New、Learning、Review、Relearning、Filtered 等分支的深层 protobuf oneof。前端如果把它完整解码，再按自己的类型重编码，很容易在 Anki 升级时丢掉不认识的字段或 oneof 分支。

jidecards 的做法是把五个状态当作不透明字节：

```typescript
export interface SchedulingStatesRaw {
  current: Uint8Array;
  again: Uint8Array;
  hard: Uint8Array;
  good: Uint8Array;
  easy: Uint8Array;
}
```

评分时只选择对应的一份 `newState`，与当前状态一起原样回传：

```typescript
const states = this.当前卡片.states;
const newStates = [states.again, states.hard, states.good, states.easy];

await this.调度器服务实例.提交评分({
  cardId: this.当前卡片.cardId,
  currentState: states.current,
  newState: newStates[rating],
  rating,
  answeredAtMillis: Date.now(),
  millisecondsTaken: Date.now() - this.展示时刻毫秒
});
```

连四个按钮上显示的“10 分钟”“3 天”也不是前端估算，而是把同一组状态交给后端的 `DescribeNextStates`。

这样做的结果是：

- FSRS / 传统调度器的计算只有一个事实来源。
- 前端不复制 Anki 的调度规则。
- 评分记录包含真实作答时间和耗时。
- 上游新增状态字段时，旧前端仍能保持字节级透传。

这比“前端做一个看起来差不多的间隔算法”可靠得多。

## 四、卡片不是纯文本：渲染、媒体、TTS 与输入答案

Anki 卡片本质上是模板、字段、CSS、媒体和若干特殊标记的组合。jidecards 让 Anki Core 先渲染出 question / answer 节点流和模板 CSS，再由 `学习卡片HTML构建器.ts` 组装成完整 HTML，最后交给 HarmonyOS Web 组件显示。

本地媒体没有开放 `file://`。构建器把相对资源改写到一个不存在于公网的锚点：

```typescript
export const 媒体基地址 = 'https://jidecards-media.local/';
```

Web 请求这个地址时，学习页的 `onInterceptRequest` 再从应用沙箱的 `collection.media/` 读取文件，按扩展名设置 MIME。这样既能让 HTML 正常引用图片，又不用给 Web 组件裸露整个沙箱路径。

音频也没有留给 Web 组件自行处理：

- 后端从卡片 HTML 中提取 `[sound:...]` 和 `[anki:tts]`。
- 本地音频进入串行原生播放队列。
- TTS 项交给 CoreSpeechKit。
- 音频或 TTS 提取失败时降级为静音，不阻断复习。

输入答案则走另一条兼容链路：从后端渲染结果识别 `[[type:...]]` 标记，翻面时读取真实字段；如果是 Cloze，先按当前模板序号提取对应填空，再由纯函数拼写比对器生成字符级 diff HTML。

图片遮罩也不是一张静态图。源码里保留了 canvas 遮罩绘制与显示逻辑；目前“切换遮罩”按钮因 Web 事件转发稳定性问题被主动隐藏，但底层 toggle 和重绘逻辑还在。这就是一个很具体的真机交互改进点。

## 五、集合生命周期：导出一次，为什么会影响后续调用

Anki Backend 不是无状态 RPC 服务。它内部持有已打开的 collection，所以 ArkTS 侧专门做了一个单例 `后端会话`，状态只有三种：

```text
closed → ready → collectionClosed → ready
```

并发调用 `确保已打开()` 会共享同一个 opening Promise，避免同时创建多个原生句柄。打开失败会关闭半初始化句柄，允许下次重试。

这套状态机最能体现价值的地方是 COLPKG 导入导出。

Anki 的 `export_collection_package` 会通过 `guard.take()` 消费当前 collection。导出文件成功后，Backend 内部已经不再持有它。如果 ArkTS 还认为状态是 `ready`，下一次调用就会得到 `CollectionNotOpen`。

所以导出完整集合后，代码会：

1. 把本地状态标记为 `collectionClosed`，不再多调一次 Close。
2. 重新打开 collection。
3. 即使重开失败，也不覆盖已经成功生成的导出结果。

恢复 COLPKG 更谨慎：

1. 先要求 UI 二次确认。
2. 把传入 URI 流式复制到沙箱临时文件。
3. 关闭 collection。
4. 复制 `collection.anki2`、`collection.mdb` 和整个 `collection.media` 作为安全副本。
5. 调 Anki Core 导入新集合。
6. 成功后重开并删除副本；失败则恢复副本、重开旧集合，再抛出原始错误。

这不是“调用一个 import API”就结束，而是完整处理了数据库句柄、媒体目录、失败回滚和临时文件清理。

## 六、同步：让 Anki Core 处理协议，UI 只编排状态

AnkiWeb 的网络请求由 Anki Rust Core 发出，ArkTS 侧没有另写一套同步协议。`同步服务.ts` 只包裹登录、状态、集合、媒体、全量上传/下载和中止等方法。

真正的流程判断被放在无平台依赖的纯函数模块 `同步流程.ts`：

```text
SyncStatus
  ├─ NO_CHANGES   → 结束
  ├─ NORMAL_SYNC  → 普通集合同步
  └─ FULL_SYNC    → 进入全量同步确认

SyncCollection
  ├─ NO_CHANGES / NORMAL_SYNC → 完成
  ├─ FULL_DOWNLOAD            → 确认全量下载
  ├─ FULL_UPLOAD              → 确认全量上传
  └─ 未知值                   → 保守按 FULL_SYNC 处理
```

集合与媒体状态分开管理，服务端下发 `newEndpoint` 时会保留原 hkey 和超时设置，只替换端点。错误优先依据后端 `BackendError.kind` 分类为鉴权、网络或其他，不依赖可能已经本地化的错误字符串。

这种分层让网络副作用留在 Core，决策逻辑可以在 Node 环境快速单测，HarmonyOS UI 只负责确认、进度和提示。

## 七、源码里的 AI Agent，为什么不是“让模型直接改数据库”

当前 2.3.3 已把所有可见 Agent 入口统一关在 `SHOW_AI_AGENT_CHANNELS=false` 后面，所以用户安装当前发布包时看不到 AI 制卡、学习页 AI 改卡、浏览器批量 AI 改卡和提供商设置。

但从源码看，这部分并不是一个简单的聊天框。它有完整的受控执行边界：

```text
用户请求
  → Provider（DeepSeek / OpenAI / 自定义 Responses 接口）
  → 有界 AgentRunner
  → 语义工具注册表
  → 只读结果或 ChangeDraft
  → 用户确认
  → AgentDraftExecutor
  → 既有牌组/笔记/卡片/媒体 Service
```

模型可见的是 `search_cards`、`get_note_context`、`create_flashcards`、`propose_update_notes` 这类语义工具，不存在 SQLite、Shell、任意文件或裸后端 RPC。

工具风险分三层：

| 风险 | 例子 | 实际行为 |
| --- | --- | --- |
| 只读 | 搜索卡片、读取笔记上下文、读取统计、搜索 Wikimedia 图片 | 可执行，但只能扩大“可读范围” |
| 普通写 | 新建闪卡、修改字段/标签、移动卡片 | 只生成 `ChangeDraft`，不立即写入 |
| 高风险 | 删除卡片/笔记/牌组/笔记类型、修改模板 CSS、更换笔记类型 | 只生成高风险草稿，要求两级确认 |

安全机制不是只靠提示词：

- `AgentScope` 记录本轮真实发现的卡片、笔记、牌组和笔记类型 ID，模型不能凭空构造一个 ID 去修改。
- `AgentRunner` 默认最多请求 Provider 8 次、调用工具 16 次；重复 tool call id 和连续失败会被截断。
- 模型生成的写操作只能到达草稿注册表，注册表没有提交方法。
- 普通写入需要绑定草稿的一次性确认令牌；高风险写入需要两个不同级别的令牌。
- 确认令牌默认 120 秒过期，只能使用一次。
- 草稿准备时检查一次 `before` 基线，真正执行前再检查一次；确认期间数据被其他操作改过，就把草稿标记为 `conflict` 并停止写入。
- 图片候选只接受当前 Scope 内由 Wikimedia 搜索返回的 candidateId；媒体写入失败会把已写图片移入回收站做补偿。
- Provider API Key 存在 HarmonyOS Asset Store，而不是明文 Preferences。

![记得闪卡 Agent 草稿确认](https://raw.githubusercontent.com/wuweiyouzuoju/jidecards-anki-harmonyos/main/screenshots/agent-edit-03-draft.png)

如果后续重新开放 Agent，不能只把布尔值改成 `true`：应以已经完成的真机全链路验收为基线，针对准备发布的代码版本重新执行 Provider 请求、流式响应、图片、取消、高风险真实写入和商店合规回归。已经通过的主流程需要保持稳定，尚未覆盖的边界与组合场景则要继续补齐。

## 八、项目结构：第一次贡献从哪里进

```text
jidecards/
├─ AppScope/                   # 包名、版本、应用级资源
├─ entry/src/main/ets/
│  ├─ pages/                  # 首页、学习、浏览、统计、设置、制卡
│  ├─ components/             # 通用组件、浏览器、统计、设置、Agent UI
│  ├─ model/                  # 首页任务编排、纯逻辑、偏好、主题、同步决策、Agent 契约
│  ├─ backend/                # 首页数据/牌组命令、Anki 领域 Service 与会话
│  ├─ proto/                  # 项目自有 protobuf 读写与消息编解码
│  ├─ formability/            # 桌面服务卡片 Ability
│  └─ widget/                 # 桌面卡片页面
├─ native/
│  ├─ napi_bridge/            # C++ Node-API 桥
│  └─ rsharmony/              # Rust C ABI、句柄注册表与 Anki Core 适配
├─ tools/                     # 构建、诊断、补丁与测试脚本
├─ tools/tests/               # Node 契约/纯逻辑/protobuf 测试
├─ hosting/                   # 云端牌组与公告目录
└─ third_party/anki/          # 本地准备的锁定 Anki 源码，不进 Git
```

第一次定位问题时，可以按这个顺序：

```text
界面现象
  → 对应 page/component
  → 找它调用的 backend Service
  → 查看服务号与消息 codec
  → 必要时再进入 Node-API / Rust / Anki 上游
```

不要一上来改 Rust Core，也不要为了“解耦”先拆一堆接口。这个项目现有边界已经比较清楚：页面持有 UI 状态，Service 不持有 UI 状态，原生桥不持有业务逻辑。

## 九、如何本地构建

环境基线来自构建脚本，而不是旧计划文档：

- Node.js 18+
- DevEco Studio 6.1.0.860
- HarmonyOS SDK 6.1.0.105，Compatible API 21、Compile/Target API 23
- Rust 1.92.0
- `protoc`、`cargo-zigbuild`、`zig`

先克隆主仓库，再准备锁定的 Anki 26.05：

```bash
git clone https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos.git
cd jidecards-anki-harmonyos

git clone https://github.com/ankitects/anki.git third_party/anki
git -C third_party/anki checkout --detach e64c6b1
git -C third_party/anki rev-parse --short=7 HEAD
```

然后执行：

```bash
ohpm install
npm run doctor
npm test
npm run build:app
```

`build:app` 会先编译 Rust 的 `aarch64-unknown-linux-ohos` 与 `x86_64-unknown-linux-ohos` 产物，再由 Hvigor 组装 HAP。构建脚本还会幂等应用 `tools/patches/anki-compact-import-log.patch`，避免大型 APKG 导入时把全部字段在结果日志中再保留一份，造成额外内存占用。

真机调试请始终覆盖安装：

```bash
hdc -t <connect-key> install -r <signed-hap>
```

不要为了省事执行 uninstall。应用数据库和媒体都在沙箱目录，卸载会把真实学习数据一起清掉。

## 十、验证现状：主链路已上真机，边界覆盖仍要继续补齐

项目已经完成核心业务全链路的真机验证，并通过华为应用市场上架审核。这能够证明应用并非只在静态分析或模拟器中成立，真实设备上的安装、启动和主要业务流程已经落地。

但软件测试无法仅凭一次全链路通过就证明所有情况都没有问题。不同设备型号、系统小版本、折叠与分屏状态、网络中断时机、超大牌组、异常 APKG/COLPKG、复杂卡片模板，以及快速重复点击等操作序列，会形成大量组合。更准确的工程表述是：

> 核心业务主路径已经完成真机验证并成功上架；当前测试覆盖能够支撑正式使用，但不代表所有边界条件均已穷尽，后续版本仍需持续增加异常路径、设备组合和回归样本。

本次代码阅读后实际执行了三组检查：

```text
npm run doctor
→ 当前机器上的 Node / Git / DevEco / Java / Rust / Cargo / Clang / CMake / Ninja / Hvigor 通过

npm test
→ tests 788, pass 788, fail 0

cargo test -p jidecards_core --no-default-features
→ Rust FFI 单元测试 4 条 + registry 集成测试 3 条，全部通过
```

这些 Node 用例主要覆盖 protobuf、纯函数、源码契约和 Agent 安全边界，是既有真机验证之外的自动化防回归网，不应被描述为“787 条真机端到端测试”。

我还执行了仓库给出的完整 Rust 主机测试入口：

```powershell
tools\build-native.ps1 -Target host-test
```

它在本次代码审读所用的机器上因为缺少 `cargo-zigbuild` 没有启动。值得注意的是，同一环境里的 `npm run doctor` 仍返回“toolchain is ready”，说明诊断脚本目前没有覆盖构建脚本声明的全部前置依赖。这只限定本次独立复核能够报告的命令结果，不否定项目开发与上架过程中已经完成的真机构建和验收。

这不是坏事：这是一个边界清楚、非常适合新贡献者领取的首个 Issue。

## 十一、现在最需要哪些贡献

项目当前主分支的提交主要来自同一位作者。它已经跨过“能不能跑”的阶段，下一步更需要把单人实现变成可持续的社区工程。

### 1. 构建与 CI

- 给 `doctor.mjs` 补齐 `protoc`、`cargo-zigbuild`、`zig` 检查，让“诊断通过”真正意味着构建入口可执行。
- 增加带 `anki-core` 的主机测试或可复现缓存，缩短第一次构建时间。
- 完善 arm64 真机与 x86_64 模拟器的发布前验证清单。

### 2. Anki 上游兼容

- 为服务号、方法号和 protobuf codec 增加自动核对工具，降低升级 Anki 时错配的风险。
- 补充真实 APKG/COLPKG 样本的导入导出回归。
- 验证复杂模板、Cloze、输入答案、图片遮罩、音视频和 MathJax 的兼容性。

### 3. HarmonyOS 真机体验

- 折叠屏、平板、2in1、分屏和物理键盘回归。
- Web 组件里的图片遮罩交互、手势冲突和焦点问题。
- TTS、AVPlayer、后台短时任务、提醒和桌面服务卡片在不同设备上的稳定性。
- 无障碍、字体缩放、对比度和大数据量列表性能。

### 4. 浏览器与统计

- 对照 Anki 桌面端补齐搜索、列配置、批量操作和卡片预览边界。
- 为大牌组、深层牌组树、海量标签和长字段做性能压测。
- 继续校对统计口径，避免图表“看起来合理”但与 Anki Core 数据含义不一致。

### 5. Agent 的可重复版本回归

- 把实体手机上的 DeepSeek / OpenAI / 自定义 Responses 接口验收固化成可重复的版本回归流程。
- 流式 UTF-8、取消、重试、截断续写和来源展示。
- 普通草稿、高风险双确认、冲突检测、部分成功重试与媒体补偿。
- 在不绕过 `AgentScope`、`ChangeDraft` 和 `AgentDraftExecutor` 的前提下扩展工具。

### 6. 低门槛贡献

- 补测试样本、复现步骤和真机日志。
- 修正文案与中英资源，但必须保持两套 key 一致。
- 改进构建错误提示和新贡献者上手流程。
- 对截图、CSDN 教程、视频演示和使用反馈做整理。

## 十二、参与方式

仓库地址：<https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos>

你可以直接：

1. Fork 仓库，先跑 `npm test`。
2. 从一个边界明确的问题开始，提交 Issue 或 Pull Request。
3. PR 中说明改了哪条数据流、验证了什么、哪些真机场景尚未验证。
4. 想先讨论需求或真机问题，也可以加入项目 QQ 群：`726837065`。

项目采用 AGPL-3.0-or-later。jidecards 是独立第三方项目，与 Ankitects、AnkiWeb、AnkiDroid 无隶属或背书关系；Anki Rust Core 的版权仍归其原作者与贡献者所有。

如果你熟悉 ArkTS、ArkUI、Rust、FFI、protobuf、Anki/FSRS，或者愿意提供 HarmonyOS 真机测试，都能找到实际可落地的工作。

记得闪卡已经证明了一件事：在 HarmonyOS 上，不必重写成熟的间隔重复内核，也能做出原生、可维护、能与 Anki 数据生态协作的闪卡客户端。下一步，是把它从“一个人写完的大项目”变成“更多人能读懂、能验证、能继续推进的开源项目”。
