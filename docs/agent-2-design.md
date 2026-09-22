# 应用内 Agent 当前设计

> 当前发布状态：Agent 实现仍在源码中，2.7.9 默认关闭首页、学习页、浏览页和设置页
> 的全部 Agent 入口。开发者在设置页输入版本密钥后，`ReleaseFeatures.ets` 会持久化
> 解锁状态并通过 AppStorage 统一开放入口；普通用户仍不会默认看到这些功能。

## 产品行为

- 制卡与改卡共用同一套会话、Runner、工具、草稿和确认机制。
- 用户可以先普通聊天；没有产生合法草稿时，系统不会把模型正文中的“已完成”
  当作成功。
- 制卡目标由本地 UI、经实体校验的 `configure_create_target` 或确认后新建的牌组/类型
  设置；制卡工具不能在卡片参数中夹带任意目标，生成草稿时绑定已校验的目标 ID。
- 改卡可从当前学习卡、浏览选择或无预选入口建立范围；进入页面本身不请求 Provider。
- 只有影响结果的关键歧义才使用 `request_clarification` 暂停，用户回答后在同一
  会话检查点继续。
- 草稿可编辑和勾选。普通写入需要确认；删除、笔记类型迁移、模板/CSS 等高风险
  操作需要额外确认。

## 模块边界

```text
AI制卡页
  -> AgentSessionController：请求、暂停、恢复、取消
  -> AgentRunner：有界 Provider/工具循环与失败预算
  -> Provider Adapter：DeepSeek / OpenAI / Custom Responses 协议
  -> AgentToolCatalog：唯一模型可见 Schema、说明和调用模板
  -> AgentScope：本轮稳定 ID 与读写范围
  -> CardAgentTools / HighRiskAgentTools / AgentAuxiliaryTools：读取或生成提案
  -> AgentDraftExecutor：确认后的 ChangeDraft 卡库写入
  -> AgentActionExecutor：确认后的辅助动作（牌组/类型、记忆、分析授权）
  -> 既有 ArkTS Service -> Anki Core
```

页面负责呈现和用户交互，不直接实现工具语义；Provider 适配器不调用卡库 Service；
工具只能生成结构化结果或草稿，不能绕过执行器直接写 collection。
`AgentSessionController` 拥有辅助动作执行器和确认登记；Runner/Registry/提案工具
不依赖任何确认执行器。辅助工具可以保存已验证的目标选择，不等于有权提交卡库修改。

## 权限与安全

- 模型不能访问裸后端 RPC、SQLite、任意文件系统路径、shell 或应用密钥存储。
- 每条用户消息前刷新 `AgentScope` 的本轮操作上下文，保留会话已发现的只读 ID
  与检索进度；新会话才重置。读取权限不会自动升级为写权限。
- 写入前重新读取 baseline；目标已变化时停止，避免旧草稿覆盖新内容。
- ChangeDraft 确认令牌有范围、级别、有效期和一次性约束，不从历史恢复。
  辅助动作使用会话账本绑定 ID、种类和完整载荷，仅 pending 动作可恢复待确认；
  executing 的崩溃恢复标为结果未知，不提供盲目重试。两类协议不能混用。
- 历史只保存经过脱敏和限长的可见正文、思考摘要、来源和工具审计；不保存 API
  密钥、媒体原始字节、隐藏推理或可重放的旧确认令牌。
- 工具参数按固定 Schema 解码，未知字段、越权 ID、重复草稿 ID 和裸 RPC 参数被拒绝。
- 相同工具失败有有界纠错和熔断，不能无限循环。

## 检索、联网与媒体

- 卡库检索支持稳定 ID 分页、长字段分段读取和跨轮保存已发现 ID。声称“已遍历
  全库”前必须真的完成分页；达到预算时应报告暂停位置。
- Provider 协议保留 web search 事件和 HTTPS 来源解析，但当前页面发送请求时固定
  `searchMode: 'off'`。因此当前产品行为是“联网搜索关闭”，不能根据 Provider
  capability 表宣称可用。
- 图片工具可以搜索、下载并通过受控媒体服务写入 Anki media；卡库图片理解和
  音频转写不属于当前能力。

## 会话与展示

- 可见顺序由页面实现统一控制，包含模型正文/思考摘要、工具过程、来源、草稿和操作。
- 简洁版与实验版使用相同模型、工具和安全策略，只改变工具详情的默认展开状态。
- 澄清问题使用普通对话样式；提交后保留问题与独立用户回答，隐藏已用完的回答控件。
- Provider 没有返回思考时不生成替代思考；历史中缺少消息归属的旧工具记录不猜测归属。
- 局部支持 `**文字**` 粗体，但不是完整 Markdown 渲染器。

## 重新开放前的验证门

- 必须在待开放的实际工作树运行 Agent 聚焦测试与完整 `npm test` 并全部通过，不能沿用历史结果。
- `npm run build:app` 完成双架构 Rust、ArkTS 类型检查和签名 HAP 构建。
- 在实体手机上验证创建普通/填空/自定义类型卡片，以及学习页和浏览页改卡。
- 使用真实 Provider 验证流式、工具选择、取消、断网、重试、历史恢复和长任务续接。
- 对普通写入、部分失败、baseline 冲突和所有高风险工具进行真实 collection 回归，
  测试前先备份。
- 若重新开放联网搜索，单独验证真实搜索事件、HTTPS 来源、无来源失败和不支持搜索
  的 Provider，不允许 UI 伪造“已联网”。

历史设计过程位于 [superpowers/](superpowers/README.md)。其中旧工具名、旧 UI
折叠规则、3.0.0 版本号和历史测试数量都只用于追溯。
