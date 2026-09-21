# Naming 规则

## 默认规则
- **标识符**：英文（变量 / 函数 / 类 / 接口 / 类型 / 文件名）
- **Docstring / 注释**：中文（与既有注释语言一致；新文件默认中文）
- **用户可见文案**：走 i18n（`$r('app.string.xxx')`），不内联硬编码

## 标识符命名风格

| 类别 | 风格 | 示例 |
|---|---|---|
| 类 / @Component struct / 接口 / 类型 | PascalCase | `CollectionService` / `DeckSummary` / `HomeSnapshot` |
| 函数 / 方法 / 变量 | camelCase | `loadHomeData` / `pendingCount` / `isRefreshing` |
| 常量（const / enum 成员） | UPPER_SNAKE_CASE | `UPDATE_DECK_CONFIGS_MODE_NORMAL` / `STATUS_NATIVE_FATAL` |
| 私有成员 | 前缀 `_` 不强制；推荐保持私有可见性 | `private collectionService` |
| 资源 key | snake_case | `app.string.color_theme` / `theme_color_aurora` |
| 文件名 | 与默认导出同名 | `CollectionService.ts` / `DeckListItem.ets` |

## 禁用
- 新模块使用无意义或不一致的命名；既有中文标识符按局部风格维护，不全量改名
- 缩写过度（`a` / `b` / `tmp` 除非循环计数）
- 在 enum / JSON 字段 / SQL 列名上用中文命名（踩语言边界）

## ArkTS 限制（来自 linter）
- 不支持解构声明（`arkts-no-destruct-decls`）
- 不支持 untyped object literals（`arkts-no-untyped-obj-literals`）
- 类型断言用 `as` 不用 `<>`

## 命名约定（项目特定）

- `Service` 后缀：业务服务类（`DeckService` / `StatsService` / `CollectionService`）
- `Panel` 后缀：全屏遮罩弹层（`SettingsPanel` / `SyncPanel` / `CreateDeckPanel`）
- `Group` 后缀：设置分组组件（`AppearanceGroup` / `SchedulerGroup`）
- `Helper` 后缀：纯函数工具集（`TtsVoiceHelper` / `FileImportHelper`）
- `Store` 后缀：preferences 持久化（`ThemeStore` / `ColorThemeStore` / `LanguageStore`）
- `Builder` 后缀：HTML/字符串构造（`StudyCardHtmlBuilder`）
- `Manager` 后缀：跨模块协调器（`ColorThemeManager` / `ThemeController`）
- `COLOR_KEYS` 常量：颜色主题 storage key 字典
