# 鸿蒙记得闪卡使用用户华为云空间同步

同一华为账号下的鸿蒙设备使用 Core File Kit 文件协同。应用通过 `cloudFileSyncEnabled` 声明能力，用户在系统云空间打开应用同步。文件协同指南的调试步骤没有列出 AGC 开通要求，正式发布条件和两台真机互通仍待验证。[官方适配指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/app-cloud-sync-filesync/)

当前界面提供上传本机完整备份及选择版本下载恢复。2026-11-19 用户明确要求与 Anki 整库备份一致，因此新上传改用包含媒体的原生 COLPKG，不把应用设置、账号凭证或 JIDE 历史解释为卡库备份。

- `CloudCollectionSync.ts` 负责版本 2/3 描述符、每台设备最新版本选择及上传/恢复顺序；新归档携带卡片、笔记、牌组和复习计数，列表显示本地化时间与卡片数，时间降序。
- `AnkiCollectionBackup.ets` 直接通过锁定 Core 导出完整 COLPKG，包含全部媒体；导出后重开 collection。恢复复用现有 `数据迁移服务.ts` 的替换与回滚，Core 重开并核对计数后才提交，不能把文件下载完成解释为卡库已应用。
- `HuaweiCloudSync.ets` 保持 `jidecards-v2` 目录与每台设备两个轮换槽，新完成标记的 `version=3` 指明实体为完整 COLPKG。另一槽保留上次完成版本；先确认实体上云，再发布完成标记。长度和 SHA-256 不符时不得进入恢复。
- 版本 2 仍以原生 JSON 快照和共享媒体恢复。显式 `cloud_replace` 以备份媒体为准，恢复版本高于本机删除记录；正常设备合并保持原规则。缓存准备最多八路并发，全部校验完成前不写卡库。
- 完整归档变化后传输整个压缩文件，不声称附件增量或字节级上传速度。旧共享媒体继续保留，不能在迁移时自动删除可能被其他设备引用的数据；尚未实现共享媒体自动回收。旧 v1 数据仍暂停并等待用户自行处理。
- 下载前保留本地备份；失败及进程中断走既有恢复日志，成功后刷新首页、卡片和集合设置。工作数据库始终本地独占，文件云空间只传输不可变备份。

验证与设备证据统一维护在 [同步与集合生命周期](../development/sync-data.md#华为云空间同步)，直接回归入口为 `tools/tests/huawei-cloud-sync.test.mjs`、`tools/tests/data-transfer-files.test.mjs` 和 `native/rsharmony/tests/peer_collection.rs`。两台真机、断网及大库耗时不能用主机结果代替。
