# Core 接口未直接接线清单（2026-10-04）

[返回主报告](ankicore-integration-audit-2026-10-04.md) · [全部 232 项 CSV](ankicore-rpc-inventory-2026-10-04.csv)

这里列出 **68 项方法表未登记 + 31 项已登记但没有生产方法表引用，共 99 项**。这是机械接口分区，不是 99 个缺失功能；每项的处理判断如下。CSV 还标出了有封装却没有上层调用者的专项发现。

后续修复（2026-10-05）：`encode_iri_paths`、`compare_answer`、`extract_cloze_for_typing` 已登记并接通既有卡片、草稿渲染及学习/预览实际调用。媒体路径与拼写不再依赖本机近似实现；TTS 补齐模板音色、语速及支持的附加参数映射，保留系统播放器，因为锁定 Core 没有鸿蒙语音后端。具体入口、平台边界与回归见[Core 渲染语义与平台 TTS](study-media.md#core-渲染语义与平台-tts)。上方数量和 CSV 保留原盘点快照，后续接线不反改历史统计。

后续修复（2026-10-05，G04）：牌组长按/详情菜单与 JIDE 已接入真实 Core `rename_deck`，包含子牌组路径预览、冲突/过期校验和一次撤销；旧别名保留为独立“本机显示名称 / 背景”，留空恢复真实名称。实现和验收边界见[牌组真实改名与本机显示名称](home.md#牌组真实改名与本机显示名称)。下方 G04 保留盘点时状态。

“未登记”指不在应用方法表；“仅编号”指在表中但生产 ArkTS/TS 无成员引用。原生扩展与替代入口另见判定。service/method 数字来自经过验证的锁定 Backend 基线，不按 proto 文本顺序重新猜号。

## collection（service 3）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 3 | `await_backup_completion` | 仅编号 | 非独立缺口 | 当前 createBackup 编码 wait_for_completion=true；等待已在同一次 RPC 内完成。 |
| 10 | `add_custom_undo_entry` | 未登记 | 待接入 | 批量 JIDE 操作未合成一次 Core 撤销；已有普通撤销/重做。 G03 |
| 11 | `merge_undo_entries` | 未登记 | 待接入 | 批量 JIDE 操作未合成一次 Core 撤销；已有普通撤销/重做。 G03 |
| 14 | `set_load_balancer_enabled` | 未登记 | 已有替代 | 负担均衡已通过 Preferences 的 JIDE 高级修改接通。 |
| 15 | `get_custom_colours` | 未登记 | 非本机产品能力 | 上游桌面配色板辅助读取；本应用使用 ThemeCatalog/主题存储。 |

## decks（service 7）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 2 | `add_deck_legacy` | 未登记 | 已有替代 | 已有 NewDeck/AddDeck/DeckTree 及其他现代牌组入口，不需要重复旧 JSON 接口。 |
| 3 | `add_or_update_deck_legacy` | 未登记 | 已有替代 | 已有 NewDeck/AddDeck/DeckTree 及其他现代牌组入口，不需要重复旧 JSON 接口。 |
| 5 | `deck_tree_legacy` | 未登记 | 已有替代 | 已有 NewDeck/AddDeck/DeckTree 及其他现代牌组入口，不需要重复旧 JSON 接口。 |
| 7 | `get_deck_id_by_name` | 未登记 | 已有替代 | 已有 DeckTree/应用牌组发现，能够查名称、ID 与子层级。 |
| 8 | `get_deck` | 未登记 | 部分接入 | 普通牌组说明等读写未接；牌组选项的 currentDeck 限额保存已有独立路径。 G05 |
| 9 | `update_deck` | 未登记 | 部分接入 | 普通牌组说明等读写未接；牌组选项的 currentDeck 限额保存已有独立路径。 G05 |
| 10 | `update_deck_legacy` | 未登记 | 部分接入 | 普通牌组说明等读写未接；牌组选项的 currentDeck 限额保存已有独立路径。 G05 |
| 11 | `set_deck_collapsed` | 未登记 | 本机设计差异 | 首页展开由本机 HomeDeckExpansion 存储，未用该 Core 写入同步展开状态；不是没有折叠功能。 |
| 12 | `get_deck_legacy` | 未登记 | 已有替代 | 已有 NewDeck/AddDeck/DeckTree 及其他现代牌组入口，不需要重复旧 JSON 接口。 |
| 13 | `get_deck_names` | 仅编号 | 已有替代 | 已有 DeckTree/应用牌组发现，能够查名称、ID 与子层级。 |
| 14 | `get_deck_and_child_names` | 未登记 | 已有替代 | 已有 DeckTree/应用牌组发现，能够查名称、ID 与子层级。 |
| 15 | `new_deck_legacy` | 未登记 | 已有替代 | 已有 NewDeck/AddDeck/DeckTree 及其他现代牌组入口，不需要重复旧 JSON 接口。 |
| 23 | `get_current_deck` | 仅编号 | 已有替代 | 学习请求明确带 deckId 并设置当前牌组，页面持有选中牌组；读取接口只是预留。 |

## config（service 9）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 2 | `set_config_json_no_undo` | 仅编号 | 已有替代 | SetConfigJsonRequest 已有 undoable=false 路径，例如保存搜索；独立不入撤销栈方法仅预留编号。 |
| 3 | `remove_config` | 仅编号 | 底层辅助 | 配置删除接口仅预留编号；保存搜索等已有对象级增删改，不开放任意配置 key 删除。 |
| 7 | `get_config_string` | 仅编号 | 底层辅助/部分偏好缺口 | 专门配置字符串接口仅预留编号；default_search_text 等具体偏好缺口见 G07，不需要通用 key 权限。 G07 |
| 8 | `set_config_string` | 仅编号 | 底层辅助/部分偏好缺口 | 专门配置字符串接口仅预留编号；default_search_text 等具体偏好缺口见 G07，不需要通用 key 权限。 G07 |

## deck_config（service 11）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `add_or_update_deck_config_legacy` | 未登记 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 1 | `get_deck_config` | 仅编号 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 2 | `all_deck_config_legacy` | 未登记 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 3 | `get_deck_config_legacy` | 未登记 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 4 | `new_deck_config_legacy` | 未登记 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 5 | `remove_deck_config` | 未登记 | 已有替代 | 完整预设管理通过 GetDeckConfigsForUpdate/UpdateDeckConfigs 接入，不需要逐个旧接口。 |
| 8 | `get_ignored_before_count` | 未登记 | 待接入 | FSRS 忽略历史日期已有；included/total 预览计数未接。 G11 |
| 9 | `get_retention_workload` | 未登记 | 已有相关替代 | 没有直接封装此 RPC；已用 SimulateFsrsWorkload 提供总负担/保持率比较，不能判为负担功能全无。 G09 |

## scheduler（service 13）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `compute_fsrs_params_from_items` | 未登记 | 研发辅助 | 显式历史项目、benchmark、数据集导出辅助入口，正常集合优化已有；按研发需要决定。 |
| 1 | `fsrs_benchmark` | 未登记 | 研发辅助 | 显式历史项目、benchmark、数据集导出辅助入口，正常集合优化已有；按研发需要决定。 |
| 2 | `export_dataset` | 未登记 | 研发辅助 | 显式历史项目、benchmark、数据集导出辅助入口，正常集合优化已有；按研发需要决定。 |
| 6 | `studied_today` | 未登记 | 已有替代 | 当前今日统计来自 Graphs，应用自行本地化显示；未接上游格式化文案接口。 |
| 7 | `studied_today_message` | 未登记 | 已有替代 | 当前今日统计来自 Graphs，应用自行本地化显示；未接上游格式化文案接口。 |
| 8 | `update_stats` | 未登记 | 旧辅助接口 | 标准 AnswerCard 由 Core 更新学习统计，不另开客户端直接改统计入口。 |
| 9 | `extend_limits` | 未登记 | 已有相关替代 | CustomStudy 的增加今日新卡/复习上限已有，不需要仅为 RPC 覆盖率再开接口。 |
| 20 | `grade_now` | 未登记 | 可选高级能力 | 未提供在浏览中立即评分/调度入口；学习页正常 AnswerCard 已接，不等于无法评分。 |
| 22 | `sort_deck` | 未登记 | 已有相关替代 | SortCards/重新定位已接；直接整牌组快捷重排未单独开放。 |
| 23 | `get_scheduling_states` | 未登记 | 已有相关替代 | 队首已带原始 SchedulingStates，Core 正常回答处理调度/leech；独立查询接口未开放。 G01 |
| 25 | `state_is_leech` | 未登记 | 已有相关替代 | 队首已带原始 SchedulingStates，Core 正常回答处理调度/leech；独立查询接口未开放。 G01 |
| 26 | `upgrade_scheduler` | 未登记 | 按样本确认 | APKG 导入的 Core 内含条件性调度升级；其他旧整库迁移需要样本，不因未登记推断全部不支持。 |
| 31 | `get_optimal_retention_parameters` | 未登记 | 旧产品接口 | 旧最低推荐保持率流程未接；正常保持率配置、优化和负担比较已有，不建议仅为覆盖率恢复旧入口。 |
| 32 | `compute_optimal_retention` | 未登记 | 旧产品接口 | 旧最低推荐保持率流程未接；正常保持率配置、优化和负担比较已有，不建议仅为覆盖率恢复旧入口。 |
| 33 | `simulate_fsrs_review` | 未登记 | 待接入 | 逐日新卡/复习数、耗时和累计知识模拟未接；已有总负担比较。 G09 |
| 35 | `evaluate_params` | 未登记 | 待接入 | log loss / RMSE 参数评价没有接通。 G08 |
| 36 | `evaluate_params_legacy` | 未登记 | 待接入 | log loss / RMSE 参数评价没有接通。 G08 |
| 37 | `compute_memory_state` | 未登记 | 可选诊断 | 从单卡历史重新计算 state/保持率/decay 未接；已有状态显示、卡片统计及正常评分。 G10 |
| 38 | `fuzz_delta` | 未登记 | 可选诊断 | 随机分散日差的单独解释接口未接；调度随机分散仍由 Core 正常执行。 |

## ankidroid（service 15）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `sched_timing_today_legacy` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 1 | `local_minutes_west_legacy` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 2 | `set_page_size` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 3 | `debug_produce_error` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 4 | `run_db_command` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 5 | `run_db_command_proto` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 6 | `insert_for_id` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 7 | `run_db_command_for_row_count` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 8 | `flush_all_queries` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 9 | `flush_query` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 10 | `get_next_result_page` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 11 | `get_column_names_from_query` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |
| 12 | `get_active_sequence_numbers` | 仅编号 | 平台/底层辅助 | AnkiDroid 旧时区、任意 SQL、分页和调试接口只预留编号；鸿蒙已有专属会话/搜索路径，不应给 UI/JIDE 通用数据库权限。 |

## anki_hub（service 17）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `ankihub_login` | 仅编号 | 另行产品能力 | 只有编号，未建设 AnkiHub 客户端链路；不属于应自动补齐的普通 Core 集合能力。 |
| 1 | `ankihub_logout` | 仅编号 | 另行产品能力 | 只有编号，未建设 AnkiHub 客户端链路；不属于应自动补齐的普通 Core 集合能力。 |

## notetypes（service 23）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `add_notetype` | 未登记 | 已有替代 | 当前类型添加/更新使用 Legacy JSON，经 Core 校验、保存和保留未知元数据。 |
| 1 | `update_notetype` | 未登记 | 已有替代 | 当前类型添加/更新使用 Legacy JSON，经 Core 校验、保存和保留未知元数据。 |
| 4 | `add_or_update_notetype` | 未登记 | 已有替代 | 当前类型添加/更新使用 Legacy JSON，经 Core 校验、保存和保留未知元数据。 |
| 9 | `get_notetype_names_and_counts` | 未登记 | 已有相关替代 | 名称已有；类型影响范围由笔记/卡片搜索核对。聚合计数接口未直接接，不等于没有影响预览。 |
| 10 | `get_notetype_id_by_name` | 未登记 | 已有替代 | 已有类型目录及 GetNotetype 的名称、ID、字段顺序。 |
| 12 | `get_aux_notetype_config_key` | 未登记 | 底层辅助 | 专门 aux key 接口未接；JIDE 原始类型 JSON 已可读，无独立任意配置读写权限。 |
| 13 | `get_aux_template_config_key` | 未登记 | 底层辅助 | 专门 aux key 接口未接；JIDE 原始类型 JSON 已可读，无独立任意配置读写权限。 |
| 16 | `get_field_names` | 未登记 | 已有替代 | 已有类型目录及 GetNotetype 的名称、ID、字段顺序。 |

## notes（service 25）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 2 | `add_notes` | 未登记 | 部分接入 | 现有逐笔记新增可用；Core 批量新增及一次操作的撤销边界尚未接通。 G03 |
| 4 | `default_deck_for_notetype` | 未登记 | 已有相关替代 | 已有 DefaultsForAdding 和用户/页面确定的生成目标；单独默认牌组接口未接。 |
| 7 | `remove_notes` | 未登记 | 已有相关替代 | Notes 模式/JIDE 删除会展开兄弟卡并走 RemoveCards，由 Core 清理孤立笔记；不是没有删笔记。 |
| 9 | `after_note_updates` | 未登记 | 底层辅助 | 正常 UpdateNotes 已由 Core 更新相关字段/卡片；没有直接改 DB 后的补修流程。 |
| 10 | `field_names_for_notes` | 未登记 | 已有替代 | 已有笔记类型、GetNotetype 字段列表与 GetSingleNotetypeOfNotes。 |

## card_rendering（service 27）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `strip_html` | 未登记 | 已有相关替代 | Core 渲染/搜索/查重路径或本机展示工具承担对应任务；独立纯文本处理 RPC 未开放。 |
| 1 | `all_tts_voices` | 未登记 | 平台替代 | TTS 已使用 HarmonyOS TTS播放器；未接上游桌面 TTS backend。 |
| 2 | `write_tts_stream` | 未登记 | 平台替代 | TTS 已使用 HarmonyOS TTS播放器；未接上游桌面 TTS backend。 |
| 7 | `render_uncommitted_card` | 未登记 | 已有替代 | 未保存笔记/模板预览使用 RenderUncommittedCardLegacy；通用字段结构草稿渲染仍受限。 G12 |
| 9 | `strip_av_tags` | 未登记 | 已有相关替代 | Core 渲染/搜索/查重路径或本机展示工具承担对应任务；独立纯文本处理 RPC 未开放。 |
| 10 | `render_markdown` | 未登记 | 可选渲染工具 | Core Markdown 转 HTML RPC 未开放；本机 JIDE/卡片已有各自渲染，不能据此说全部 Markdown 不可用。 |
| 11 | `encode_iri_paths` | 未登记 | 平台相关替代 | 本机媒体域名与资源适配使用 URI 编解码；上游独立 IRI RPC 未接，特殊路径兼容需样本验证。 |
| 12 | `decode_iri_paths` | 未登记 | 平台相关替代 | 本机媒体域名与资源适配使用 URI 编解码；上游独立 IRI RPC 未接，特殊路径兼容需样本验证。 |
| 14 | `html_to_text_line` | 未登记 | 已有相关替代 | Core 渲染/搜索/查重路径或本机展示工具承担对应任务；独立纯文本处理 RPC 未开放。 |
| 15 | `compare_answer` | 未登记 | 已有相关替代 | 已有本机拼写比较及填空提取；没有直接用这两个 RPC，等价边界需专门样本，不算全无功能。 |
| 16 | `extract_cloze_for_typing` | 未登记 | 已有相关替代 | 已有本机拼写比较及填空提取；没有直接用这两个 RPC，等价边界需专门样本，不算全无功能。 |

## github（service 33）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `get_latest_release` | 仅编号 | 非本机更新渠道 | 上游 Anki 桌面版本发现/下载安装未接；不应拿来更新鸿蒙应用。 |
| 1 | `download_release` | 仅编号 | 非本机更新渠道 | 上游 Anki 桌面版本发现/下载安装未接；不应拿来更新鸿蒙应用。 |

## i18n（service 35）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 0 | `translate_string` | 仅编号 | 平台替代 | 应用使用 ArkUI 中英文资源及本机格式化；Core 自身错误/描述仍有内部国际化。 |
| 1 | `format_timespan` | 仅编号 | 平台替代 | 应用使用 ArkUI 中英文资源及本机格式化；Core 自身错误/描述仍有内部国际化。 |
| 2 | `i18n_resources` | 仅编号 | 平台替代 | 应用使用 ArkUI 中英文资源及本机格式化；Core 自身错误/描述仍有内部国际化。 |

## import_export（service 39）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 3 | `get_import_anki_package_presets` | 未登记 | 待接入 | 已有全部导入选项；未从 Core 读取上次保存的默认值。 G16 |
| 9 | `import_json_file` | 未登记 | 可选渠道 | 未建设 Core JSON 格式导入；现有包/CSV/文本导入和 JIDE 制卡可用。 G20 |
| 10 | `import_json_string` | 未登记 | 可选渠道 | 未建设 Core JSON 格式导入；现有包/CSV/文本导入和 JIDE 制卡可用。 G20 |

## stats（service 43）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 1 | `get_review_logs` | 仅编号 | 已有替代 | CardStats 响应含 revlog，卡片信息和 JIDE get_card_statistics 已展示历史。 |

## tags（service 45）

| method | RPC | 接线状态 | 判定 | 说明 / 主报告项 |
| ---: | --- | --- | --- | --- |
| 1 | `all_tags` | 仅编号 | 已有替代 | 已有 TagTree 和 JIDE list_tags，不需要另一份扁平读取。 |
| 5 | `reparent_tags` | 仅编号 | 入口未单独接入 | 没有专门父级移动流程；已有 RenameTags 能改完整前缀，不能说标签层级完全无法调整。 G15 |

## 已有封装但尚无业务调用的补充

这部分属于 133 个“有方法表引用”的集合，不能在前述 99 项中看出来。逐项人工核对生产调用后，主要发现：

| 领域 | RPC | 结论 |
| --- | --- | --- |
| sync | `set_custom_certificate` | 自定义服务器有 UI，私有 CA 证书配置/恢复流程未接。 G18 |
| cards | `update_cards` | 当前状态维护使用 SetFlag/SetDeck/调度器等专用操作；未开放任意卡片字段/调度修改。  |
| decks | `rename_deck` | 生产改名为本机别名；真实 Core 改名未接。 G04 |
| scheduler | `empty_filtered_deck` | 没有既有筛选牌组清空/重建业务入口；已有创建和 Core 自动填充。 G21 |
| scheduler | `rebuild_filtered_deck` | 没有既有筛选牌组清空/重建业务入口；已有创建和 Core 自动填充。 G21 |
| ankiweb | `get_addon_info` | 只有 Service，生产无调用；上游桌面插件/版本服务，不属于普通 AnkiWeb 集合同步缺口。  |
| ankiweb | `check_for_update` | 只有 Service，生产无调用；上游桌面插件/版本服务，不属于普通 AnkiWeb 集合同步缺口。  |
| media | `extract_static_media_files` | 未找到此封装的生产调用；正常 APKG/COLPKG 媒体导出交由 Core 处理，没有单独模板静态媒体清单工具。  |
| tags | `find_and_replace_tag` | 指定 nid 范围、regex/matchCase 标签查找替换未接；已有普通标签维护。 G15 |

其他无直接上层调用的辅助封装或原生替代已在 CSV 判定中说明。正常内部调用（例如学习取队首前设置当前牌组、添加前的字段检查、渲染中的 LaTeX 提取）不能因缺少跨文件调用就列为失效。

本附录是有日期的源码检查记录；当前业务事实以主报告和实际实现为准，数量不是长期门禁。
