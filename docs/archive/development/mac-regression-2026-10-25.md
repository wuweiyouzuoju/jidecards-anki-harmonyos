# Mac 迁移后回归诊断

## 四项测试失败：原有测试/生成资料过期

- Provider 批量上限：旧测试要求内联固定数组。实际 UI 已委托 selectBatchLimit，保留自定义值、非法索引及禁用状态保护。静态接线检查更新到真实入口；既有 ui-select-layout 行为测试实际执行行属性与回调，覆盖 1、37、100、250、500、999、1000、非法索引与加载中回调，未退回旧实现。
- 首页牌组预览：方法抽取夹具漏装真实 closeSyncChoice 与 HOME_SYNC_CHOICES。补入真实实现和共享声明；后台场景同时验证同步选择器关闭、检查状态重置、代次失效。返回场景不预先打开无关弹窗，继续断言迟到预览不能重开界面。
- 首页公告：旧源码正则要求暂停公告是 onPageHide 第一条语句；当前先关闭同步选择器。改为检查整个 onPageHide 方法的必要动作，保留公告暂停、预览失效和停止同步计时器要求。
- 协议 inventory：生成报告漏记 NoteLinksDraftPanel、NoteReferences 三处真实调用。按现有生成器更新清单；协议编号、消息、描述符、Core 和 ABI 均未更改。

相关五文件测试运行 254 项，全部通过。随后完整 `npm run verify -- repo`：3522 项，3520 通过，0 失败，2 跳过。日志位于本机 `~/Developer/harmony/build-reports/jidecards-regression-fixes.log` 与 `jidecards-repo-tests-fixed.log`。

## 构建警告：不能与上述测试失败混为一谈

当前编译 SDK 为 API 26，项目锁定基线为 API 23。HAP 和双架构原生库确实生成成功，但警告门禁失败。

本机 SDK 的 component/circle.d.ts 新增 CircleAttribute.fill(ResourceColor | ColorMetrics) 与 stroke 声明，标记 since 26.0.0；旧 CommonShapeMethod.fill(ResourceColor) 仍标记 since 11。现有颜色调用被新声明遮蔽，产生 API 26 可用性诊断。这个证据说明绘图诊断不能直接解释为旧设备缺少已有 fill 功能，不能为压警告重写 UI 或抬高最低系统版本。

其他诊断包括编译器 gcc-toolchain 参数、显式无签名提示、组件 create 命名、音频/加密等 syscap 和 2in1 可用性。应用实际声明 phone/tablet/2in1；不能把这些全归因于 Mac，也不能直接删掉 2in1 或批量忽略。应先使用锁定的 DevEco 6.1.0.860 / SDK 6.1.0.105 建立同基线对照，再对仍存在的设备能力问题逐项处理。

当前 DevEco 的 HarmonyOS SDK 设置只提供其内置 API 26，没有 API 23 单独安装项。没有修改或降级已安装 IDE、没有放宽警告基线、没有改系统能力声明。当时正式签名因旧机器密码密文不可解密单独待处理；2026-10-27 已沿用原发布材料完成3.5.4的release/app_gallery签名及SDK验签，与上述警告分开记录。
