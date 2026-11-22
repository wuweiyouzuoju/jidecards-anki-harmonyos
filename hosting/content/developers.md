# 记得闪卡开发文档

原文：https://jidecards.com/developers/

项目优先服务 Agent 开发。编程 Agent 和开发者可以从项目索引找到代码入口，再按模块查看构建和验证要求。

- 华为应用市场正式版：26.11.15.15（已上架）
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-11-14

记得闪卡是使用 Anki Core 的独立开源项目。

[独立开发声明](https://jidecards.com/about/independent-development/)

当前仓库版本：26.11.22.19（构建编号 3159）。

[签名 HAP 开发包](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v26.11.09.9/jidecards-v26.11.09.9-signed.hap) · [SHA-256 校验](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v26.11.09.9/SHA256SUMS.txt) · [构建记录](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v26.11.09.9)。

签名开发包，安装受包内签名与设备授权限制；普通用户建议从华为应用市场安装。

## 责任与构建入口

- [开发约定](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/AGENTS.md)
- [项目索引](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/PROJECT_CONTEXT.md)
- [环境与构建](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/README.md)
- [模块责任与边界](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/development/ownership.md)
- [扩展点](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/development/extension-points.md)
- [开发任务契约](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/development/task-contract.md)
- [验证命令与范围](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/development/verification.md)
- [功能状态与兼容边界](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/FEATURE_STATUS.md)
- [JIDE 实现与验证](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/main/docs/development/agent.md)

公开发布的 26.11.15.15 版本配置中，JIDE 入口默认显示。使用 JIDE 需要配置模型服务。使用联网检索时，还需在应用中开启联网并配置搜索凭据。

[该版本入口配置](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/blob/v26.11.15.15/entry/src/main/ets/entryability/EntryAbility.ets)

## 机器可读入口

正文在构建时输出完整 HTML，功能、版本、平台、更新说明和能力边界由同一套内容生成 Markdown 与 JSON。

- [资料索引](https://jidecards.com/llms.txt)
- [完整资料](https://jidecards.com/llms-full.txt)
- [页面与内容 JSON](https://jidecards.com/data/site-index.json)
- [产品 JSON](https://jidecards.com/data/works.json)
- [网站地图](https://jidecards.com/sitemap.xml)
- [版本更新订阅](https://jidecards.com/releases.xml)
