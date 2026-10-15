# 记得闪卡 2.9.99 源码更新说明

原文：https://jidecards.com/releases/
更新日期：2026-10-15。

1. 设备直连已接入扫码配对、个人设备授权及同源卡库的复习历史和学习状态合并，支持向多台个人设备补拉记录；保留 AnkiWeb，牌组与媒体传输尚未接通。
2. 首页、浏览、学习、编辑和模板界面提供本页快捷键说明；学习页显示当前生效的自定义绑定，补齐撤销与重做、整条笔记埋藏和暂停等操作。
3. 学习页新增显示提示、查看上一张卡片信息、录制和回放学习录音，录音可选择保存，未保存录音随本次学习结束清理。
4. 牌组右键菜单在指针位置打开，长按使用同一组操作；补齐添加卡片、新建子牌组、牌组选项和导出入口，并保留显式操作目标。浏览列表和目录树复用原选择及上下文操作。
5. 新增与编辑笔记支持保存、牌组、类型、模板、标签、字段跳转和格式快捷键；修改属性或模板后保留未提交草稿，并提供当前页面说明。
6. 牌组选项改为独立页面，提供离开前的草稿保护、预设管理和修改范围选择，明确标注影响所有牌组的设置。
7. 完善卡片作者 HTTP 脚本、嵌套请求和授权表单兼容，保留有内容的卡面并提示脚本失败；缺少可选依赖时继续执行后续脚本，授权仍由作者服务验证。
8. 系统文件打开入口兼容 Anki 专用 MIME application/vnd.anki，确认导入选项后读取获授权的 APKG 文件。
9. 同步维护 JIDE 的页面、菜单、设置与快捷键认知，以及 README、官网 HTML、Markdown、JSON、完整文本和更新订阅。

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
