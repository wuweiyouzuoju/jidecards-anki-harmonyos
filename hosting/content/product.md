# 记得闪卡 JideCards

原文：https://jidecards.com/works/jidecards/

记得闪卡是面向 HarmonyOS NEXT 的开源闪卡应用，兼容 Anki 牌组，适配鸿蒙手机、平板和电脑。可以自己做卡，也可以导入已有的 APKG 牌组。每次先回想答案，再翻卡评分，FSRS 按你的回忆情况安排下次复习。换设备时，用 AnkiWeb 同步卡片和学习进度。

- 华为应用市场正式版：26.11.15.15（已上架）
- 平台：HarmonyOS NEXT
- 许可证：AGPL-3.0-or-later
- 作者：[可塑性天赋](https://jidecards.com/about/)
- 下载：[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)
- 源码：[GitHub](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [Gitee](https://gitee.com/wuweiyouzuoju/jidecards-anki-harmonyos) · [GitCode](https://gitcode.com/wuweiyouzuoju/jidecards-anki-harmonyos)
- 更新日期：2026-11-14

记得闪卡是使用 Anki Core 的独立开源项目。

[独立开发声明](https://jidecards.com/about/independent-development/)

## 学习场景

- 背单词：把单词和例句放在正面，释义放在背面。想练拼写，可以做成输入答案的卡，也可以导入已有的 APKG 词汇牌组。
- 记忆知识点：把一个概念、公式或考点拆成一个能单独回答的问题。遇到解剖图、地图等图片，可以遮住要记住的部位。
- 间隔复习：翻面前先试着回答。翻面后按刚才的回忆情况评分，让 FSRS 安排下一次复习。

## 功能概览

- [导入或新建牌组](https://jidecards.com/works/jidecards/technical/#apkg) — 已有 Anki 牌组就导入 APKG，词汇、例句和备考卡片原样带到鸿蒙。也可以从空白牌组开始自己做卡。
- [先回想，再翻面评分](https://jidecards.com/works/jidecards/technical/#fsrs) — 翻面后按实际回忆情况选一档评分，FSRS 据此安排下一次复习，记得牢的卡会隔得更久。
- [换设备接着学](https://jidecards.com/works/jidecards/technical/#ankiweb) — 用同一个 AnkiWeb 账号同步卡片、媒体和学习记录，在另一台设备上接着同一份进度。

## 全部功能

- FSRS 复习：每张卡有四档评分。误点可以撤销或重做，也可以暂时埋藏或暂停某张卡、整条笔记。
- 卡片编辑：做问答卡、挖空卡、输入答案卡或图像遮挡卡。字段里可以放图片、音频与数学公式。
- 同步：用 AnkiWeb 同步集合与媒体，也可以连接自定义同步服务器。华为云空间提供手动卡库同步。个人设备直连仍是实验功能。
- 导入与备份：用 APKG 移动牌组，用 COLPKG 备份整套集合。可以从应用导入，也可以从支持 Anki 文件类型的系统入口打开牌组。
- 牌组与统计：牌组可以分层管理，卡片可以按标签搜索和批量编辑。统计页可以查看复习记录与到期情况。
- 外观与提醒：设置学习提醒或添加桌面服务卡片。可切换浅色、深色与跟随系统外观，也可为文字、卡片和弹窗调整颜色与边框。
- 键盘与鼠标：在学习帮助里查各页快捷键。牌组、浏览列表和目录树可用鼠标右键打开操作菜单。
- 查找与批量编辑：在浏览页按条件查卡片，或切到传统表格。卡片与笔记分别保存显示列。编辑时可以使用富文本、白板和字段工具转盘。
- 笔记引用：笔记正文可以链接到其他笔记，学习和预览时都能打开。电脑端需另外安装配套 Anki 插件。
- 语言与地区：应用有 12 种语言与地区选项，包括简体中文、香港与台湾繁体中文、英式与美式英语、意大利语、日语、越南语、韩语、俄语、德语和法语。日期与数字按所选地区显示。

## 应用截图

### 你的个人知识卡库

首页按牌组列出今天要学的新卡和到期的复习卡，点开牌组就能开始。

![你的个人知识卡库](https://jidecards.com/assets/jidecards-26.11.20.17-01-personal-library.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 牌组与资料获取

在数据管理里导入 APKG 牌组或文本资料，也可以从头新建牌组。

![牌组与资料获取](https://jidecards.com/assets/jidecards-26.11.20.17-02-decks-and-sources.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 多学科学习

同一套卡库里放 GRE 词汇、古诗词填空和机器学习概念，各自按牌组学习。

![多学科学习](https://jidecards.com/assets/jidecards-26.11.20.17-03-multi-subject.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 自动安排复习间隔

翻面后按回忆情况评分，FSRS 据此安排这张卡下一次出现的时间。

![自动安排复习间隔](https://jidecards.com/assets/jidecards-26.11.20.17-04-spaced-review.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 多种学习方式

问答卡先回想再翻面，挖空卡把要记的词句遮住再作答。

![多种学习方式](https://jidecards.com/assets/jidecards-26.11.20.17-05-study-modes.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 制卡编辑与预览

在编辑页填写字段，保存前先预览这张卡正反两面的样子。

![制卡编辑与预览](https://jidecards.com/assets/jidecards-26.11.20.17-06-card-editing.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 检索与卡库管理

在浏览页按牌组、标签和关键词查找卡片，再逐张或批量整理。

![检索与卡库管理](https://jidecards.com/assets/jidecards-26.11.20.17-07-search-and-browse.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 学习统计与提醒

统计页查看复习记录和到期情况，提醒页设置每天的学习时间。

![学习统计与提醒](https://jidecards.com/assets/jidecards-26.11.20.17-08-stats-and-reminders.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 同步与独立备份

同步设置连接 AnkiWeb 或自定义服务器，备份列表保存可以恢复的卡库副本。

![同步与独立备份](https://jidecards.com/assets/jidecards-26.11.20.17-09-sync-and-backup.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

### 鸿蒙多端布局

同一个应用适配手机、阔直板和鸿蒙电脑，大屏使用分栏布局。

![鸿蒙多端布局](https://jidecards.com/assets/jidecards-26.11.20.17-10-multi-device.png)

截图版本：26.11.20.17。手机端宣传图，画面取自模拟器中的实际运行截图，2026-11-20 制作。

## 常见问题

### 支持哪些设备？

记得闪卡面向 HarmonyOS NEXT。能否安装可在华为应用市场详情页查看。

### 能继续使用已有的 Anki 牌组吗？

可以。拿到 .apkg 文件就用导入入口。如果还想接着原来的复习进度，用同一个 AnkiWeb 账号同步，迁移前先保留备份。

### 免费吗？源码在哪里？

应用免费下载，采用 AGPL-3.0-or-later 许可证。GitHub、Gitee 和 GitCode 都提供项目仓库。

[进阶功能与兼容性](https://jidecards.com/works/jidecards/technical/) · [26.11.15.15 更新说明](https://jidecards.com/releases/)
