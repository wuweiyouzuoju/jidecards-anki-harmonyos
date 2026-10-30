// SPDX-License-Identifier: AGPL-3.0-or-later

// Node 模块解析钩子：让单元测试能 import 不带扩展名的 .ts/.ets 模块。
// HarmonyOS 源码惯例是无扩展名 import（hvigor 解析），Node ESM 默认要求扩展名，
// 该钩子在测试运行时把 './x' 解析到 './x.ts' 或 './x.ets'（仅当文件存在）。
// .ets 文件经 load 钩子以 module-typescript 格式交给 Node 类型剥离/转换；
// 配合 --experimental-transform-types 支持 enum 等需转换的语法。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HAS_EXTENSION = /\.[cm]?[jt]s$/;
const RESOLVABLE_EXTENSIONS = ['.ts', '.ets'];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (isRelative && !HAS_EXTENSION.test(specifier) && context.parentURL) {
    const candidate = new URL(specifier, context.parentURL);
    if (candidate.protocol === 'file:') {
      const basePath = fileURLToPath(candidate);
      for (const ext of RESOLVABLE_EXTENSIONS) {
        const file = `${basePath}${ext}`;
        if (existsSync(file)) {
          return nextResolve(pathToFileURL(file).href, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ets')) {
    // ArkUI 观察类装饰器只是 hvigor 编译期标记，运行时无语义；
    // Node 类型剥离不支持装饰器语法（V8 报 Invalid or unexpected token），
    // 测试加载前剔除行首装饰器，保持 model 层可在 node 下解析。
    const source = readFileSync(fileURLToPath(url), 'utf8')
      .replace(/^[ \t]*@(Observed|ObservedV2|Track|Trace)[ \t]*\r?$/gm, '')
      .replace(/^([ \t]*)@(Observed|ObservedV2|Track|Trace)[ \t]+/gm, '$1');
    return {
      format: 'module-typescript',
      source,
      shortCircuit: true
    };
  }
  return nextLoad(url, context);
}
