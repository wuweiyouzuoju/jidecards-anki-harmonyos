# 参与贡献

感谢帮助改进记得闪卡。使用问题、缺陷和功能建议可以通过 [Issues](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/issues) 提交；代码、文档、翻译和测试通过 Pull Request 贡献。

## 报告问题

优先使用仓库的问题模板，提供应用版本及来源、设备型号、系统/API 版本、复现步骤、预期与实际结果。模板、媒体或导入问题最好附最小示例；先移除个人资料、账号、API 密钥及签名材料。区分“源码存在”“构建通过”和“实际设备通过”，避免把单一设备的问题扩写为所有版本的问题。

## 准备开发环境

按 [README](README.md#从源码构建)准备 Node 24、锁定 Anki Core、Rust、DevEco 和本机签名。公共仓库不包含 `third_party/anki`、本机签名或构建缓存；不要提交这些目录。

进入项目先读 [AGENTS.md](AGENTS.md) 和 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)，再按路径读取 `.agents/rules/paths/` 与对应领域文档。入口索引见[文档导航](docs/README.md)，跨模块行为遵守[开发任务契约](docs/development/task-contract.md)。

## 修改与验证

1. 沿用户入口、领域服务和测试确认责任边界，保留当前工作树中已有的修改。
2. 复用公共实现，保持包名、签名身份、用户数据和锁定 Core 协议；调度不在前端重写。
3. 用领域测试取得快速反馈，交付前运行完整门禁。新增行为附能验证结果的回归，文档修改检查链接和事实来源。
4. 更新对应领域文档；涉及长期边界时在 `docs/decisions/` 记录理由、范围和验证入口。

常用命令：

```bash
npm ci
npm run impact
npm test -- agent          # 根据任务换成 home / study / browser / sync 等领域
npm run verify -- repo    # 仓库、文档与全部 Node 回归
npm run verify            # Windows DevEco 主机：原生、双架构与 clean 签名 HAP
```

具体适用范围见[验证说明](docs/development/verification.md)。UI、权限、媒体、网络和生命周期的设备验收独立记录；未执行的检查写明原因。设备只能覆盖安装，使用 `hdc -t <connect-key> install -r <signed-hap>`，保留集合与媒体。

## 提交与 Pull Request

提交按可理解的功能或修复拆分，依赖按顺序提交；相关测试随实现提交。共享接口变更说明调用方，避免把格式整理、功能修改和发布材料混成一份难以审阅的差异。

提交标题沿用仓库风格，例如：

```text
feat(agent): read local documents page by page
fix(study): preserve answer input during card refresh
docs: update source capabilities and contribution guide
```

PR 说明具体触发条件、最终行为、验证结果及未验证范围。界面变化附有版本和设备信息的实际截图；新增声明不能以静态截图代替行为验证。不要提交临时日志、调试截图、崩溃转储、密钥或 IDE 缓存。

贡献遵循项目的 [AGPL-3.0-or-later 许可证](LICENSE)；新增第三方内容保留其版权、许可证和来源，维护 [NOTICE.md](NOTICE.md) 或对应模块的声明。
