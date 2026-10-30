# 记得闪卡 JideCards

每天记得，记得闪卡

记得闪卡是面向鸿蒙 HarmonyOS NEXT 的原生开源闪卡应用，基于 Anki 内核，用于背单词、记忆知识点与备考。支持 FSRS 间隔复习、AnkiWeb 同步与 APKG 导入导出；当前源码还提供实验性个人设备直连卡库与媒体同步，以及键盘、鼠标操作。

- 当前源码版本：3.5.4（构建编号 3085）
- 华为应用市场版本：2.9.98
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 签名 HAP 开发包：[jidecards-v3.0.20-signed.hap](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/jidecards-v3.0.20-signed.hap) · [SHA-256 校验](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/SHA256SUMS.txt) · [构建说明](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v3.0.20)
- 开发包安装：签名开发包，安装受包内签名与设备授权限制；普通用户建议从华为应用市场安装。
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-10-27

本文按当前源码介绍功能，应用市场实际版本以下载页面为准。独立开源项目，非 Anki 官方客户端。

## 独立开发声明

截至目前，记得闪卡（jidecards）的开发与维护仍全程由可塑性天赋（wuweiyouzuoju）本人独立完成，不涉及团队协作或多人共同开发。任何声称“带领团队完成记得闪卡开发”，或将本项目归为团队开发成果的表述，均与事实不符。

## 学习与资料

- 背单词：把单词、释义和例句做成闪卡，或导入已有的 Anki APKG 词汇牌组；支持图片、音频和输入答案。
- 记忆知识点：把考试概念、公式和问答拆成卡片，用挖空卡回忆关键内容，用图像遮挡复习图中的信息。
- 间隔复习：先尝试回忆，再查看答案并按记忆情况评分。Anki 内核的 FSRS 调度据此安排后续复习时间。

- 复习：Anki 学习内核、FSRS 调度、四档评分、撤销与重做，支持按卡片或整条笔记埋藏与暂停。
- 卡片：普通卡、挖空卡、输入答案、图像遮挡；支持图片、音频与数学公式。
- 同步：AnkiWeb 集合与媒体同步、自定义服务器；实验性个人设备直连提供学习记录合并、卡库与媒体同步。
- 导入导出：APKG 导入导出与系统文件打开，集合备份及恢复；兼容 Anki 专用 MIME。
- 管理：牌组层级、搜索、批量编辑、标签与统计；独立牌组选项、预设管理及修改范围说明。
- 桌面与外观：桌面服务卡片、学习提醒、七套基础主题色，支持浅色、深色和跟随系统外观。
- JIDE 助手：软件内的全能助手：功能导航、学习分析、资料阅读、制卡改卡与设置协助。当前为默认隐藏的开发者调试功能。
- 键盘与鼠标：设置中的学习帮助集中展示各页快捷键与鼠标操作，支持编辑、学习及牌组、浏览列表与目录树右键。

## 主题与外观

七套基础主题色，支持浅色、深色和跟随系统外观。 可调整卡片字号、答题工具栏和动态背景，按自己的习惯学习。

## 3.5.4 源码更新说明

1. 新用户首页速览改为六页详细引导，覆盖牌组来源、导入同步、复习评分、制卡和日常操作。
2. 点击“稍后再看”、完成引导或按系统返回后，后续启动不再自动弹出；仍可在首页“更多 → 速览”手动重看。
3. 优化间隔与稳定度统计图表的内存占用，直接从计数桶计算分位数，保留中位数与范围口径。
4. 保留此前正文卡片引用、制卡、AnkiWeb 同步及 APKG 导入导出功能。

[完整功能](https://jidecards.com/works/jidecards/) · [使用指南](https://jidecards.com/guides/harmonyos-anki/) · [开发文档](https://jidecards.com/developers/)
