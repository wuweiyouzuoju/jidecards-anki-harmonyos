# 记得闪卡 JideCards

每天记得，记得闪卡

记得闪卡是面向鸿蒙 HarmonyOS NEXT 的原生开源闪卡应用，基于 Anki 内核，用于背单词、记忆知识点与备考。支持 FSRS 间隔复习、AnkiWeb 同步与 APKG 导入导出；当前源码还提供实验性个人设备直连卡库与媒体同步，以及键盘、鼠标操作。

- 当前源码版本：3.0.20（构建编号 3081）
- 华为应用市场版本：2.9.98
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 签名 HAP 开发包：[jidecards-v3.0.20-signed.hap](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/jidecards-v3.0.20-signed.hap) · [SHA-256 校验](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/SHA256SUMS.txt) · [构建说明](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v3.0.20)
- 开发包安装：签名开发包，安装受包内签名与设备授权限制；普通用户建议从华为应用市场安装。
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-10-17

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

## 3.0.20 源码更新说明

1. 设备直连扩展为两类独立授权：同源卡库的学习记录合并，以及全部卡库与媒体同步。复用扫码配对和加密通道，双方均需明确授权；仍为实验功能，真实两机和真实 AnkiWeb 账号尚未验收。
2. 卡库直连支持牌组、笔记、模板、预设、卡片状态、标签及复习记录，媒体按内容差异分块传输。来源或结构不兼容时停止普通合并，由接收设备确认使用另一端卡库，并先创建可恢复备份；中断后可重新同步，尚无断点续传。
3. 快捷键与鼠标说明统一放在“设置 → 学习帮助 → 键盘快捷键”，按页面展示操作、焦点限制和当前学习绑定；移除各页面重复的帮助入口。
4. 优化深色模式下卡片正文的对比度，覆盖固定黑字、嵌套浅色块及脚本追加内容；学习与预览共用处理，切回浅色时恢复作者样式。图片或渐变背景等复杂配色仍需按具体卡片验收。
5. 完善牌组右键与长按菜单、指针位置、离开牌组选项后的生命周期，以及笔记编辑和模板更新时的草稿保护。
6. 移除幻彩主题限时领赠、解锁庆祝和相关宣传入口，保留既有主题权益与兑换状态；首页入门介绍和 JIDE 功能认知同步更新。
7. 修复设备发现、主动连接、取消与离页期间的迟到回调；卡库提交与媒体恢复日志、删除传播和云同步边界由扩展层维护，不修改 Anki 调度与 FSRS。
8. README、版本记录、官网指南、HTML、Markdown、JSON、完整文本及更新订阅同步至 3.0.20，提供对应签名 HAP 开发包与 SHA-256 校验文件。

[完整功能](https://jidecards.com/works/jidecards/) · [使用指南](https://jidecards.com/guides/harmonyos-anki/) · [开发文档](https://jidecards.com/developers/)
