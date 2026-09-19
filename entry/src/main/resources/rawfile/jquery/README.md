# jQuery 3.7.1

与 `third_party/anki/yarn.lock` 的 reviewer 依赖版本一致，提供模板使用的 `$` / `jQuery`。
使用完整发行版（包括 Ajax），经 `CardAssetResponse` 从 HAP 同步加载，无 CDN 依赖。

- 来源：https://code.jquery.com/jquery-3.7.1.min.js
- 许可：MIT，见 `LICENSE.txt`；保留发行文件头部版权声明。
- SHA-256：`fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a`

模板 CSS 必须单独包在 `<style>` 中；部分 Anki 牌组在样式字段里嵌入脚本，
不能与应用兜底 CSS 共用标签。jQuery 必须在模板样式和正文脚本之前加载。
