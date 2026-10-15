# 记得闪卡开发文档

原文：https://jidecards.com/developers/

项目优先服务 Agent 开发；这里的 Agent 指辅助作者开发仓库的编程 Agent。

- 当前源码版本：2.9.99（构建编号 3080）
- 华为应用市场版本：2.9.98
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-10-15

本文按当前源码介绍功能，应用市场实际版本以下载页面为准。独立开源项目，非 Anki 官方客户端。

## 独立开发声明

截至目前，记得闪卡（jidecards）的开发与维护仍全程由可塑性天赋（wuweiyouzuoju）本人独立完成，不涉及团队协作或多人共同开发。任何声称“带领团队完成记得闪卡开发”，或将本项目归为团队开发成果的表述，均与事实不符。

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

当前 JIDE 为开发者调试功能，发布配置默认隐藏入口。需解锁并配置模型服务后使用；联网检索另需开启应用端联网并配置搜索凭据。具体能力以当前应用、工具与发布说明为准。

## 机器可读入口

正文在构建时输出完整 HTML，功能、版本、平台、更新说明和能力边界由同一套内容生成 Markdown 与 JSON。

- [资料索引](https://jidecards.com/llms.txt)
- [完整资料](https://jidecards.com/llms-full.txt)
- [页面与内容 JSON](https://jidecards.com/data/site-index.json)
- [产品 JSON](https://jidecards.com/data/works.json)
- [网站地图](https://jidecards.com/sitemap.xml)
- [版本更新订阅](https://jidecards.com/releases.xml)
