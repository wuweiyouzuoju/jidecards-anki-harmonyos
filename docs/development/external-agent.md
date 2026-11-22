# 外部 Agent 本地 MCP

[返回应用内 Agent](agent.md) · [返回任务索引](../../PROJECT_CONTEXT.md)

## 接入和授权

入口为鸿蒙电脑/2in1 的「设置 → 高级 → 外部 Agent 接入（MCP）」。高级设置仅在实验版显示；手机和平板不显示此分组。默认关闭；用户开启后，应用在本机回环地址提供 MCP Streamable HTTP。系统安全存储中是否存在令牌决定下次启动是否恢复，设置页可复制配置。关闭会撤销旧令牌，重新开启会生成新令牌；退出应用只停止监听，不撤销授权。配置不进入日志、历史或 AppInterface。

- 应用生命周期和凭据归 `ExternalMcpService`；套接字继续校验令牌、Host 与 Origin，只监听 IPv4 回环。WorkBuddy 拉起应用及系统最小化行为尚未验证。
- 不打开 JIDE 时，应用通过 `ExternalMcpLibrary` 提供牌组、笔记类型、搜索、笔记内容、学习统计等只读工具。此入口使用独立读取 Scope。
- 打开 JIDE 通用助手后，现有 Registry 接管工具调用，提供完整目录及原有的确认界面。修改、删除、辅助操作和制卡提案仍依赖这个宿主，确认及权限边界不变。两套 Scope 不互相授权；切换到 JIDE 后，需在当前宿主重新读取工具或稳定 ID。
- 离开 JIDE、切换历史或新建会话，不关闭监听；原会话仍按原协议清理运行状态，过期提案不能跨会话执行。应重新查询工具列表；确认、保存与结果读取依赖发起调用的会话仍有效。

## 客户端调用顺序

客户端配置中的端点使用 `http://127.0.0.1:28761/mcp`，请求头使用配置弹窗给出的 Bearer 令牌。配置示例只展示占位值：

```json
{
  "mcpServers": {
    "jidecards": {
      "type": "http",
      "url": "http://127.0.0.1:28761/mcp",
      "headers": { "Authorization": "Bearer <本次令牌>" }
    }
  }
}
```

1. `initialize`，再发送 `notifications/initialized`；`tools/list` 返回当前全部可用定义。也保留 `discover_tools` 语义检索工具。
2. `list_decks({"query":"","limit":20})`、`list_notetypes({"query":"","limit":20})`，分页直到相应 `nextOffset=-1`；稳定 ID 必须来自真实工具结果。
3. `configure_create_target({"deckId":真实ID,"notetypeId":真实ID})` 配置目标；也可以调用 `request_create_target` 让用户在记得选择。仅改变后续制卡目标，不保存卡片。
4. `create_flashcards({"cards":[{"fields":["正面","背面"]}]})`；字段数量、字段语义和类型仍由原工具校验。返回 `requestId` 和 `awaiting_confirmation`，不等于保存成功。
5. 用户在记得里预览、编辑并点击原保存/确认控件。`get_external_request_status({"requestId":"返回的ID"})` 读取真实卡片状态、操作结果或澄清答案。`failed`、`partial`、`conflict`、取消和执行结果不确定不能报告为已完成。复杂卡库操作还可沿用 `get_operation_result` 分页读取结果。

每个工具调用的 MCP 内容包含 `requestId`、原工具 `output` 与状态；图片内容使用 MCP image content 返回。工具错误使用 `isError=true`，协议错误使用 JSON-RPC error；未就绪不会回空成功。相同 JSON-RPC 请求 ID、相同参数在本次监听内重试复用原回执（包括仍在执行的请求），相同 ID 换参数拒绝。结果轮询必须使用新的 JSON-RPC ID。不同 ID 的请求不保证业务幂等；断连后先核实状态，不能盲目重试写提案。

当前为有界本机会话：最多 8 条连接、每条连接 120 秒、请求正文 1 MiB、头部 16 KiB；单连接一个 HTTP/1.1 请求，要求 `Content-Length`，拒绝重复头、传输编码和流水线请求。JSON-only 响应，不提供 SSE/GET 订阅、OAuth 发现或自动唤起。支持协商 `2025-03-26`、`2025-06-18`、`2025-11-25`，按后者返回当前服务能力；不支持的 HTTP 协议版本头拒绝。调用回执有界保存，达到会话上限后应停止并重新开启。

## 责任入口

| 入口 | 责任 |
| --- | --- |
| [LocalMcpProtocol](../../entry/src/main/ets/model/external-agent/LocalMcpProtocol.ts) | 纯 HTTP 收帧、鉴权策略、MCP 编解码、同 ID 回执复用 |
| [LocalMcpServer](../../entry/src/main/ets/backend/external-agent/LocalMcpServer.ets) | Socket、随机令牌、连接与停止代次；回执发送后才通知导航完成 |
| [ExternalAgentBridge](../../entry/src/main/ets/backend/external-agent/ExternalAgentBridge.ets) | 真实 Registry/目录适配、串行工具调用、将结果交回 UI 宿主；不导入确认执行器 |
| [ExternalRequestStatus](../../entry/src/main/ets/model/external-agent/ExternalRequestStatus.ts) | 从真实消息、草稿、动作、卡片保存和澄清派生结果状态 |
| [AI制卡页](../../entry/src/main/ets/pages/AI制卡页.ets) | 当前助手会话及原预览、确认和执行入口 |
| [AgentToolRegistry](../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets) | 当前注册处理器的唯一事实来源；业务工具仍使用原实现 |

设置界面和 JIDE 共用高级分类的 `external_mcp` 分组声明。设置面板发布 `external_mcp_settings` 的非敏感状态；这些观察不提供远程开启、令牌读取或自动确认能力。

## 工单依据和验证边界

2026-11-19 读取[华为工单 D654589](https://developer.huawei.com/consumer/cn/support/feedback/#/ticketDetail?ticketNo=D654589)：11月18日回复确认 Socket 可绑定回环地址、使用 `INTERNET` 权限；关于最小化继续响应的说明明确以“仅声明支持 PC/2in1 的应用”为前提。11月19日追问的手机/平板/电脑共包情况当时尚无回复。本应用仍同时声明 phone、tablet、2in1，不将前一结论扩展为本应用已获保活保证。

接口依据 [Network Kit Socket 文档](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/js-apis-socket#bind-2)及 [MCP 2025-11-25 传输规范](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/transports.mdx)。关闭窗口/进程退出后不提供服务；锁屏、失焦、最小化后的持续响应需要独立设备验收。

自动验证入口：`npm test -- agent` 包含 [外部 MCP 回归](../../tools/tests/ai-agent-external-mcp.test.mjs)。直接执行真实协议、桥接和 Socket 适配代码（只替换系统 Socket/随机源），覆盖中文分片、报文边界、鉴权、工具目录、图片、错误、原提案对象、串行、关闭、结果状态与发送后导航。既有 JIDE 行为回归继续覆盖 Scope、确认账本和实际业务执行器。HAP 增量编译独立于 Node 回归。

本次用户最后明确要求仅检查代码，不做模拟器或真机验收。因此没有 WorkBuddy 端到端成功证据、设备上的新卡片检查或最小化/锁屏验证；不能把测试替身、编译成功或工单回复写成上述行为已验证。WorkBuddy 的具体配置格式、HTTP 自定义头支持及版本兼容性也须客户端实测。
