# 记得闪卡鸿蒙版发布流水线

适用于正式工程 `~/Developer/harmony/projects/jidecards`，包名 `com.jide.kapian`。下列命令从项目根目录运行。签名材料使用本机已有的正式配置。

## 1. 核对版本和构建范围

- 阅读项目的 `AGENTS.md`、`PROJECT_CONTEXT.md`、`docs/development/mac-build.md` 和 `docs/development/signing.md`。用 `git status --short` 和 `git diff` 确认将打入包的工作树内容，保留其他任务的改动。
- 在已登录的华为开发者中心确认应用名和包名，记录已上架版本、已有草稿，以及「软件包管理」中的最新构建号。若草稿已绑定别的包或已填入不同版本的内容，先查明归属。
- 预览结果，确认日期、连续序号以及高于已使用构建号的 `versionCode` 后再写入。管理工具按北京时间的次日生成日期段，版本号唯一配置源为 `AppScope/app.json5`。

```sh
python3 ../../tools/version-manager/versions.py bump --project jidecards --dry-run
python3 ../../tools/version-manager/versions.py bump --project jidecards
```

## 2. 整理更新说明

以当前已上架版本为比较基准，核对本次构建包含的用户可见功能及入口。把文案写入 `docs/releases/<versionName>.md`，同步 README 的源码徽章与版本、`docs/DEVELOPMENT_PLAN.md` 的当前版本。维护 `hosting/data/works.json` 的 `sourceUpdate`，运行 `node tools/build-site.mjs` 刷新本地源码说明。历史发布文案与下载包有各自的版本记录。

华为表单对应「可本地化信息 → 新版本特性」，简体中文默认栏上限为 1000 字符。把占位模板全部替换为此次真实变动。若还有其他启用语言，逐栏填入本地化说明。在 Safari 可打开语言下拉，按方向键和回车切换，再从页面显示的语言确认当前位置。全部填写后保存，重新进入草稿抽查首尾语言及其他语言。

## 3. 构建和验签

```sh
source ~/.zprofile
node tools/check-signing.mjs
npm run verify -- repo
npm run build:app -- --release
devecocli build --product default --build-mode release
```

首个构建命令准备双架构 Release Core、沙箱并生成签名 HAP，第二个构建命令生成整应用的 APP。检查日志中的 `SignHap`、`SignApp` 和 `BUILD SUCCESSFUL`。若仓库验证或警告门禁失败，记录具体失败及影响，送审前处理实际回归并重跑相关验证。构建成功和门禁通过分别记录。

- 上传产物位于 `build/outputs/default/jidecards-default-signed.app`。从 `unzip -p "$package" pack.info` 读取 `summary.app`，确认包名、显示版本和构建号。另可读取包内 `entry-default.hap` 的 `module.json`，核对 `release` 和 `debug: false`。
- 用 DevEco SDK 的 `hap-sign-tool.jar verify-app -inForm zip` 分别检查外层正式 APP 与 `entry/build/default/outputs/default/entry-default-signed.hap`，确认日志明确显示 `verify-app success`。外层 APP 有自己的签名块，包内模块不一定具有独立签名块。
- 归档正式 APP，文件名带显示版本和构建号，并保存 `shasum -a 256` 的结果。验签导出的证书和 profile 留在任务工作目录，签名密码和 keystore 留在本机签名配置中。

```sh
# 以下 package、cert_out、profile_out 都使用绝对路径
sdk=/Applications/DevEco-Studio.app/Contents
"$sdk/jbr/Contents/Home/bin/java" \
  -jar "$sdk/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar" \
  verify-app -inForm zip -inFile "$package" \
  -outCertChain "$cert_out" -outProfile "$profile_out"
shasum -a 256 "$package"
```

## 4. 上传、绑定和保存

1. 复用浏览器内已登录的 HUAWEI Developer 标签页。若浏览器全量盘点超时，直接连接 Safari 应用，核对当前页左侧的应用名和包名。
2. 打开「分发 → 应用上架 → 软件包管理 → 上传」。先选「测试和正式上架」，再点「请从本地选取文件上传」。Safari 文件选择器可按 ⌘⇧G，输入归档目录并回车，再选中具体的 `.app`。等待上传和解析，可每 30–60 秒检查一次。看到「上传成功」后关闭结果框，等待列表刷新，再核对版本与构建号。重复操作前先查列表是否已经有同一包。
3. 打开「版本信息」里的升级草稿。没有草稿时从「版本/升级」进入。在「软件版本 → 发布版本 → 去选择」绑定刚上传的包。检查设备覆盖范围并填写「新版本特性」。
4. 点击「保存草稿」，检查成功回执。重新进入该版本，确认绑定版本、构建号、更新说明均已保存。记录上传时间、后台版本状态、包校验值和验证结果。
5. 用户要求送审时，核对审核信息、发布范围、发布方式及所有必填项，处理已发现的回归后再点「提交审核」。后台已有「审核通过立即上架」时，提交审核可能触发自动上架。后台显示的「准备提交」「审核中」「已上架」分别据实记录。


## 2026-11-14 修复与 GitHub 分发记录

- 3154 审核报告列出 `NoteFieldEditor.nativeRichRuns` 和首页预览加载标题两处崩溃。首页问题在 HarmonyOS 6.1 模拟器复现。3155 使用独立 `@Builder` 构建标题，富文本边界兼容不完整片段及样式。
- 版本 `26.11.15.15`，构建号 3155。正式 APP 和 HAP 验签通过，与 3154 的证书链一致。正式 APP SHA-256 为 `d966cee30def7d51cfa26a859615a62228b1b391aceac7b8622d9a3ed9df20b1`。
- 仓库检查 3800 项，其中 3798 通过、2 项因 Windows 环境跳过、0 失败。增量 Release 警告门禁 `accepted=268, unexpected=0`。设备覆盖手机添加卡片的中文/标点/emoji 输入、宽屏打开全部卡片预览。审核使用的两台 API24 真机尚未复测。
- 用户随后要求安装包上传 GitHub 并删除本地副本。正式包已分发至 [v26.11.15.15](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/releases/tag/v26.11.15.15)。GitHub 附件拒绝 `.app` 后缀，ZIP 内保留原始签名 APP。用户随后收窄留档范围为必需版本，保留 3155 的正式 APP 和独立签名 HAP。临时历史备份草稿按用户要求清除，本地旧版、测试版及重复包清理。
- 首轮执行停在包上传。随后用户要求继续送审，已绑定 `jidecards-26.11.15.15-3155-signed.app`（47.26 MB），12 种语言的新版本特性均保存并重新逐项回查通过。中文说明经 humanizer-zh 润色，包含横屏侧栏、华为云空间手动同步及使用条件、外观自动保存、白板、统计布局与两处崩溃修复。审核备注补充了根因和实际复测范围。
- 已点击“提交审核”和“确认提交”。后台显示 `26.11.15.15 新版本 - 预审中`、`正在预审`。发布配置为全网发布、审核通过立即上架。预审通过后由后台自动转正式审核，当前结果尚非已上架。
- GitHub Release 附件由本机集成工作树构建，自动生成的源码归档对应仓库标签。此次文案同步至 GitHub Release 和官网源码更新记录，17 项文档契约检查通过。
