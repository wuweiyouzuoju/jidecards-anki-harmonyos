# 应用内帮助

[返回浏览、设置与统计](browser-stats.md)

中文正文位于 `entry/src/main/resources/base/element/string.json`，英文位于 `entry/src/main/resources/en_US/element/string.json`。资源名是稳定定位入口；同一功能的标签、帮助、目录摘要需一起检查。当前行为以 UI 调用链及锁定的 Anki Core 为准，不能直接复制其他客户端的菜单位置、输入格式或功能承诺。

## 正文与事实来源

以下代码路径相对 `entry/src/main/ets/`；Core 路径相对锁定 checkout 的 `rslib/src/`。

| 正文入口 | 当前约束与事实来源 |
| --- | --- |
| `settings_home_today_summary_hint`、`settings_directory_general_hint` | 首页开关控制整个统计区域；`pages/首页.ets`、`components/home/主页摘要分页.ets` 的 Swiper 内容决定可见卡片。 |
| `browser_help_find_replace_body`、`browser_find_scope_all` | 范围是提交时的完整搜索结果快照，包含未加载页；空结果不提交。`pages/浏览页.ets`、`model/BrowserSelection.ts`；Core `findreplace.rs` 只替换字段。 |
| `browser_find_regex_help` | 默认不启用多行模式，逐行锚点需 `(?m)`；Core `search/service/mod.rs`、`findreplace.rs`。 |
| `browser_help_batch_body` | 明确卡片／笔记模式作用范围、删除和替换的会话撤销限制、模板映射可能删除／新增卡片、完整同步双向选择。Core `card/service.rs`、`notetype/notetypechange.rs`。 |
| 同上：到期日／重排位置 | 有 FSRS 记忆状态时不保证保留间隔；随机打乱笔记后按步长分配位置，同笔记卡片共享位置。Core `scheduler/reviews.rs`、`scheduler/new.rs`。 |
| `browser_help_sidebar_body` | 长按标签先开操作菜单；牌组长按直接追加搜索。`components/browser/浏览侧边栏.ets`。 |
| `glossary_delete_help`、`glossary_browser_info_help` | 撤销在学习页“更多”；卡片信息中的类型是模板名，不是队列状态。`pages/学习页.ets`、`components/browser/卡片信息.ets`。 |
| `add_note_notetype_basic_type_answer_help` | 输入框在问题面、比较在答案面；Core `notetype/stock.rs`，前端 `model/StudyAnswerRenderer.ts`。 |
| `deck_learnSteps_help`、`deck_relearnSteps_help`、旧 snake_case 同义资源、`settings_fsrs_help` | 当前表单只接收正数分钟，不支持单位后缀。`model/牌组配置表单.ets`。SM-2 与 FSRS 的毕业／短期学习不同，Core `scheduler/states/learning.rs`、`review.rs`。 |
| `deck_minimumLapseInterval_help`、`glossary_lapse_help`、`deck_lapseMultiplier_help` | 遗忘间隔系数及最小间隔只作用于 SM-2；0 不会重置为新卡。FSRS 空步骤仍可能自动短期重学。Core `scheduler/states/review.rs`。 |
| `deck_initialEase_help`、`deck_graduatingIntervalEasy_help`、`deck_intervalMultiplier_help`、`deck_maximumReviewInterval_help` | 首次毕业间隔不先乘初始 ease；简单毕业间隔的大小关系是建议；间隔倍率不代表全库所有间隔；到期不等于必定展示。Core `scheduler/states/` 与 `model/DeckConfigSave.ts`。 |
| `deck_reviewOrder_help`、`deck_newCardGatherPriority_help` | 可回忆率递减为高概率先；按牌组收集使用名称顺序，不随首页拖动。Core `storage/card/`、`storage/deck/active_deck_ids_sorted.sql`。 |
| `deck_fsrsParams4_help`、`deck_fsrsParams5_help`、`deck_fsrsParams6_help` | 非空 v6 → v5 → v4 回退；全部空才默认。Core `deckconfig/mod.rs`。 |
| `deck_fsrsEnabled_help`、`deck_paramSearch_help`、`deck_fsrsHealthCheck_help` | 本应用可保存偏好，没有优化／评估入口。参数搜索决定优化训练范围；健康检查是拟合检查，不是保存时修库。`model/DeckConfigSave.ts`；Core `deckconfig/update.rs`、`scheduler/fsrs/params.rs`。 |
| `deck_historicalRetention_help`、`deck_ignoreRevlogsBeforeDate_help` | 历史保持率为缺失历史的计算假设；日期截止也参与记忆状态初始化／重算，不删除历史，不保证单独改日期立即重算。Core `scheduler/fsrs/`、`scheduler/answering/mod.rs`、`deckconfig/update.rs`。 |
| `deck_desiredRetention_help`、`glossary_fsrs_retention_help` | 目标不是实测通过率，不承诺固定官方范围或实际正确率。 |
| `deck_easyDaysPercentages_help` | 周一到周日；1=正常、0=最低、其余=减少，不解释为连续精确百分比。Core `scheduler/states/load_balancer.rs`。 |
| `deck_reviewToday_help`、`deck_newToday_help`、对应 Active 帮助 | 保存未启用项清除覆盖，0 必须保留；次日回退本牌组再预设。`model/DeckConfigSave.ts`、`proto/messages/DeckConfigMessages.ts`；Core `decks/limits.rs`。 |
| `glossary_siblings_help`、`deck_buryInterdayLearning_help`、`deck_interdayLearningMix_help` | 跨日指跨学习日切换，不是固定超过 24 小时；区分当日与跨日学习。Core `scheduler/answering/learning.rs`、`scheduler/queue/builder/burying.rs`。 |
| `deck_leechAction_help` | 只说明已接入的标签／暂停效果，不承诺未经验证的提示。Core `scheduler/answering/mod.rs`。 |
| `stats_help_retention`、`stats_help_today`、`stats_help_buttons` | 使用提交的评分统计，非 Again 为通过；选择题错误自动 Hard 也计为通过，因此不是选择题答对率。保留率逐条累计，无每日首次去重。Core `stats/graphs/` 与 `model/JideChoice.ts`。 |
| `stats_help_card_counts`、`stats_help_hours` | 暂停可来自难卡处理；小时统计按合格日志次数，不按卡片去重。Core `stats/graphs/card_counts.rs`、`hours.rs`、`buttons.rs`。 |
| `stats_help_ease`、`stats_help_retrievability` | SM-2 易度与 FSRS 难度的轴／颜色方向不同；可提取性只平均有记忆状态的卡，笔记掌握量另算。`components/stats/`；Core `stats/graphs/retrievability.rs`。 |
| `stats_help_forecast`、`stats_help_added` | 长范围多天合并一柱；预测是当前排期汇总，不是后续复习过程模拟。`components/stats/预测卡.ets`、`新增卡.ets`。 |
| `glossary_ratings_help`、`glossary_shortcuts_help`、`settings_tap_zones_hint`、自动前进与布局帮助 | 区分普通闪卡与选择题。选择题自动 Good／Hard，不走普通翻面、四档评分、Tap Zones、自动前进与浮动评分工具栏。R 的音频范围遵循跳过问题选项。`pages/学习页.ets`、`model/StudyTiming.ts`。 |
| `transfer_legacy_help` | Legacy2 为 Anki 2.1 兼容格式；牌组／集合决定 apkg／colpkg，文件包不等于增量同步。`backend/DataExportWorkflow.ets`；Core `import_export/package/meta.rs`。 |
| `redemption_contents_eligibility` | 沿用 `docs/REDEMPTION.md` 的 3.0.0 之前老用户赠送政策；补充资格由开发者核实，应用不自动判断使用时间；兑换校验实现不变。 |

## 验证与维护

行为回归先执行 `npm test -- browser` 与 `npm test -- ui`；限额保存、optional 0 编码和搜索快照另有 `deck-config-save.test.mjs`、`page-operation-boundaries.test.mjs` 直接回归。最终使用 `npm run verify`，包括全部 Node、原生及签名 HAP。不为每句自然语言创建锁死措辞的测试；通用资源检查负责中英键一致性与格式。

设备验收需分别检查帮助弹层可滚动、中英文切换、首页卡片开关、搜索范围与空结果、今日限额关闭／零值保存及重开。主机测试和 HAP 构建不替代设备行为。
