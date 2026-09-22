# `entry/` 局部规则

## 适用路径

本规则适用于 `entry/` 下的 ArkTS、资源、页面、组件、模型、存储和平台桥接改动。

## 修改边界

- 页面和组件负责展示与用户输入；业务编排放在可直接测试的 controller、policy、repository 或 service 中。
- `model/` 负责稳定领域模型和纯业务规则；`backend/` 负责平台或网络边界；页面不得成为跨层协议。
- 需要跨模块共享的状态必须指定唯一拥有者、写入入口和生命周期；不要用可变全局 UI 状态代替协议。
- 应用内 Agent 属于产品运行时能力，遵守现有安全边界；不要把应用内 Agent 文档当作编程 Agent 规则。

## 验证

- 先按任务选择 `npm test -- home|study|sync|browser|media|agent|ui`，结束前运行 `npm test`。
- ArkTS、资源、模块结构或依赖方向改动必须在可用 DevEco 主机上运行 `npm run verify`；仅 Node 规则改动可使用 `npm run verify -- repo`。
- UI、IO、媒体和设备生命周期改动要记录实际设备验收范围；构建通过不等于交互通过。
