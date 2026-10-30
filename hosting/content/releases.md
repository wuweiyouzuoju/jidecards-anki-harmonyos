# 记得闪卡 3.8.0 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-10-30。

1. 默认使用扁平材质，新旧扁平用户可通过一次推荐选择玻璃或保持当前设置。
2. 首页与其他页面共用幻彩背景，改进玻璃背景采样、全屏预览与兑换成功反馈。
3. 新增编辑轮盘设置，可分别控制进入编辑和键盘弹出时是否自动展开；优化深色玻璃控件与弹窗可读性。
4. 统一原生弹窗、菜单、选择器与按压反馈，提供玻璃与扁平材质，调整首页牌组、详情、摘要及学习答题操作区。
5. 浏览新增传统多列表格模式，支持独立的卡片与笔记列配置、列替换与排序，并改进多选操作入口。
6. 新建和编辑笔记支持正文卡片引用，配套 Anki 电脑端插件；改进字段编辑轮盘、富文本、绘图与草稿预览。
7. 提供 12 种语言与地区选项，统一日期、数字等地区格式，并调整长文案和大字体下的布局。
8. 完善首页入门、牌组菜单、统计图表与设备直连设置，并同步 JIDE 的功能目录与界面状态认知。
9. 保持 Anki Core 调度、AnkiWeb 同步和 APKG 导入导出链路；本轮是原生界面与交互的大范围调整，包含新功能与公共组件重构。

- 当前源码版本：3.8.0（构建编号 3101）
- 华为应用市场版本：2.9.98
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 签名 HAP 开发包：[jidecards-v3.0.20-signed.hap](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/jidecards-v3.0.20-signed.hap) · [SHA-256 校验](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/download/v3.0.20/SHA256SUMS.txt) · [构建说明](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v3.0.20)
- 开发包安装：签名开发包，安装受包内签名与设备授权限制；普通用户建议从华为应用市场安装。
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-10-30

本文按当前源码介绍功能，应用市场实际版本以下载页面为准。独立开源项目，非 Anki 官方客户端。

## 独立开发声明

截至目前，记得闪卡（jidecards）的开发与维护仍全程由可塑性天赋（wuweiyouzuoju）本人独立完成，不涉及团队协作或多人共同开发。任何声称“带领团队完成记得闪卡开发”，或将本项目归为团队开发成果的表述，均与事实不符。
