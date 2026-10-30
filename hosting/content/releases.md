# 记得闪卡 3.8.0 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-10-30。

1. 重整原生界面：统一首页、牌组详情、统计、设置的卡片表面、圆角、边框及按钮，统一菜单、弹窗、搜索与选择控件。
2. 完善玻璃与扁平材质：优化深浅色对比度和按压反馈，共享幻彩背景与玻璃采样，修正全屏预览背景；默认扁平，通过一次推荐自主选择玻璃。
3. 完善界面衔接动效：首页与牌组详情工具栏、学习答题操作区、浏览多选操作区及编辑轮盘的状态切换采用共同的动效和恢复机制。
4. 调整首页牌组布局与操作：双列布局按完整顶级牌组子树分配到较短一列，减少成对排版留白；完善宽度建议、牌组菜单、摘要与详情展示。
5. 完善制卡字段布局：调整模式切换、标签、草稿预览与字段固定入口，统一轮盘工具的图标和文字呈现。
6. 新增编辑轮盘自动展开设置：分别控制进入编辑与键盘弹出时是否展开，并保存偏好。
7. 改进绘图文字调整：边缘控制点分别拉伸宽度或高度，角点保持等比缩放；同步调整选择框、控制点与工具布局。
8. 完善多语言与地区体验：提供 12 种语言与地区选项，统一日期和数字格式，调整长文案、大字体与窄屏布局。
9. 恢复幻彩兑换成功展示与粒子动效；关闭动画或进入后台时保留静态结果。
10. 同步 JIDE 的设置目录、编辑轮盘偏好和界面状态认知，沿用原有操作确认与保存边界。

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
