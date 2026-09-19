# 易混淆功能的当前状态

用于功能盘点、与 Anki/AnkiDroid 对照以及新增功能前的核查。本文是源码导航，不替代源码；功能变更时同步更新对应条目。只记录容易把“已有能力”“已接入流程”“已有设置入口”混为一谈的项目。

## 备份与恢复

以下状态于 2026-09-18 在当前 jidecards 工作区核对。

| 能力 | 当前状态 | 核查入口 |
| --- | --- | --- |
| 手动整库备份与恢复 | 已接入：导出个人数据为 `.colpkg`，导入个人数据替换集合 | `entry/src/main/ets/backend/数据迁移服务.ts`、`components/数据迁移面板.ets`、`pages/设置页.ets` |
| 导入前自动安全副本 | 已接入：替换集合前复制数据库及媒体，失败恢复；成功后清理副本。这是单次操作回滚保护，不是长期历史备份 | `数据迁移服务.ts` 的 `替换集合`、`创建安全副本`、`恢复安全副本` 调用链 |
| Anki Core 备份引擎 | 已具备：`create_backup` 调用 `maybe_backup`，检查变化及时间间隔，生成 `.colpkg` 并按策略清理；应用已登记创建/等待备份的 RPC 编号 | `third_party/anki/rslib/src/backend/collection.rs`、`collection/backup.rs`、`config/mod.rs`；`entry/src/main/ets/backend/服务索引.ts` |
| 应用自动历史备份 | 本次未找到接入：应用层没有创建备份 RPC 调用、自动触发和历史列表；当前 Core 的打开/关闭集合实现不会自行调用 `create_backup` | `entry/src/main/ets/backend/后端会话.ts`、`集合服务.ts`，以及上行 Core 实现 |
| 自动历史备份设置及恢复列表 | 本次未找到界面入口；不能据此推断手动备份、导入保护或底层引擎不存在 | `entry/src/main/ets/components/设置面板.ets`、`components/settings/数据分组.ets` |

补齐自动历史备份应复用现有 Core 引擎和安全导入能力，重点补应用触发、等待完成、错误呈现、保留策略入口及历史恢复流程，不应重新实现底层备份算法。

### 容易误判的证据

- “备份同步”按钮打开手动导出个人数据流程，导出后仍由用户发起同步；不能当作已接入自动备份。
- `创建备份: 2` 等服务编号只说明协议可用，不代表应用已调用。
- 资源文案中“请从自动备份恢复”及旧占位文案不是功能已接入的证据。
- 本地自动落库、AnkiWeb 同步、导入回滚副本、长期历史备份应分别核查。

## 自动同步

已接入且默认开启，设置页可关闭。`model/AutoSyncScheduler.ts` 合并学习写入产生的同步意图，`pages/首页.ets` 在安全空闲时执行既有同步流程；同步更新跨设备数据，不保存可供回滚的长期历史版本，不能当作自动历史备份。

## 删除牌组与媒体清理

- 删除牌组已接入 Core `decks/remove.rs`：递归处理子牌组，普通牌组删除卡片和孤立笔记，筛选牌组归还卡片；默认牌组保留并重置名称。RPC 的 count 是删除的**卡片数**，不是牌组数。
- Core 支持该操作的撤销，但首页没有通用撤销入口；确认提示不承诺“首页顶部撤销”。
- 媒体由集合共享，删除牌组不连带删除文件，这是预期语义。已有完整清理入口：设置 → 数据管理 → 媒体管理 → 检查媒体 → 未使用文件移入回收站 → 清空回收站；清空前可恢复回收站。
- 核查入口：`backend/牌组服务.ts`、`pages/首页.ets`、`components/settings/媒体管理面板.ets`、`backend/媒体服务.ts`。不能把媒体保留判断成媒体清理接口未接入。

## 笔记模式批量操作与学习自动播放

- 浏览页删除、改牌组、设置标志已复用 `笔记服务.获取笔记的卡片`，展开全部兄弟卡并去重。删除完成重新查询后端结果，不用本地移除行模拟删除；查询或写入失败保留选择并提示错误。
- 学习页“关闭自动播放”已接入：`AnkiStudySessionBackend.studyOptions` 读取当前卡片实际牌组的配置（筛选卡使用原牌组），`StudySessionController` 将展示选项纳入当前快照，学习页自动播放遵循开关，按钮/快捷键手动重播仍可使用。每次加载重新读配置，过期响应不能更新当前卡面。
- 回归入口：`browser-batch-runtime.test.mjs`、`study-autoplay-backend.test.mjs`、`study-lifecycle.test.mjs`、`study-session-controller.test.mjs`；验证为隔离行为测试及构建，设备表现仍需实测。

## 学习展示选项与删除闭环（2026-09-19 已接入）

以下行为已完成调用链修复及隔离回归。未操作用户数据库或设备，实际设备表现仍需实测。

| 项目 | 当前行为 | 核查入口 |
| --- | --- | --- |
| 自动显示答案、自动继续、自动操作、等待音频 | 在学习页“更多”显式开始/暂停自动前进；读取当前卡片配置，支持显示答案、今日跳过、忘记/良好/困难评分及文字提醒。等待音频依赖原生整个队列完成信号；每面只执行一次。编辑/引导/菜单暂停，后台关闭自动前进，过期回调不作用于新卡 | `StudyTiming`、`学习页.startStudyTimers/tickStudyTimers`、`CardAudioSession`、`AudioQueueCompletion`、声音/TTS 播放器 |
| 显示答题计时器、显示答案后停止屏幕计时 | 屏幕计时显示分钟/秒并遵守上限；开启停表时在答案侧冻结。**仅影响屏幕计时，不影响学习统计**。内部仍统计至评分，由 Core 限制上限 | `StudyTiming.displaySeconds`、`学习页`、`StudySessionController.answer` |
| 重放答案时跳过问题 | 手动重播按开关决定“问题 → 答案”或“仅答案”；每一面的声音与 TTS 等待真实完成再继续。自动播放只播放当前面 | `学习页.playStudyAudio`、`CardAudioSession.play` |
| 删除父牌组后的当前选择 | 删除提交后立即按祖先 ID 清理级联子牌组选择；也清理手机上未显示但已持久保存的已删选择，保留其他牌组和默认牌组。主页刷新重新校验选择 | `首页.reconcileDeckSelection`、`确认删除牌组`、`执行加载主页数据` |
| 删除成功后的偏好写入失败 | 存储清理返回真实保存结果；失败说明本地偏好未保存，不谎报数据库删除失败，继续刷新及同步。原先存储实现会吞掉错误，早期使用抛错替身的隔离审计不能证明旧版本会实际弹出删除失败，现已修正记录 | `上次牌组存储.清除上次牌组ID`、`首页.确认删除牌组` |
| 首页删除后的自动同步触发 | Core 提交成功即请求自动同步；删除、选择清理与刷新未完成时不启动同步。遵守用户自动同步开关、登录状态和既有安全时机；删除失败不产生新同步意图 | `首页.deckDeletionBusy`、`requestAutoSync`、`tryAutoSync` |

已排除：**答题计时上限一直由 Core 执行**。`scheduler/answering/mod.rs` 在评分时调用 `answer.cap_answer_secs(updater.config.inner.cap_answer_time_to_secs)`；现在屏幕计时也读取同一上限。不可仅凭前端未使用字段误判底层行为。

语义来源：[Anki 官方牌组选项说明](https://docs.ankiweb.net/deck-options.html#timers)。先前“显示答案后停止计时应停止统计”的判断不正确，现有文案与实现已按屏幕计时语义修正。新增回归见 `study-timing`、`native-audio-completion`、`home-deletion-runtime`，并扩展了 `study-lifecycle`、`card-audio-session`、`sync-automatic`。

## 盘点方式

先检查用户入口，再沿 Service、生命周期/自动触发、原生桥追到锁定版本的 Anki Core，最后核对测试。报告明确区分：已接入、仅底层具备、仅缺设置入口、尚未查证。确认缺项时给出缺的是哪一段，不将一次关键词未命中写成整个功能不存在。
