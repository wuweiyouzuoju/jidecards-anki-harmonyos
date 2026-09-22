# ArkTS / HarmonyOS 适配规则

本文件定义 `entry/src/main/ets/` 内 ArkTS / HarmonyOS 平台代码的适配规则，不约束 Node 工具脚本。编译兼容性以仓库锁定 SDK 的实际 HAP 构建为准。

## ArkTS 语言限制（linter 强制）

- `arkts-no-destruct-decls`：不支持解构声明（`const {a, b} = obj` 禁用）
- `arkts-no-untyped-obj-literals`：不支持 untyped object literals（`{x: 1}` 必须有 interface）
- 类型断言用 `as` 不用 `<>`
- 不支持 `any` / `unknown` 在公共 API
- Map / Set 必须显式泛型（`new Map<string, number>()`）

## HarmonyOS Kit 引用路径

| Kit | 引用 | 用途 |
|---|---|---|
| AbilityKit | `@kit.AbilityKit` | common.UIAbilityContext / Want / startAbility |
| ArkUI | `@kit.ArkUI` | promptAction / window / display |
| BasicServicesKit | `@kit.BasicServicesKit` | BusinessError / pasteboard |
| PerformanceAnalysisKit | `@kit.PerformanceAnalysisKit` | hilog |
| AppGalleryKit | `@kit.AppGalleryKit` | commentManager |
| LocalizationKit | `@kit.LocalizationKit` | i18n.System.getAppPreferredLanguage |
| CoreSpeechKit | `@kit.CoreSpeechKit` | textToSpeech |
| CoreFileKit | `@kit.CoreFileKit` | fileIo / picker（PhotoViewPicker） |
| MediaLibraryKit | `@kit.MediaLibraryKit` | photoAccessHelper |
| MediaKit | `@kit.MediaKit` | media（音频播放） |
| AudioKit | `@kit.AudioKit` | audio（音频管理） |
| ArkTS | `@kit.ArkTS` | util |
| ArkData | `@kit.ArkData` | preferences（偏好存储，model 层高频） |
| ArkWeb | `@kit.ArkWeb` | webview（学习页卡片渲染） |
| InputKit | `@kit.InputKit` | KeyCode |
| ImageKit | `@kit.ImageKit` | image（PixelMap / ImageSource） |

新增 API 以目标 SDK 的声明和官方文档核对模块、权限与版本，不凭其他项目的 Kit 用法推断。

## @Component 结构约定

```typescript
@Component
export struct XxxComponent {
  // 1. @Prop / @State / @StorageLink / @Provide 声明
  // 2. 回调属性（onXxx: () => void = () => {}）
  // 3. private 只读字段
  // 4. 生命周期方法（aboutToAppear / aboutToDisappear）
  // 5. 私有方法
  // 6. @Builder 方法
  // 7. build() 方法
}
```

## 主题色板引用

- 颜色经 `@StorageLink(COLOR_KEYS.actionPrimary)` 跟随主题切换
- `resolvedPrimary()` 直接引用 `@StorageLink` 字段，让 @Builder 重执行
- 深浅色判断：`settingsPalette(this.isDark)` 取色板
- countNew / countLearning / countReview 是固定交通灯色，不跟随主题

## i18n 使用

```typescript
// 简单 i18n：直接 $r 引用
Text($r('app.string.xxx'))

// 带参数 i18n：通过 utils/UiFeedback 的真实资源错误边界，展开格式参数。
private localizedFmt(resource: Resource, args: Array<string | number>): string {
  return resourceText(this.getUIContext(), resource, ...args);
}
this.localizedFmt($r('app.string.xxx_lang'), [arg1, arg2]);
```

- 中英 i18n key 必须完全对齐（数量 + 名称）
- 英文 value 不能含中文字符
- `Text()` / `Button()` 内禁止硬编码字符串字面量（除纯符号 `›▼✓⌄⌃×⚠≡`）
- `this.xxxMessage = '...'` / `\`...\`` 禁止含中文字面量

## 语言切换机制

- `GeneralSettings.ets` 去重后调用 `setAppPreferredLanguage`，系统配置更新负责重渲染；当前实现不主动重启应用。
- 系统设置失败时显示失败提示；配置更新期间 Select 重建不得重复触发语言切换。
- 即时刷新与页面重建效果需做设备验证，编译和 Node 测试不能替代。
- [扩展入口](../../docs/development/extension-points.md) 列出新增语言的入口

## ArkUI 关键约束

- `@Builder` 按值参数会被快照，@State 变化不重跑 builder，三角形不转——传引用用 interface
- `LazyForEach` keyItem 必须含全部可变字段，否则数据变化不刷新
- `Select.value` 必须传 string 不能传 Resource（运行时实测按钮文本空白）
- `Select` 选中态用 `selected` + `value` 双绑
- `@StorageProp` 单向，`@StorageLink` 双向
- `@Provide` / `@Consume` 跨组件树共享

## Web 组件时序

- `aboutToAppear` 异步链调 `loadData` 时 Web 可能未 `onControllerAttached`，首张卡白屏
- 修复：未 attach 时缓存 HTML，`onControllerAttached` 回调消费
- 媒体经 `https://jidecards-media.local/` 自建域名，`onInterceptRequest` 映射到沙箱 `collection.media/`

## NAPI / FFI 边界

- panic 在 FFI 内 `catch_unwind`，绝不跨语言边界
- `nativeStatus=3` 是 BACKEND_ERROR（details 是 protobuf）
- `nativeStatus=4` 是 NATIVE_FATAL（panic / 锁中毒）
- SchedulingStates 必须 raw passthrough，禁止解码 / 重编码 oneof 结构

## 装机 / 签名

- 装机用 `hdc -t <connect-key> install -r <hap>`（不是 `-s`，与 adb 不同）
- 装后需 `hdc -t <connect-key> shell aa force-stop com.jide.kapian` 再启动当前包以加载新代码
- **绝不 uninstall 清数据**：collection.anki2 + collection.media 在 sandbox 目录，uninstall 即永久删除
- 命令行构建：`npm run build:app`，通过仓库入口检查工具链、本机签名与最终 signed HAP；完整验收用 `npm run verify`

## 测试限制

- SDK 的 `Function may throw exceptions` 警告不能批量忽略。底层确需上抛时用 `@throws` 声明失败语义，沿调用链核对最终 catch；UI 生命周期/点击入口要处理失败，不制造未处理拒绝。
- 显示资源与 Toast 可使用 `utils/UiFeedback.ets`，但不能用空值/成功状态吞掉数据读写错误。偏好、导入、备份和工作区读取失败必须保留可观察的失败状态。
- `npm run verify` 使用 clean HAP 构建并执行精确警告门禁；允许项和升级步骤见 [验证说明](../../docs/development/verification.md#hap-警告门禁)。

- `model/**/*.ts` 与 `proto/**/*.ts` 是可直接测试的模型/协议层，只依赖这两层的 `.ts`；禁止直接或间接依赖 Kit、`.ets`、UI 或原生库。控制器通过显式宿主接口接收平台效果。
- 既有 `model/*.ets` 包含 preferences 等平台适配器，不属于上述纯模型范围；新业务规则不要继续塞入平台存储适配器。hilog 等平台效果放适配层。
- `architecture-boundaries.test.mjs` 检查字面量导入依赖，Node 行为测试不能代替 ArkTS 编译或设备验收。
