# 首页运行时与 RPC 验证边界

## 目标和范围

把首页同步、自动备份的定时器及异步收尾从 ArkUI 生命周期中分离，使真实业务编排可直接测试；把手工 RPC 编号的风险变为可执行的语义门禁。范围为首页宿主、两个模型控制器、后端错误分类和验证工具。保留 UI 布局、牌组表单、既有引导/公告协调器和 Anki 引擎，不以首页行数决定拆分。

## 责任与不变量

- `HomeSyncController` 拥有同步检查时钟、待执行导航、刷新与提醒；页面拥有可观察 UI 状态和平台效果。同步任务本体仍由同步面板/共享集合租约拥有，控制器销毁不代表网络或已接受写入回滚。
- `HomeBackupController` 只接受宿主能力和后端工厂，不导入 Kit/ETS；`BackupCoordinator` 拥有实际备份互斥，Core 拥有保留策略。后台或销毁使待处理配置读取失效，不中断已接受备份。
- RPC 别名按名称绑定，基线从明确的生成产物导出；核对全部本地服务/方法，拒绝未知表。源码指纹与显式生成产物的校验分开，不把缓存存在等同于本次生成。
- 外部错误的未知 `kind`/`nativeStatus` 保留原值；`knownKind`/`knownNativeStatus` 提供已知枚举视图，未知返回 null，不伪造 INVALID_INPUT。
- 包名、签名、用户数据、Anki 锁定版本和 RPC 行为不变。工作树中的其他用户/任务修改不回退。

## 验证和交接

运行 `npm test -- home`、`npm test`、`node tools/verify-rpc-index.mjs`、`npm run verify`。直接行为测试入口为 `home-sync-controller`、`home-backup-controller`、`rpc-index-contract`；页面组合回归仍在 `sync-automatic`、`page-operation-boundaries`。平台映射以 HAP 编译为准，Node 不能证明 ArkTS 类型检查通过。

设备验收单独覆盖前后台、手动同步返回、学习等待和公告/备份交错；未执行设备测试不能由构建成功代替。此项重构不声称首页所有 UI 状态已经移出，后续牌组选项和云端导入应按当前领域文档的实际责任链演进，而非继续机械搬运代码。
