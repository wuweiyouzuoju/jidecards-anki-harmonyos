# 记得闪卡 3.0.20 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-10-17。

1. 设备直连扩展为两类独立授权：同源卡库的学习记录合并，以及全部卡库与媒体同步。复用扫码配对和加密通道，双方均需明确授权；仍为实验功能，真实两机和真实 AnkiWeb 账号尚未验收。
2. 卡库直连支持牌组、笔记、模板、预设、卡片状态、标签及复习记录，媒体按内容差异分块传输。来源或结构不兼容时停止普通合并，由接收设备确认使用另一端卡库，并先创建可恢复备份；中断后可重新同步，尚无断点续传。
3. 快捷键与鼠标说明统一放在“设置 → 学习帮助 → 键盘快捷键”，按页面展示操作、焦点限制和当前学习绑定；移除各页面重复的帮助入口。
4. 优化深色模式下卡片正文的对比度，覆盖固定黑字、嵌套浅色块及脚本追加内容；学习与预览共用处理，切回浅色时恢复作者样式。图片或渐变背景等复杂配色仍需按具体卡片验收。
5. 完善牌组右键与长按菜单、指针位置、离开牌组选项后的生命周期，以及笔记编辑和模板更新时的草稿保护。
6. 移除幻彩主题限时领赠、解锁庆祝和相关宣传入口，保留既有主题权益与兑换状态；首页入门介绍和 JIDE 功能认知同步更新。
7. 修复设备发现、主动连接、取消与离页期间的迟到回调；卡库提交与媒体恢复日志、删除传播和云同步边界由扩展层维护，不修改 Anki 调度与 FSRS。
8. README、版本记录、官网指南、HTML、Markdown、JSON、完整文本及更新订阅同步至 3.0.20，提供对应签名 HAP 开发包与 SHA-256 校验文件。

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
