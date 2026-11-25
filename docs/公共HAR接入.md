# 公共 HAR 接入

`jide_foundation` 是源码 HAR，入口为 [Index.ets](../Index.ets)。当前魔方、空间训练与闪卡已实际依赖它，不再各自维护同一份图标绘制、原生图标按钮、按压及箭头实现。它不拥有产品状态、偏好、导航或存储。

2026-10-23：记得记忆宫殿改用自身工程 `vendor/jide_foundation` 的专用版本，已退出本公共 HAR 的活跃消费者登记；其来源和许可由宫殿工程维护。本目录的公共源码、HAR 及 AGPL 许可保持不变，`sync:consumers` 只同步当前登记的魔方和空间训练。

## 新增视觉能力（0.2.1）

正式HAR新增背景 `SharedPageBackground`、表面修饰器 `SharedSurface`、学习动作 `SharedActionButton`、纯样式规则和 `VisualTokens`，详见[视觉接入](视觉基础接入.md)。独立样例已消费这些导出；魔方/空间训练同步新HAR，但既有适配入口不自动改成新视觉。不能把依赖同步等同于产品页面迁移。

## 已接入的职责

| 公共入口 | 公共责任 | 产品保留 |
| --- | --- | --- |
| `SharedActionIcon`、`iconStrokeMatrix/iconArgbMatrix` | 图标大小、填充和描边分离；颜色矩阵保持输入 alpha；不参与点击或读屏 | 资源来源、主题颜色读取及刷新 |
| `SharedIconButton` | 44vp 原生按钮、读屏名称、原生禁用与点击守卫、按压、图标插槽 | 名称、图标、表面/描边、图片角标形态、弱化但可点击语义和回调 |
| `SharedPressFeedback` | 正常/按下/禁用的透明度及缩放恢复 | 在动作时读取档位；魔方保持克制，空间训练保留当前偏好 |
| `SharedDisclosureChevron` | 24vp 槽位与既有 Polyline 几何 | 展开状态、旋转角度和动画 |
| `SharedIconResources.history()/back()` | 原始历史/返回 SVG，base/dark 成对供应 | 可见性、导航、朗读名称和实际动作 |

SVG 内容逐字节保留当前 JideCards 来源。公共包用 `jide_` 前缀资源名，通过资源工厂调用；不让消费者依赖资源数字 ID。两款产品原先的 8 份对应 SVG 已移除。其余图标及菜单、主确认、危险按钮、设置行、选择器、帮助、原生弹窗和展开显露仍归各产品，完整契约见[跨产品接入规范](跨产品接入规范.md)。不能把这批接入理解为 22 类能力全部已经公共化。

## 构建与同步

Node 24+、DevEco Studio。工作区保持基础库和产品为同级目录；全量接入登记见 [consumers.json](../consumers.json)。在本基础库根目录：

```powershell
npm test
npm run check
npm run build:harmony
npm run sync:consumers
npm run check:consumers
```

只同步一个已登记产品：`npm run sync:consumers -- jidecube` 或 `npm run sync:consumers -- jide-spatial`。脚本执行该产品根目录的 `ohpm install`，保留其余依赖。`.local` 不入版本控制；新工作区先构建 HAR，再安装产品依赖。构建产物记录包含导出源码的完整依赖闭包、资源、manifest 与包配置哈希；未导出的试验模块不进入正式包。

两款产品的 `entry/oh-package.json5` 均声明：

```json
"jide_foundation": "file:../../记得系列基础/.local/packages/jide_foundation.har"
```

魔方的 `npm run build:app` 与空间训练的 `npm run build` 会先运行 `tools/consumers.mjs`。公共源码变动未重建、HAR 内容损坏、消费者仍安装旧包或重新出现已迁走的 SVG，都会明确失败；按报错重建并同步，不能跳过检查继续用旧包。

## 使用方式

```typescript
import { SharedIconButton, SharedActionIcon, SharedIconResources } from 'jide_foundation';
```

保留产品组件作为稳定调用入口，在适配层传入资源色、读屏文案、真实可用性和回调。现有调用方无需重命名。图标按钮通过 `glyph` 插槽呈现产品图标，保持图标配色与按钮动作分开。`readPressScale` 是动作时的查询函数，不能将第一次创建时的偏好固化成另一个状态副本。

新增消费者时，在其 ohpm manifest 引入 HAR、替换实际调用入口，登记 `consumers.json` 中的适配文件及已迁移资源，并在现有构建入口执行依赖校验。图标按钮完整名称必须由产品提供；共享图标本身不参与读屏。系统返回、忙碌/草稿守卫、危险后果确认继续交给业务所有者。

## 验证入口与后续提炼

基础行为使用 `npm test`；夹具与 HAR 使用 `npm run build:harmony`；依赖交付使用 `npm run check:consumers`。魔方继续运行 `npm test -- ui` 和 `npm run build:app`；空间训练继续使用其训练会话/进度测试与 `npm run build`。实际结果集中维护于[验证记录](验证记录.md)，产品 UI 文档记录接入差异。

公共控件与两个实际应用的编译不等于设备验收。本次尚未安装新 HAP；读屏、图标明暗切换、角标圆形按钮、按压取消及手势分发需按产品现有设备入口复核。

后续抽取优先按真实调用链完成设置/表单、独立帮助、弹窗标题与外壳，再评估转场和展开显露。设置行的 Row/Button 语义、独立帮助点击、主题高亮、键盘/安全区、嵌套返回与用户滚动取消已有差异；应先保持完整行为，再收敛公共实现。对应来源和消费者已经列入[复用全景](复用全景.md)，无需重新从文件名猜测。

## 0.2.2：橄榄油

`OliveOilSurface`、`OliveOilSession`、平台适配与纯轮廓现已作为正式公共API导出。[橄榄油](橄榄油.md)是时序、几何、调用与验证的唯一当前入口。已有消费者同步新版HAR，但页面不会自动接入橄榄油。

0.2.3新增闪卡正式消费者登记，适配入口为SeriesVisual与开始学习按钮；闪卡取消橄榄油，仅采用视觉基础。
