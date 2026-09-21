# 应用内 Agent

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：UI → 编排 → 工具/策略 → Service/DraftExecutor；AI 编程 Agent 的工作入口另见根 AGENTS.md。
- 快速反馈：`npm test -- agent`；完整验收见 [验证说明](verification.md)。

## Agent 过程展示

制卡/改卡入口及历史标题统一显示“AI 制卡 / AI 改卡”。DeepSeek 内置目录由 `model/agent/ProviderCatalog.ts` 管理，默认 `deepseek-flash`（V4.1 Flash），保留 `deepseek-v4-pro`；`AgentSettingsStore` 读写时将目录外的旧模型恢复为当前默认，保留有效选择与其他提供商配置。

制卡与改卡共用 `AI制卡页.ets` 的顺序事件流，展示模型为 `model/agent/AgentTimeline.ts`。连续同类文本合并，工具状态在首次出现的位置更新；字段所属图片穿插显示。`tool_progress` 只提供参数生成预览，完整 `tool_call` 才能进入既有执行链。已校验草稿在工具完成时预览，整轮结果接收后才开放原编辑与确认控件；历史只恢复顺序和只读快照。停留底部时跟随流式更新，向上阅读时暂停跟随。


## 页面业务边界

- `AgentProviderContext.ts` 负责草稿语义上下文与 Provider 历史预算（最多80项、240000正文字符）；`truncateProviderText` 必须包括截断标记在内遵守额度，字段/操作丢失须标记 truncated。
- `AgentCardBatch.ts` 在第一处等待前复制整批选中字段和目标；每张卡仍经页面适配器调用 `AgentDraftExecutor.prepare/executeOrdinary`。单卡失败不中断整批，已保存卡不再创建；操作占用直到整批完成，成功才通知同步。
- 页面通过会话 ID 和消息 ID 回写状态，不能依赖异步开始时的数组索引。离页后执行器继续已接受写入，禁止访问旧 UI 或读取下一张卡的可变字段；错误文案在开始保存前固定。
- `AgentFileImport.ts` 的 `mergeAgentImportedFiles` 统一限制10个文件、160000正文字符。迟到文件解析不得进入另一个会话。
- `agent-page-models.test.mjs` 直接测试业务规则；`agent-page-lifecycle.test.mjs` 仅保留页面与真实模型的接线验证，覆盖离页、消息替换、整批输入与确认执行器路径。

- `AgentConversationTypes.ts` 定义持久化协议；`AgentConversationView.ts` 负责可见消息复制、历史投影和恢复，平台偏好读写留在 `AgentConversationStore.ets`。历史工具按消息 ID 归属，旧无归属记录独立展示；恢复时复制澄清和操作状态，不恢复写入令牌。
- `components/agent/AgentEditableCard.ets` 只呈现字段、选择和保存状态并上抛事件；`AgentHistoryList.ets` 只呈现历史和打开/删除事件。领域状态与执行器由页面协调，不向子组件传整个页面实例。
- 新边界直接行为测试见 `page-domain-models.test.mjs`；历史恢复覆盖原始 Provider 正文、推理、工具归属、旧记录、可变快照隔离。
