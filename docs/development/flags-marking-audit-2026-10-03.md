# 旗标与标星完整对接调查（2026-10-03）

[返回浏览领域](browser-stats.md) · [学习与预览](study-media.md) · [核心互通](core-interop.md)

> 状态：已按本调查实施旗标与标星对接；以下调查和提案保留为实施前证据，当前行为以本节及浏览、学习领域文档为准。基于项目锁定的 Anki 26.05 和相邻 AnkiDroid 源码；共享工作树中其他任务的修改不属于本次对接。

## 实施结果

- 新增纯模型 `CardMarking.ts` 和服务适配器 `AnkiCardMarking.ts`，集中定义 0–7 旗标、精确星标、最新笔记局部标签更新及名称合并。名称缺失通过 GetAllConfig 区分，Core 的 GetConfigJson 对缺失键会报 NotFound；未把读取故障当作默认名称。
- 浏览七色选择、独立星标／旗标／暂停显示、精确已标星和未标星筛选、无旗标／全部旗标／七色筛选、批量显式标星／取消标星及名称管理已接通。笔记模式旗标作用于全部兄弟卡，标星作用于笔记。
- 学习当前卡显示、标星切换、旗标设置及清除、名称管理、同卡模板刷新和连续撤销已接通；保留当前面、原调度状态、拼写输入、选择和计时起点。预览只读显示标记。名称保留未编辑及未知键和值，留空恢复默认。
- SearchNode 的 FLAG_NONE=0 现在显式编码 oneof；SetFlag 的普通零标量仍遵循 protobuf 默认编码。APKG 导出界面说明不包含调度信息时 Core 会同时移除旗标及完整 marked／leech 标签。
- 直接回归：`card-marking.test.mjs`、`study-card-marking.test.mjs`、浏览分页／批量运行时、预览及生产服务适配器测试；真实 Core `card_marking.rs` 和 `core_interop.rs` 验证七色、高位、兄弟卡、精确标签、撤销重开、调度及 revlog 不变、APKG／COLPKG 语义。
- 验证以本轮“社区调查后重新启用 JideCards 优先”的记录为准；历史日志不代表当前工作树。生产已恢复待同步标记优先，两种混合客户端顺序和两个 JideCards 顺序的 HTTP 冲突回归均通过。设备外观／输入行为和真实 AnkiWeb 两端同步仍单独验收，未访问账户或用户集合。

## AnkiDroid 源码对照与同步专项（2026-10-03）

对照本机 `D:/Projects/AnkiDroid` 源码归档；其 `gradle/libs.versions.toml` 的 backend 为 `0.1.68-anki26.05`，与 JideCards 的 `UPSTREAM.lock` 锁定版本一致。Core 锁定提交引用为 `e64c6b1`；本机 Core 同样是无独立 `.git` 的源码归档，实际源码包含仓库已有补丁，身份以锁定协议指纹及源码哈希核对，不能把父仓库 HEAD 当作 Core 提交。这里没有运行 Android APK、Android Backend 或账户同步。

| 数据 | AnkiDroid 入口 | JideCards 入口 | 对照结果 |
| --- | --- | --- | --- |
| 七色和清除 | `AnkiDroid/.../Flag.kt`、`Reviewer.onFlag`、`libanki/.../Collection.setUserFlagForCards` | `CardMarking.setCardFlags` → `卡片服务.SetFlag` | 相同 0–7 卡片值及 Core RPC；保留高位和兄弟卡 |
| 星标 | `servicelayer/NoteService.toggleMark` → `Note.addTag/removeTag` → UpdateNote | `setMarkedNotes` → 最新 GetNote → UpdateNotes | 完整、忽略大小写的 `marked`；笔记级；保留其他标签及字段。批量入口显式设定目标状态 |
| 名称 | `FlagLabels` → `config.getObject/set("flagLabels")` → SetConfigJson | `AnkiCardMarking` → GetAllConfig / SetConfigJson | 同一集合配置和字符串色号键；未使用本机偏好。AnkiDroid 的 undoable=false 与本机 true 都经过同步测试 |
| 搜索 | `Flag.toSearchValue`、标签搜索 | `CARD_FLAGS`、SearchNode、精确标星搜索 | 数据编号与 protobuf 枚举分开；FLAG_NONE oneof 显式编码；子标签不伪装成星标 |
| 写入及重读 | Core 维护 USN、事务和撤销，界面回读标记 | 既有学习／浏览操作边界、同步占用、代次守卫 | 成功写入请求同步；离页不撤回；名称保存等待集合同步后再合并最新配置 |

新增 [真实网络回归](../../native/rsharmony/tests/card_marking.rs) 在临时目录启动锁定 Core 的 SimpleServer，监听 `127.0.0.1` 随机端口，使用合成账号和两个独立 Backend／集合。所有标记操作使用锁定 RPC 编号；两个 peer 代表客户端共享 Core 的调用语义，不能称为两台真实应用设备。普通同步用 HTTP SyncCollection，全量用 FullUploadOrDownload，不复制数据库来冒充同步。

普通双向场景通过：七色和清除、高位保留、兄弟卡、大小写 marked／取消、子标签与字段保留、名称及未知 JSON 保真、名称恢复默认、撤销／重做后同步、登录失败后保留待同步写入、重开后补同步、全量上传／下载。本地标记写入保持锁定 Core 原规则；学习中设置旗标不改卡片 mtime。同步冲突及上传修订准备采用下述用户选择的 JideCards 优先策略，调度字段和 revlog 保留。`browser-flag-names.test.mjs` 和 `study-session-controller.test.mjs` 另验证集合占用期间等待、同步完成后读取新的旗标／星标／名称，以及旧代次不能覆盖当前页面。

### 当前状态：社区调查后重新启用 JideCards 优先

用户进一步指定“社区没有解决方案的话就 JideCards 优先”。已检索 Anki 论坛和 Anki／AnkiDroid 官方 issue／PR，并核对当前上游 SetFlag 与 chunk 合并；找到相关讨论、旗标名称缓存问题及未合并的 FSRS reconciliation 提案，没有找到可直接解决本次旗标／marked 冲突的成熟修复。具体来源、提案范围和推断见[当前决策](../decisions/2026-10-03-marking-sync-priority.md)。[设备中立记录](../decisions/2026-10-03-marking-conflict-compatibility.md)仅保留为上一阶段证据。

生产 FFI 与 HTTP 回归共用 init_anki_backend，显式开启 Core 本地 opt-in；参考 peer、CollectionBuilder 默认和服务端关闭。跟踪补丁由两个构建入口幂等应用。混合客户端都有待同步记录且标记不同时，选择 JideCards 的旗标低三位或 exact marked；整体记录仍按原 mtime 选择，然后覆盖这两个标记字段。较新远端的 due、高位、字段和其他标签因此仍可保留。没有颜色编号 OR 或星标并集。

两个 JideCards 设备均有待同步修改时，后同步端保留自己的待同步标记，再传播给另一端；这是同步顺序，不是可恢复的实际编辑顺序。本地已同步时仍接受另一端后续单方修改。两个未修改 AnkiDroid 的同步仍由上游决定，单独修改 JideCards 无法修复它们之间的旧缺口。

上传前在原同步事务内为剩余待同步卡片／笔记设置 max(记录修订, 当前秒)+1，使原服务端与参考客户端的严格比较能接受保留结果。范围是待同步整行，未记录单独标记操作历史；其他字段编辑也会进入待同步集合。因此不能把本策略描述为全客户端逐字段合并或实际最后编辑优先。flagLabels 仍按原整体配置规则；结构冲突和全量覆盖方向沿用既有流程。

最新回归含普通双向、混合客户端两种顺序、较新远端数据保留、两个 JideCards 两种顺序、本地 RPC 和活动队列／原始答题状态。每个冲突案例均覆盖清除／设置旗标及加星／取消星，随后核对单方后续修改、双方整行一致和同步干净状态。执行命令：cargo test -p jidecards_core --features anki-core --locked --test card_marking；本轮日志 tmp/flags-marking/priority-restored-core.log，实际验收结果见本文末节。

本轮重新验证当前工作树及签名 HAP，不沿用旧方案或撤回阶段的成功日志。用户自行安装；未访问用户集合、真实账户，也未运行 Android/HarmonyOS 真机或线上 AnkiWeb。

## 实施前调查

## 结论

JideCards 已经接通旗标的数据写入、七色列表显示、Anki 搜索和通用笔记标签写入，具备完整对接所需的后端基础。主要缺口在学习操作、标星专用入口、独立状态展示、七色选择、快捷筛选、旗标名称和回归覆盖。无需新增私有收藏数据库，也无需修改 Rust/C++ 桥或另写同步协议。

“完整”应指在学习、浏览、笔记编辑返回、撤销、搜索、导入和同步之后保持同一 Anki 数据语义；不能只增加两个按钮。只读预览显示状态，仍沿用现有只读边界。

## 已有能力与缺口

代码链接相对本文件；行号应以实施时的源码为准。

| 环节 | 当前实际能力 | 需要补齐 |
| --- | --- | --- |
| 旗标持久化 | [卡片服务](../../entry/src/main/ets/backend/卡片服务.ts) → `SetFlag`；编码接受 0–7 | 更新旧的四色情况说明，业务入口严格校验整数范围 |
| 旗标选择 | [BrowserFlagDialog](../../entry/src/main/ets/components/browser/BrowserFlagDialog.ets) 只列出 0–4 | 无旗标及红、橙、绿、蓝、粉、青绿、紫全部可选；显示当前值 |
| 浏览列表 | [卡片表格](../../entry/src/main/ets/components/browser/卡片表格.ets) 已支持七种旗标色条 | 独立星标指示，旗标、星标、暂停可以同时显示 |
| 浏览批量旗标 | [浏览页](../../entry/src/main/ets/pages/浏览页.ets) 已走统一写入边界；笔记模式展开所有兄弟卡并去重 | 保留这条路径，注明笔记模式改变全部兄弟卡；补七色和无旗标验证 |
| 标星写入基础 | [标签服务](../../entry/src/main/ets/backend/标签服务.ts) 有 AddNoteTags / RemoveNoteTags；笔记编辑可编辑标签 | 专用标星/取消标星操作，卡片选择映射为去重后的笔记 ID |
| 标星筛选 | [BrowserQuickFilter](../../entry/src/main/ets/model/BrowserQuickFilter.ts) 已提供 `tag:marked` | 用户文案明确为“已标星”；补未标星及精确状态判断 |
| 旗标筛选 | 后端支持文本 `flag:0` 至 `flag:7` | `-flag:0` 全部旗标、`flag:0` 无旗标、七色快捷入口，继续正确 AND 组合原查询 |
| 学习 | [StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts) 和[学习页](../../entry/src/main/ets/pages/学习页.ets) 没有旗标/标星状态及动作 | 当前卡片独立状态、设置/清除旗标、标星切换，忙碌及切卡保护 |
| 只读预览 | [卡片预览页](../../entry/src/main/ets/components/browser/卡片预览页.ets) 无专用状态展示 | 显示旗标及星标；不直接写入正式集合；首页预览遵守快照边界 |
| 旗标名称 | 未读取或写入 `flagLabels` | 与 Anki/AnkiDroid 共用集合配置；支持改名、恢复默认、同步后重读 |
| 导入/同步 | 复用 Core 标准数据模型和协议 | 专项验证非零旗标、大小写星标、名称及跨端修改；现有基础互通测试不能代替 |

## 必须保持的 Anki 语义

### 旗标属于卡片

[cards.proto](https://github.com/ankitects/anki/blob/e64c6b1/proto/anki/cards.proto) 的 `Card.flags` 为字段 17，`SetFlagRequest` 包含 `card_ids` 和 `flag`。数据库旗标值为 0=无、1=红、2=橙、3=绿、4=蓝、5=粉、6=青绿、7=紫；一张卡片同时只有一种旗标，可以和星标并存。[官方搜索说明](https://docs.ankiweb.net/searching.html#flags)

[Core 卡片实现](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/card/mod.rs) 的 `set_card_flag` 校验 `flag < 8`，只替换 flags 的低三位，保留其他位。事务为 `Op::SetFlag`，写入可撤销并更新 USN；为避免重建学习队列，旗标操作不改变卡片修改时间。调用现有 SetFlag，不用 UpdateCards 的局部对象覆盖完整调度数据。

数据库值、`SearchNodeFlag` 和 `BrowserRowColor` 是三套不同编号。例如红旗分别为 1、2、3，不能直接互相转换。建议用一个小型模型集中维护七色定义和显式转换，避免选择器、列表、搜索各有一份色表。

### 标星属于笔记

标星等于笔记包含完整标签 `marked`，不是每张卡片的独立收藏状态。Core [浏览表](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/browser_table.rs) 用忽略 ASCII 大小写的完整标签比较判断星标，因此 `Marked` 也算，`marked::child` 本身不算。一条笔记生成正反卡或多个 Cloze 时，星标关联全部兄弟卡。[官方学习说明](https://docs.ankiweb.net/studying.html#editing-and-more)

卡片模式标星：解析所选卡片的 noteId，全部成功后去重再写入。笔记模式直接使用所选 noteId。一个解析失败须整批停止，不能遗漏一部分笔记后仍报告成功。添加/取消必须保留字段、其他标签、卡片调度和复习记录。

建议批量提供明确的“标星”“取消标星”两个动作，以免混合选择的 toggle 难以预测。若提供单一 toggle，应记录策略：AnkiDroid 当前浏览实现为全部已标星才取消，否则全部标星；桌面 Anki 手册描述的是由当前笔记状态决定。两种客户端的批量交互不完全相同，不宣称它们一致。

## 容易遗漏的问题

### 1. 列表行颜色不足以表示全部状态

Core 的卡片模式先返回旗标色，再返回标星色；笔记模式只返回标星/默认色。因此有旗标的星标卡片会遮蔽星标色，而 JideCards 当前只画七种旗标色条，未处理 `COLOR_MARKED`。已有独立暂停查询正是为避免这种单色信息损失。

建议 [BrowserSearchSession](../../entry/src/main/ets/model/BrowserSearchSession.ts) 的行快照增加独立 `marked`，由同模式的精确 Core 搜索 `tag:re:^marked$` 取得 ID 集合，再与分页结果交集。卡片模式再取得独立旗标值，不从本地化列文本猜状态；先优先复用 Core 行色，保留 flags 高位时须另读或准确查询低位。不要逐行再完整渲染笔记。

普通 `tag:marked` 搜索会包含子标签，不能直接当作“当前星标真实状态”的判定依据。现有快捷搜索可保留 Anki 标准语义，独立图标采用完整标签判断。笔记模式旗标只在产品明确展示兄弟卡的汇总/混合状态时聚合；不能把某一张卡的旗标伪装成笔记级旗标。

### 2. 无旗标 SearchNode 已复现编码缺陷

[SearchMessages](../../entry/src/main/ets/proto/messages/SearchMessages.ts) 的 `encodeSearchNode` 在 flag 为 `FLAG_NONE=0` 时省略字段 11。但 flag 是 oneof 成员，零值仍须编码以保留成员选择。

本轮直接执行生产编解码：

| 输入 | 实际字节 | 实际解码 |
| --- | --- | --- |
| `{ kind: 'flag', flag: FLAG_NONE }` | 空字节 | `{ kind: 'parsable_text', text: '' }` |
| `{ kind: 'flag', flag: FLAG_RED }` | `58 02` | flag=2 |

实现无旗标快捷入口时，可沿用当前 `parsable_text` 的 `flag:0`，同时修复 flag 分支的 oneof 零值编码并补测试。此问题不意味着现有手输 `flag:0` 失效。SetFlag 的 flag 字段是普通标量，清旗标时省略零值符合协议，不能与 SearchNode 混为一谈。

### 3. 取消星标可能误删层级标签

[Core RemoveNoteTags](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/tags/remove.rs) 经 [TagMatcher](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/tags/matcher.rs) 按前缀匹配：删除 `marked` 也会删除 `marked::child`。这是 AnkiDroid 批量取消的现有行为；其学习页单笔记入口则用 `note.removeTag("marked")` 后 UpdateNote。

建议 JideCards 新增专用标星写入入口：占用集合后读取最新笔记，忽略大小写地精确增删 `marked`，通过现有批量 UpdateNotes 一次提交，保留 `marked::child` 等其他完整标签。不要拿页面缓存的整条笔记覆写最新字段。该精确保留策略应明示为 JideCards 的一致性选择，并与通用前缀删标签动作区分。

### 4. 旗标名称必须写集合配置

Anki 26.05 的 [FlagManager](https://github.com/ankitects/anki/blob/26.05/qt/aqt/flags.py) 和本地 AnkiDroid `Flag.kt` 都使用 `flagLabels`：`{"1":"待修正","7":"重点"}`。名称不改变旗标编号和搜索条件。

可复用 [配置服务](../../entry/src/main/ets/backend/配置服务.ts) 的 GetConfigJson / SetConfigJson。保存前重读并只合并目标 key，保留未知配置与其他颜色名称；恢复默认删除对应 key。“无旗标”不可改名。同步、导入和集合重开后失效缓存，名称的实际跨端同步仍需隔离账号验证。

### 5. 包迁移有明确边界

[Core 导出数据收集](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/import_export/gather.rs) 在 APKG 不含学习进度时同时清除卡片 flags 和完整的 `marked`/`leech` 标签。这是标准共享牌组导出语义，完整对接应保留并在导出说明中解释，不能悄悄改为永久保留。

APKG 含学习进度时，新导入卡可携带旗标及星标；[导入卡片实现](https://github.com/ankitects/anki/blob/e64c6b1/rslib/src/import_export/package/apkg/import/cards.rs) 跳过已存在的 note+template 卡片，因此重复导入不是更新已有卡旗标的同步方案。笔记标签是否更新还受笔记导入策略影响。`flagLabels` 属于全局集合配置，APKG 不应被宣称可迁移全部旗标名称；COLPKG 与标准同步才覆盖集合配置，仍须专项往返验证。

现有 [core_interop](../../native/rsharmony/tests/core_interop.rs) 快照包含 flags/tags，但样本未设置七色非零旗标、marked 或 flagLabels，不能凭“快照里有列”认定这些能力已验收。

### 6. 切换状态不能重置当前学习

学习动作提交时捕获 cardId、noteId 和当前代次，经现有 `StudySessionController.commitChange` / 集合占用边界提交，并在标记入口与评分/编辑之间落实互斥；现有 commitChange 的操作计数不能直接当作写入串行队列。写入成功请求自动同步，离页仍完成已接受的写入。页面只在代次仍有效时更新图标和菜单，不让旧卡结果覆盖新卡。

标记操作保留题目/答案面、拼写输入、选择题选择、计时和音频进度，不调用“取下一张”来刷新图标。失败反馈真实错误，不把乐观图标当已保存。快速连点、评分、编辑保存及撤销不能并发覆盖标签。

Core 已向模板提供 `{{CardFlag}}`（输出 `flag0`–`flag7`）和 `{{Tags}}`。标记变化时模板内容也可能改变，必须以现有同卡渲染机制更新，保留正在显示的面；不能只刷新原生角标。撤销也回读状态与必要的模板内容。

## 建议实施顺序与责任入口

| 顺序 | 工作 | 所有者与边界 |
| --- | --- | --- |
| 1 | 七色定义、精确 marked 判断、oneof 修复；专用读写及 flagLabels 合并 | 小型纯模型 + backend 服务；Core 保持唯一持久化来源 |
| 2 | 完成浏览选择器、明确的批量标星/取消、独立角标和快捷筛选 | BrowserOperationController 管提交快照；BrowserSearchSession 管查询/分页代次 |
| 3 | 学习角标、菜单动作及同卡内容刷新 | StudySessionController 管写入；学习页负责当前面、计时和输入；复用共享旗标选择器 |
| 4 | 只读预览状态、名称改名/恢复、导出帮助与中英文资源 | 预览保留只读；flagLabels 走集合配置；界面复用公共组件 |
| 5 | 撤销、重开、包往返、同步与设备验收 | 现有 Node/Core 回归及隔离测试账号；未运行的阶段单独记录 |

学习菜单登记 [AppInterface](../../entry/src/main/ets/model/AppInterface.ts) 的真实动作与状态，保证 UI 和 JIDE 界面认知共用声明。新增应用内 Agent 的标记写入工具不是这次界面对接的前提；若后续增加，仍走既有 Scope、提案确认和执行器，不赋予任意数据库/RPC 写入。

中英资源统一为“旗标 / Flag”“标星 / Mark”，加简短作用范围说明。颜色之外提供文字名称和选中态，在明暗主题及大字体下可识别；两种学习工具栏与两种应用模式都能访问。不在首页为每张卡加载状态。

## 验证清单

实施时需要新增有实际行为断言的测试，而不是只检查按钮源码存在：

- 协议：SetFlag 0–7、非法值、SearchNode 的无旗标 oneof、三套枚举显式映射。
- 数据：兄弟卡旗标互不影响；标星关联全部兄弟卡；大小写 marked；保留其他字段/标签及 `marked::child`；混合选择/空选择/解析失败。
- 界面模型：旗标+星标+暂停同时存在；笔记模式、查询 OR 分组、分页失败、旧查询、重复点击和离页写入。
- 学习：题目面/答案面、拼写与选择题、定时推进、模板 CardFlag/Tags 刷新、成功/失败/撤销、当前卡及计时保持。
- Core：真实临时集合、七色读写、USN/flags 高位、撤销、重开、调度/FSRS/revlog 不变；名称配置保真。
- 互通：latest/legacy APKG 含/不含学习进度、COLPKG、新增与已有卡；两端增量同步、撤销后同步、名称改动及同步后缓存刷新。
- 设备：深浅主题、大字体、窄/宽屏、固定/浮动工具栏、读写失败反馈、后台返回；只读预览无写入。

实施后按仓库规则执行领域反馈、`npm run verify` 和 `npm run test:interop`；这些命令各自的通过范围不能替代 Android/HarmonyOS 真机与网络同步验收。

## 调查阶段验证与交接（实施前）

- 已执行 `npm run impact -- --paths docs/development/flags-marking-audit-2026-10-03.md`，确认本轮文档范围。
- 已执行 `node tools/verify-rpc-index.mjs`：锁定协议索引检查通过。
- 已用 Node 24 直接执行生产 SearchNode / SetFlag 编解码，复现无旗标 oneof 问题，并确认 SetFlag 的 5/6/7 可编码。没有把该复现当作已经修复。
- 已执行 `npm test -- repo`：23 项全部通过，包含当前文档及资源契约。
- 已执行 `npm run verify -- repo`：本轮共享工作树共 2131 项，2130 项通过，1 项失败；未把完整门禁记为通过。失败为其他任务新增的 `study-whiteboard.test.mjs` 中键盘测试，提取学习页方法后出现 `ERR_INVALID_TYPESCRIPT_SYNTAX: Return statement is not allowed here`。对应学习页和手写白板源码也正在被其他任务修改，本轮未编辑或修复它们。
- 本轮验证日志位于 `tmp/flags-marking-audit-20261003-162545/verify-repo.log` 和 `docs-tests.log`；这两个本机日志不作为可移植源码入口。
- 未执行本轮 Rust 专项行为测试、HAP 构建、设备操作或 AnkiWeb 账户同步。仅有源码与 Node 协议证据的结论，不扩大成跨端验收通过。
- 后续实施从七色/marked 小型模型、精确笔记写入和浏览统一操作入口开始；本文件的提案不是已发布功能说明。

## 实施验证（2026-10-03）

以下是实施完成时的历史结果；追加的同步专项验收以后一节为准。

- `npm run verify` 全部通过：2162 项 Node 测试、Rust fmt/clippy 与主机 Core 测试、沙箱、锁定 RPC 索引、clean 签名 HAP 构建；构建警告符合既有基线，新增非预期警告为 0。
- `npm run test:interop` 通过锁定协议、真实 Core 包往返、迁移恢复行为和恢复集合完整性检查。专项包测试覆盖 latest／legacy APKG 含与不含调度信息、COLPKG 中非零旗标、完整 marked、子标签及旗标名称；名称配置不随 APKG 替换目标集合。
- 日志：`tmp/flags-marking/verify-all.log`、`interop.log`；互通报告：`tmp/core-interop/run-dqFrII/report.json`。签名包：`entry/build/default/outputs/default/entry-default-signed.hap`。
- 未安装、启动或操作设备；用户明确自行安装。真机深浅色／大字体／输入／后台返回行为，以及真实账户的 AnkiWeb 两端同步仍待验收。

## 首次同步专项的历史验证（2026-10-03，修复前）

- 生产模型、名称组件、学习会话、服务适配及浏览分页专项：49 项 Node 测试通过；文档契约 23 项通过；锁定 RPC 指纹通过。日志：`tmp/flags-marking/sync-focused.log`、`sync-docs.log`。
- Rust fmt 和开启 anki-core 的专项 clippy `-D warnings` 通过。真实 Core 普通标记与普通双向 HTTP 同步通过；默认的离线冲突一致性断言实际失败，未跳过。原生验收未通过。日志：`sync-native-host.log`、`sync-core-clippy.log`；单独冲突复现的失败日志为 `sync-conflict.log`。
- `npm run verify -- native` 在仓库阶段非零退出：2166 项中 2157 通过、9 失败，后续 native／sandbox 阶段未执行。失败涉及当前共享工作树正在调整的菜单结构、设置可见项、帮助样式和界面认知契约，不能沿用上一节历史通过结论。之后独立执行原生入口核对 fmt/clippy 和上述 Core 行为。完整门禁日志：`verify-sync-native.log`。
- AnkiDroid 参考源码与实际 Core 合并代码的 SHA-256 记录于 `tmp/flags-marking/source-comparison.json`。本机归档无独立 Git 元数据，未伪造其提交。
- 本轮只增加回归与调查记录，未改变同步协议、Core 写入语义或签名包，未访问账户／用户集合，未安装设备。并发一致性要求仍未满足。

## 首次客户端优先方案的历史验证（2026-10-03）

- `npm run verify` 全部通过：当前共享工作树 2171 项 Node 测试，Rust fmt/clippy 和真实 Core 主机测试、沙箱、RPC 指纹及索引、双架构原生、clean 签名 HAP 构建均通过；构建警告 accepted=268、unexpected=0。日志：`tmp/flags-marking/priority-verify.log`。
- 标记专项五个 Core 测试默认执行且全部通过，包括通过生产 Backend 工厂开启策略的 JideCards peer、策略关闭的参考 peer 和服务器、两种同步顺序、较新远端数据保留、活动队列、原始答题状态及多次撤销。修复后的日志为 `priority-core.log`；补丁幂等构建包装器通过，日志为 `priority-wrapper.log`。
- 最后消除专项测试中多余的 i64 转换，Rust fmt、开启 anki-core 的标记专项 clippy `-D warnings` 和五个测试再次通过；文档变更后 `npm run verify -- repo` 的 2171 项再次通过。日志：`priority-clippy-focused.log`、`priority-core-final.log`、`priority-repo-final.log`。额外的全 targets clippy 初次发现上述转换及既有 `tests/fsrs.rs:170` 的 needless borrow，记录在 `priority-clippy.log`；本次未改无关 FSRS 测试，也未将那次附加命令记为通过。
- 签名包：`entry/build/default/outputs/default/entry-default-signed.hap`。没有安装、启动或操作设备，没有访问真实账号或用户集合；真机及线上账户同步仍未执行。
- 上述完整构建和仓库复测之后，共享工作树新增标签功能。最终 `npm test -- repo` 中相对链接及当前文档检查通过，但资源引用检查发现新 `BrowserTagsDialog.ets` 缺少 `tags_batch_title`，因此该次命令退出非零，日志为 `priority-docs-final.log`。该标签功能不属于本次修改；已生成包对应的是较早完整门禁通过的工作树，未把随后变化的全库状态记为仍然全部通过。

## 撤回阶段的历史验证（2026-10-03）

- 四份 Core 文件与加入优先补丁前的保存基线逐字比较（仅规范化换行）一致；生产工厂、构建登记、夹具及补丁已撤回，锁定 RPC 22 个服务检查通过。
- Rust fmt 与开启 anki-core 的标记专项 clippy `-D warnings` 通过；六个真实 Core 测试四项通过、两项失败，没有 ignored。两项失败分别为 A 先同步／B 先同步的相同 mtime 旗标一致性，实际颜色不同，日志为 `neutral-core.log`、`neutral-clippy.log`。
- `npm run verify -- native` 在仓库阶段退出非零：当前共享工作树 2190 项 Node 中 2166 通过、24 失败，native／sandbox 阶段未继续。失败涉及共享任务正在改变的学习说明与生命周期测试夹具，包含 `studyGuideClose is not a function`；未借本次撤回修改它们。日志：`neutral-verify-native.log`。上条 Core 结果来自单独执行，未冒充该门禁继续运行。
- 当时文档契约九项通过，日志为 `neutral-docs.log`。该阶段未重建或安装 HAP，没有访问设备、真实账号或用户集合。当时并发一致性仍未满足；后来按用户指定完成社区调查并重新启用优先兜底，当前行为见本文前部及当前决策。

## 社区调查后重新启用优先兜底的验证（2026-10-03）

- 八个标记 Core 回归全部通过，零失败、零 ignored；混合客户端两种顺序、两个 JideCards 两种顺序、较新远端调度／字段／其他标签保留均使用真实本地 HTTP 同步。生产工厂也覆盖本地写入和原始答题状态／撤销。日志：`tmp/flags-marking/priority-restored-core.log`。
- 跟踪补丁四份 Core 文件正向和反向应用检查通过；构建包装器幂等／冲突拒绝及九项文档契约通过；RPC 指纹核验 22 个服务通过。
- 标记模型／学习操作／名称等待专项 15 项通过，使用仓库注册的 TypeScript hook。日志：`tmp/flags-marking/priority-restored-node-with-hook.log`。第一次直接 node --test 没加载 hook，无法解析无扩展名导入；修正命令后通过，不改产品代码规避此问题。
- 原生完整主机入口的 fmt／clippy 和所有 Core 主机测试通过。第一次默认并行编译因 Windows 页面文件不足、分配失败而中断；设置 CARGO_BUILD_JOBS=1 后同一入口重跑通过。日志：`tmp/flags-marking/priority-restored-native.log`、`tmp/flags-marking/priority-restored-native-serial.log`。
- 本轮 `npm run verify` 在仓库阶段失败：执行时共享工作树 2190 项 Node 中 2159 通过、31 失败；涉及同时修改的浏览批量操作与其测试夹具、按压反馈、资源引用和调试入口。native／sandbox／hap 阶段未由该命令执行，不能记为完整验收通过。日志：`tmp/flags-marking/priority-restored-verify.log`。本次只改 native 标记策略、构建补丁登记和本调查相关文档，不代替其他任务修改这些入口。
- 其他任务更新浏览测试夹具后，使用同一全量发现入口及 TypeScript hook、test-concurrency=2 复跑全部 Node；执行时 2198 项中 2184 通过、14 失败。余下涉及应用内 JIDE／导航、浏览批量栏和按压反馈；完整仓库门禁仍未通过。日志：`tmp/flags-marking/priority-restored-all-node-serial.log`。这次降低并发仅控制主机资源，没有筛掉测试或更改断言。
- 开启 anki-core 的标记专项 clippy -D warnings 通过；沙箱 host 入口通过。日志：`tmp/flags-marking/priority-restored-clippy.log`、`tmp/flags-marking/priority-restored-sandbox.log`。最终文档九项通过，日志：`tmp/flags-marking/priority-restored-docs-final.log`。
- 单独执行 npm run build:app -- -Clean 成功，包含双架构 Rust、沙箱 app、clean ArkTS 编译及 SignHap；警告 accepted=268、unexpected=0。日志：`tmp/flags-marking/priority-restored-hap.log`。本次签名包已保存为 `tmp/flags-marking/jidecards-marking-priority-20261003-193242-signed.hap`，251477732 字节；SHA-256 为 `5D68E9A01BEB388CC2128FE0C35F221A32653EC3848AE74E7977345D1E3A697F`，复制前后核验一致，避免共享构建路径被后来任务覆盖。构建成功不代表上述全库失败消失，也不代表真机／线上 AnkiWeb 验收。
- 未安装、启动或操作设备；未访问真实账号或用户集合。当前交付范围是社区调查及用户指定的本地标记优先兜底，两个原版 AnkiDroid 之间的冲突仍保持上游行为。
