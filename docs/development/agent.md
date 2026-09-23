# 应用内 Agent

[返回任务索引](../../PROJECT_CONTEXT.md)

- 本页只描述产品运行时的应用内 Agent，不描述负责修改仓库的编程 Agent；编程 Agent 规则见 [编程 Agent](coding-agent.md) 和根 [AGENTS.md](../../AGENTS.md)。
- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：UI → 会话/Runner → 读取与提案；用户确认 → DraftExecutor / ActionExecutor → Service 或受控存储。
- 快速反馈：`npm test -- agent`；完整验收见 [验证说明](verification.md)。

## Agent 过程展示

制卡/改卡入口及历史标题统一显示“AI 制卡 / AI 改卡”。DeepSeek 内置目录由 `model/agent/ProviderCatalog.ts` 管理，默认 `deepseek-flash`（V4.1 Flash），保留 `deepseek-v4-pro`；`AgentSettingsStore` 读写时将目录外的旧模型恢复为当前默认，保留有效选择与其他提供商配置。

制卡与改卡共用 `AI制卡页.ets` 的顺序事件流，展示模型为 `model/agent/AgentTimeline.ts`。连续同类文本合并，工具状态在首次出现的位置更新；字段所属图片穿插显示。`tool_progress` 只提供参数生成预览，完整 `tool_call` 才能进入既有执行链。已校验草稿在工具完成时预览，整轮结果接收后才开放原编辑与确认控件；历史只恢复顺序和只读快照。停留底部时跟随流式更新，向上阅读时暂停跟随。


## 页面业务边界

- `AgentAuxiliaryTools.ets` 只负责读取、校验目标和生成辅助提案；不持有确认账本或执行提案写入。`AgentSessionController.ets` 拥有 `AgentActionExecutor.ets`，登记和恢复 pending 动作；页面确认入口才调用 `executeConfirmed`。
- `AgentActionExecutor.ets` 消费绑定 ID/种类/载荷的一次性确认，提交前重查牌组/笔记类型重名；记忆变更复用存储基线检查，分析授权只接受已冻结的 ID。`AgentDraftExecutor.ets` 仍负责 ChangeDraft 写入和高风险双确认，两者不是同一个确认协议。
- `ai-agent-v2-runtime.test.mjs` 执行真实会话、工具和辅助执行器，覆盖未确认无写入、重复/取消/篡改确认、名称冲突及崩溃恢复。`architecture-boundaries.test.mjs` 防止 Runner/Registry/工具经字面量模块依赖取得执行器；它不替代运行时权限测试。

- `AgentProviderContext.ts` 负责草稿语义上下文与 Provider 历史预算（最多80项、240000正文字符）；`truncateProviderText` 必须包括截断标记在内遵守额度，字段/操作丢失须标记 truncated。
- `AgentCardBatch.ts` 在第一处等待前复制整批选中字段和目标；每张卡仍经页面适配器调用 `AgentDraftExecutor.prepare/executeOrdinary`。单卡失败不中断整批，已保存卡不再创建；操作占用直到整批完成，成功才通知同步。
- 页面通过会话 ID 和消息 ID 回写状态，不能依赖异步开始时的数组索引。离页后执行器继续已接受写入，禁止访问旧 UI 或读取下一张卡的可变字段；错误文案在开始保存前固定。
- `AgentFileImport.ts` 的 `mergeAgentImportedFiles` 统一限制10个文件、160000正文字符。迟到文件解析不得进入另一个会话。
- 历史列表每次打开/关闭都更新读取代次；恢复历史、新建会话和手动选择类型使旧能力响应失效。笔记类型请求还独立去重，迟到失败不能清空新选择。离页后的文件解析及历史删除只完成已接受的存储操作，不回写旧 UI；回归见 `platform-warning-boundaries`。
- `agent-page-models.test.mjs` 直接测试业务规则；`agent-page-lifecycle.test.mjs` 仅保留页面与真实模型的接线验证，覆盖离页、消息替换、整批输入与确认执行器路径。

- `AgentConversationTypes.ts` 定义持久化协议；`AgentConversationView.ts` 负责可见消息复制、历史投影和恢复，平台偏好读写留在 `AgentConversationStore.ets`。历史工具按消息 ID 归属，旧无归属记录独立展示；恢复时复制澄清和操作状态，不恢复写入令牌。
- `components/agent/AgentEditableCard.ets` 只呈现字段、选择和保存状态并上抛事件；`AgentHistoryList.ets` 只呈现历史和打开/删除事件。领域状态与执行器由页面协调，不向子组件传整个页面实例。
- 新边界直接行为测试见 `page-domain-models.test.mjs`；历史恢复覆盖原始 Provider 正文、推理、工具归属、旧记录、可变快照隔离。
