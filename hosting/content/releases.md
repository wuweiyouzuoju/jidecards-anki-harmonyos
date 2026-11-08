# 记得闪卡 26.11.03.1 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-11-02。

1. 自定义主题色增加浅色、深色各自的明暗适配强度，可预览原始颜色与实际强调色，保存或取消预览。
2. 统一宽屏、窄屏下通过更多按钮或长按打开牌组设置的效果：背景保留阴影并增加强模糊，菜单和牌组预览保持清晰。
3. 卡片脚本异常改为独立的详情入口，复用已有弹窗查看错误信息，避免技术堆栈直接占据卡片正文。
4. 补充半屏、悬浮和全屏切换时的内容布局适配；复查玻璃与扁平材质、主题色切换，以及八个首页摘要分页，未复现旧版白底残留，摘要与牌组列表左右边界保持对齐。
5. 源码展示版本改用日期加递增序号：日期取发布操作当日的次日，最后一段为常规递增序号；本次为 26.11.03.1。
6. 完善字段展开窗口：保留当前字段草稿和编辑模式，补齐输入边界，移除展开窗口中重复的模式按钮。
7. 统一页面玻璃背景：设置、学习、编辑、浏览、牌组选项和预览外层随材质切换，玻璃时透出根背景，扁平时保留原底色。
8. 提高字段模式按钮文字对比度，依据实际主题实底选择黑色或白色文字。
9. 首页入门按 Anki 经验分流，新用户增加闪卡、准备第一副牌组与日常复习教学；完成选择并保存后才进入导入、新建或同步。
10. 完善浏览多选完整计数、牌组快捷操作及自定义学习数值记忆。

- 当前源码版本：26.11.03.1（构建编号 3140）
- 华为应用市场版本以下载页面为准。
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 签名 HAP 开发包：[jidecards-v3.0.20-signed.hap](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/jidecards-v3.0.20-signed.hap) · [SHA-256 校验](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/SHA256SUMS.txt) · [构建说明](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v3.0.20)
- 开发包安装：签名开发包，安装受包内签名与设备授权限制；普通用户建议从华为应用市场安装。
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-11-02

本文按当前源码介绍功能，应用市场实际版本以下载页面为准。独立开源项目，非 Anki 官方客户端。

## 独立开发声明

截至目前，记得闪卡（jidecards）的开发与维护仍全程由可塑性天赋（wuweiyouzuoju）本人独立完成，不涉及团队协作或多人共同开发。任何声称“带领团队完成记得闪卡开发”，或将本项目归为团队开发成果的表述，均与事实不符。
