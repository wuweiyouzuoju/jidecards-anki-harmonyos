# 可维护性门禁与确认执行边界

状态：有效。承接 [编程 Agent-first](2026-09-agent-first.md)，不改变产品发布开关、用户确认语义、上游引擎或签名身份。

## 决策与原因

开发优先级必须落到实际责任边界、失败可定位的测试和受版本控制的知识中，不能只增加规则文本。本次完成剩余的代码边界、当前知识清理和交接治理；不按行数拆分所有页面，不把历史产品计划重新当作待办。

- 应用内 Agent 的辅助读取/提案与确认提交分离。`AgentAuxiliaryTools` 不再拥有账本或执行写入，`AgentSessionController` 拥有 `AgentActionExecutor`。现有 `AgentDraftExecutor` 继续负责 ChangeDraft；辅助动作与卡库草稿是两个明确的确认协议，不能写成“全部写入只有一个入口”。共用名称校验仍在读取/提案模块，执行器复用它并在提交时重查。
- 保持已有取消、重复确认、载荷绑定、恢复和错误语义；非法动作种类显式失败。真实模块测试覆盖提案无写入、确认后提交、未登记/篡改/取消/重复拒绝、名称冲突、记忆与分析授权。
- 依赖门禁覆盖应用字面量模块图，不默默忽略丢失的相对引用；禁止反向依赖 UI、纯 TS 模型传递依赖平台，以及工具经中间模块取得确认执行器。`.ets` 存储/主题适配器保留现有职责，不假装整个 model 目录都是纯函数。
- 当前规则不再引用本机忽略目录作为长期决策源。移除易过期的“当前测试数量”，保留明确日期和范围的历史验收；新增 Markdown 自动进入链接检查。
- 长期决策有有效状态与索引；状态所有者、直接测试和后续接手路径集中在 [模块责任与边界](../development/ownership.md)。临时日志不能成为新 checkout 必须依赖的知识。

## 验证与接手

快速反馈：`npm test -- agent`，以及 `node --test tools/tests/architecture-boundaries.test.mjs tools/tests/documentation-contract.test.mjs`。
完整交付：`npm run verify`，包括仓库、真实 Rust 主机、RPC、双架构 Rust 与签名 HAP；设备和真实 Provider 回归另行记录。实际运行结果写任务报告，不把本页的命令清单当成通过证明。

修改辅助动作从 [应用内 Agent](../development/agent.md) 开始；修改规则/验证从 [编程 Agent](../development/coding-agent.md) 与 [验证说明](../development/verification.md) 开始。每次交接按 [任务契约](../development/task-contract.md) 区分本任务修改和共享工作树验证范围，保留其他任务的未提交改动。

## 明确限制

静态门禁不证明所有架构语义、计算型加载或运行时权限正确；Node 平台替身不证明真实 Kit/Provider 行为；构建不证明设备交互。已有复杂页面仍按实际业务风险逐步演进，不以此次治理声明全项目没有技术债。当前可执行的治理入口已建立，不另留未定义的“下一轮”作为本决策的完成条件。
