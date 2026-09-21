# ArkTS / HarmonyOS 适配规则

本文件定义 ArkTS / HarmonyOS Next 平台特定的代码适配规则。所有 .ets / .ts 文件均适用。

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

不要用旧 HMS 路径（如 `@hms.ai.face.faceDetector`），会导致检测失败。

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

// 带参数 i18n：用 getStringSync(resource.id, args)
private localizedFmt(resource: Resource, args: Array<string | number>): string {
  return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id, args);
}
this.localizedFmt($r('app.string.xxx_lang'), [arg1, arg2]);
```

- 中英 i18n key 必须完全对齐（数量 + 名称）
- 英文 value 不能含中文字符
- `Text()` / `Button()` 内禁止硬编码字符串字面量（除纯符号 `›▼✓⌄⌃×⚠≡`）
- `this.xxxMessage = '...'` / `\`...\`` 禁止含中文字面量

## 语言切换机制

- 切语言需重启应用（`setAppPreferredLanguage` 全局重渲染卡 UI）
- 流程：弹窗确认 → `setAppPreferredLanguage` → `startAbility` + `terminateSelf`
- 切换瞬间 UI 文本不会自动刷新（必须重启）
- PROJECT_CONTEXT.md "扩展点" 列出新增语言的入口

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
- 装后需 `hdc shell aa force-stop com.jide.kapian` 才加载新代码
- **绝不 uninstall 清数据**：collection.anki2 + collection.media 在 sandbox 目录，uninstall 即永久删除
- 命令行构建：`$env:DEVECO_SDK_HOME="C:\Program Files\Huawei\DevEco Studio\sdk"; node "C:\Program Files\Huawei\DevEco Studio\tools\hvigor\bin\hvigorw.js" assembleHap --mode module -p product=default --no-daemon`

## 测试限制

- model 层不要 import HarmonyOS Kit（@kit.*）：node test runner 无法解析，导致整个 .test.mjs 文件加载失败（ERR_INVALID_MODULE_SPECIFIER），失败信息只显示 `not ok N - file.test.mjs` 不显示具体 assertion，排查极慢
- hilog 应放 utils 层，model 层保持纯函数无副作用
- 人脸检测必须真机测试，不支持模拟器
