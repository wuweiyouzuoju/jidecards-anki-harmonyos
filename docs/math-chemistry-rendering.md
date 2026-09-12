# 数学与化学导入兼容

## 目标与范围

导入现有 Anki 牌组后即可学习。常见数学、物理公式与 mhchem 化学式完全离线排版；旧式 `[latex]`、`[$]`、`[$$]` 内容使用 Anki Core 计算的媒体引用显示已有图片。学习与浏览预览一致。

保留现有编辑器，不新增公式输入工具栏。复杂结构图优先显示牌组附带的 SVG/图片，不在手机内引入完整 TeX 编译器。缺少预生成 LaTeX 图片时不能声称已支持编译，应显示可识别的缺失状态与原始公式。

## 实施计划

1. 固化产品方向，核对 MathJax、Anki `latex_svg` 语义和 ArkWeb 本地资源加载。
2. 固定 MathJax 3.2.2，将 SVG 排版组件、mhchem 与 MathML 输入随 HAP 打包，保留许可证和资源校验信息；不依赖 CDN 或远程字体。
3. 通过两个页面共享的资源响应函数提供内置文件；保留原来的 collection.media 加载路径。
4. 修正 `latexSvg` 导致跳过 MathJax 的判断，统一分隔符、加载顺序、公式挖空和长公式显示。
5. 封装上游 ExtractLatex RPC，将旧式 LaTeX 转为标准媒体引用，不在前端复刻文件哈希规则。
6. 加入协议、渲染与离线资源测试；运行完整 Node 测试和 Rust 双架构 + ArkTS/HAP 构建；在可用设备上验证导入、正反面和预览。

## 验收要点

- 无网络时分数、根号、积分、矩阵、多行公式、化学式、电荷、同位素和反应箭头可见。
- `latexSvg` 为 true/false 均允许 MathJax；MathJax 与传统 LaTeX 图片可混用。
- 标准 `\(...\)` / `\[...\]` 和已有 `$...$` / `$$...$$` 写法保留；代码块不被误处理。
- 正面、答案、反复切卡与浏览预览一致；长公式可横向滚动；SVG 使用正文颜色。
- 公式挖空保持后端生成的隐藏/揭示语义；模板自定义 MathJax 宏可以工作。
- 旧式 LaTeX 的 SVG/PNG 媒体引用与上游一致，普通图片、音频、拼写和图片遮罩不回退。

## 验证记录

2026-09-12：步骤 1～5 和步骤 6 的自动化、构建部分已实现。

- 完整 `npm test`：804/804 通过，包括新增的资源字节校验、协议编码、旧式 LaTeX 节点处理、两页资源入口和主题契约。
- 真实浏览器离线测试：3/3 通过（正面、深色答案、再次切回正面；覆盖 `latexSvg` 两种值）。阻断所有非测试资源请求，公式排版无脚本错误、无额外网络请求；MathML、mhchem、模板宏、长公式局部滚动、代码块排除、已有 SVG 和缺图提示均通过。
- Rust 双架构、ArkTS 类型检查、签名 HAP 完整构建通过。构建有既有 ArkTS/资源警告，无编译错误。
- 首轮构建包已在模拟器 `127.0.0.1:5555` 覆盖安装并启动。模拟器只有默认空牌组，未添加测试卡；用户指出后停止设备操作。**没有完成模拟器内实际导入和公式显示验收，也没有实体手机验收。**
- `.apkg` 测试文件已生成在 `tmp/math-rendering/math-chemistry-qa.apkg`，但未导入；不可将生成文件、安装成功或浏览器测试解释为设备导入成功。

本机日志：`tmp/math-test-final.log`、`tmp/math-build-final.log`；浏览器结果与截图：`tmp/math-rendering/`。后续设备验收应直接使用含数学、化学、传统 LaTeX 媒体与挖空的测试牌组。

## 复现

```powershell
npm test
node tools/vendor-mathjax.mjs
# PLAYWRIGHT_MODULE 可指向已有 playwright/index.mjs；默认从本机 Node 包查找。
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-math-rendering-browser.mjs
npm run build:app
```

浏览器测试使用本机 Edge，无需访问公网；资源重建脚本仅在无校验通过的本地缓存时下载固定版本归档。
