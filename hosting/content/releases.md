# 记得闪卡 3.5.4 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-10-27。

1. 新用户首页速览改为六页详细引导，覆盖牌组来源、导入同步、复习评分、制卡和日常操作。
2. 点击“稍后再看”、完成引导或按系统返回后，后续启动不再自动弹出；仍可在首页“更多 → 速览”手动重看。
3. 优化间隔与稳定度统计图表的内存占用，直接从计数桶计算分位数，保留中位数与范围口径。
4. 保留此前正文卡片引用、制卡、AnkiWeb 同步及 APKG 导入导出功能。

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
