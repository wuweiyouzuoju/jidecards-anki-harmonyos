// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SERVICEIDS-001
// @名称 服务与方法索引常量
//
// @作用
// 集中定义 Anki 26.05 后端各服务的编号、各服务内方法的编号，
// 以及 NAPI 桥原生状态码。是 backend 层所有调用的「编号字典」。
// 提取自 Rust 构建产物 target/**/build/anki-*/out/backend.rs 的
// run_backend_*_service_method match 分支，与 AnkiDroid 同源规则。
//
// @输入
// 无（仅常量定义）
//
// @输出
// 各 const 对象，供 backend/*Service.ts 与 后端会话.ts 引用
//
// @业务规则
// 服务编号来自 backend.rs line 6668 的 Backend 分派表（奇数 1/3/5/.../45，跳过 31）。
// 方法编号来自各 run_backend_*_service_method 分支行号。
// 升级 Anki 版本时必须按 docs/superpowers/plans 中的 SOP 重新提取本表。
//
// @副作用
// 无
//
// @注意
// 编号必须与 Anki 26.05 backend.rs 严格对齐；改一个号会让对应 RPC 走错分支。
// ========================================================

/** 后端服务编号（来自 backend.rs line 6668 的 Backend 分派表，奇数 1/3/5/.../45，跳过 31） */
export const 服务号 = {
  后端同步: 1,
  后端集合: 3,
  后端卡片: 5,
  后端牌组: 7,
  后端配置: 9,
  后端牌组配置: 11,
  后端调度器: 13,
  后端Ankidroid: 15,
  后端AnkiHub: 17,
  后端AnkiWeb: 19,
  后端链接: 21,
  后端笔记类型: 23,
  后端笔记: 25,
  后端卡片渲染: 27,
  后端搜索: 29,
  后端Github: 33,
  后端国际化: 35,
  后端图片遮罩: 37,
  后端导入导出: 39,
  后端媒体: 41,
  后端统计: 43,
  后端标签: 45
} as const;

/** 后端集合服务方法索引（backend.rs run_backend_collection_service_method 分支） */
export const 集合方法 = {
  打开: 0,
  关闭: 1,
  创建备份: 2,
  等待备份完成: 3,
  最新进度: 4,
  设置中止请求: 5,
  检查数据库: 6,
  获取撤销状态: 7,
  撤销: 8,
  重做: 9
} as const;

/** 后端牌组服务方法索引（backend.rs run_backend_decks_service_method 分支） */
export const 牌组方法 = {
  新建牌组: 0,
  添加牌组: 1,
  牌组树: 4,
  获取牌组名: 13,
  删除牌组: 16,
  重命名牌组: 18,
  获取或创建过滤牌组: 19,
  添加或更新过滤牌组: 20,
  过滤牌组排序标签: 21,
  设置当前牌组: 22,
  获取当前牌组: 23
} as const;

/** 后端牌组配置服务方法索引（backend.rs run_backend_deck_config_service_method 分支） */
export const 牌组配置方法 = {
  获取牌组配置: 1,
  获取牌组配置编辑视图: 6,
  更新牌组配置: 7
} as const;

/** 后端调度器服务方法索引（backend.rs run_backend_scheduler_service_method 分支） */
export const 调度器方法 = {
  获取队首卡片: 3,
  提交评分: 4,
  今日计时: 5,
  牌组今日计数: 10,
  完成页信息: 11,
  恢复埋藏与暂停: 12,
  按牌组恢复埋藏: 13,
  埋藏或暂停: 14,
  清空过滤牌组: 15,
  重建过滤牌组: 16,
  设置到期日: 19,
  排序卡片: 21,
  重新定位默认值: 29,
  描述下一档状态: 24,
  自定义学习: 27,
  自定义学习默认值: 28
} as const;

/** 后端卡片渲染服务方法索引（backend.rs run_backend_card_rendering_service_method 分支） */
export const 卡片渲染方法 = {
  提取音视频标签: 3,
  extractLatex: 4,
  获取空卡: 5,
  渲染既有卡片: 6
} as const;

/** 后端笔记类型服务方法索引（backend.rs run_backend_notetypes_service_method 分支） */
export const 笔记类型方法 = {
  添加笔记类型旧版: 2,
  更新笔记类型旧版: 3,
  获取标准笔记类型JSON: 5,
  获取笔记类型: 6,
  获取笔记类型旧版: 7,
  获取笔记类型名列表: 8,
  移除笔记类型: 11,
  获取变更笔记类型信息: 14,
  变更笔记类型: 15,
  获取填空字段序号: 18
} as const;

/** 后端笔记服务方法索引（backend.rs run_backend_notes_service_method 分支） */
export const 笔记方法 = {
  新建笔记: 0,
  添加笔记: 1,
  添加默认值: 3,
  更新笔记: 5,
  获取笔记: 6,
  笔记字段校验: 11,
  某笔记的卡片: 12,
  笔记的唯一笔记类型: 13
} as const;

/** 后端导入导出服务方法索引（backend.rs run_backend_import_export_service_method 分支） */
export const 导入导出方法 = {
  导入集合包: 0,
  导出集合包: 1,
  导入Anki包: 2,
  导出Anki包: 4
} as const;

/** 后端统计服务方法索引（backend.rs run_backend_stats_service_method 分支） */
export const 统计方法 = {
  卡片统计: 0,
  获取复习日志: 1,
  图表: 2,
  获取图表偏好: 3,
  设置图表偏好: 4
} as const;

/** 后端同步服务方法索引（backend.rs run_backend_sync_service_method 分支，line 2944） */
export const 同步方法 = {
  同步媒体: 0,
  中止媒体同步: 1,
  媒体同步状态: 2,
  同步登录: 3,
  同步状态: 4,
  同步集合: 5,
  全量上传或下载: 6,
  中止同步: 7,
  设置自定义证书: 8
} as const;

/** 后端卡片服务方法索引（backend.rs run_backend_cards_service_method 分支，line 3231） */
export const 卡片方法 = {
  获取卡片: 0,
  更新卡片: 1,
  删除卡片: 2,
  设置牌组: 3,
  设置标志: 4
} as const;

/** 后端配置服务方法索引（backend.rs run_backend_config_service_method 分支，line 3720） */
export const 配置方法 = {
  获取配置JSON: 0,
  设置配置JSON: 1,
  设置配置JSON不入撤销栈: 2,
  移除配置: 3,
  获取全部配置: 4,
  获取配置布尔: 5,
  设置配置布尔: 6,
  获取配置字符串: 7,
  设置配置字符串: 8,
  获取偏好: 9,
  设置偏好: 10
} as const;

/** 后端 Ankidroid 服务方法索引（backend.rs run_backend_ankidroid_service_method 分支，line 4698） */
export const Ankidroid方法 = {
  今日计时_旧版: 0,
  本地时区偏移_旧版: 1,
  设置页大小: 2,
  调试产生错误: 3,
  运行DB命令: 4,
  运行DB命令Proto: 5,
  按ID插入: 6,
  运行DB命令取行数: 7,
  清空所有查询: 8,
  清空查询: 9,
  取下一页结果: 10,
  从查询取列名: 11,
  取激活序列号: 12
} as const;

/** 后端 AnkiHub 服务方法索引（backend.rs run_backend_anki_hub_service_method 分支，line 4833） */
export const AnkiHub方法 = {
  AnkiHub登录: 0,
  AnkiHub登出: 1
} as const;

/** 后端 AnkiWeb 服务方法索引（backend.rs run_backend_ankiweb_service_method 分支，line 4870） */
export const AnkiWeb方法 = {
  获取插件信息: 0,
  检查更新: 1
} as const;

/** 后端链接服务方法索引（backend.rs run_backend_links_service_method 分支，line 4909） */
export const 链接方法 = {
  帮助页链接: 0
} as const;

/** 后端搜索服务方法索引（backend.rs run_backend_search_service_method 分支，line 5829） */
export const 搜索方法 = {
  构建搜索串: 0,
  搜索卡片: 1,
  搜索笔记: 2,
  连接搜索节点: 3,
  替换搜索节点: 4,
  查找并替换: 5,
  全部浏览器列: 6,
  浏览器行按ID: 7,
  设置激活浏览器列: 8
} as const;

/** 后端 Github 服务方法索引（backend.rs run_backend_github_service_method 分支，line 5928） */
export const Github方法 = {
  获取最新发行版: 0,
  下载发行版: 1
} as const;

/** 后端国际化服务方法索引（backend.rs run_backend_i18n_service_method 分支，line 5973） */
export const 国际化方法 = {
  翻译字符串: 0,
  格式化时间跨度: 1,
  国际化资源: 2
} as const;

/** 后端图片遮罩服务方法索引（backend.rs run_backend_image_occlusion_service_method 分支，line 6054） */
export const 图片遮罩方法 = {
  获取遮罩用图片: 0,
  获取图片遮罩笔记: 1,
  获取图片遮罩字段: 2,
  添加图片遮罩笔记类型: 3,
  添加图片遮罩笔记: 4,
  更新图片遮罩笔记: 5
} as const;

/** 后端媒体服务方法索引（backend.rs run_backend_media_service_method 分支，line 6359） */
export const 媒体方法 = {
  检查媒体: 0,
  添加媒体文件: 1,
  媒体文件进回收站: 2,
  清空回收站: 3,
  恢复回收站: 4,
  提取静态媒体文件: 5
} as const;

/** 后端标签服务方法索引（backend.rs run_backend_tags_service_method 分支，line 6555） */
export const 标签方法 = {
  清除未用标签: 0,
  全部标签: 1,
  移除标签: 2,
  设置标签折叠: 3,
  标签树: 4,
  重新指定标签父级: 5,
  重命名标签: 6,
  添加笔记标签: 7,
  移除笔记标签: 8,
  查找并替换标签: 9,
  补全标签: 10
} as const;

/** 原生 NAPI 桥错误状态码，与 rsharmony.h ANKI_STATUS_* 一一对应 */
export const 原生状态 = {
  成功: 0,
  参数非法: 1,
  句柄未找到: 2,
  后端错误: 3,
  原生致命错误: 4
} as const;
