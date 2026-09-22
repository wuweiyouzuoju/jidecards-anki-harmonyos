// SPDX-License-Identifier: AGPL-3.0-or-later
// Node/Hvigor 构建模块，不进入 ArkTS 应用包。错误只报告字段名，绝不输出签名材料。
export interface SigningMaterial {
  certpath: string;
  profile: string;
  storeFile: string;
  storePassword: string;
  keyAlias: string;
  keyPassword: string;
  signAlg: string;
}
export interface SigningConfig { name: string; type?: string; material: SigningMaterial; }
export interface SigningProduct { name: string; signingConfig: string; }
export interface LocalSigning { signingConfigs: SigningConfig[]; products: SigningProduct[]; }

export function parseLocalSigning(text: string): LocalSigning {
  let parsed: LocalSigning;
  try { parsed = JSON.parse(text) as LocalSigning; }
  catch { throw new Error('Invalid local signing JSON'); }
  if (!parsed || !Array.isArray(parsed.signingConfigs) || !Array.isArray(parsed.products)) {
    throw new Error('Local signing requires signingConfigs and products arrays');
  }
  const materialFields: (keyof SigningMaterial)[] = [
    'certpath', 'profile', 'storeFile', 'storePassword', 'keyAlias', 'keyPassword', 'signAlg'
  ];
  const names = new Set<string>();
  for (const config of parsed.signingConfigs) {
    if (!config || typeof config.name !== 'string' || !config.name || names.has(config.name)) {
      throw new Error('Invalid or duplicate signing config name');
    }
    names.add(config.name);
    for (const key of materialFields) {
      if (!config.material || typeof config.material[key] !== 'string' || !config.material[key]) {
        throw new Error(`Missing signing material field: ${key}`);
      }
    }
  }
  const products = new Set<string>();
  for (const product of parsed.products) {
    if (!product || typeof product.name !== 'string' || !product.name || products.has(product.name) || !names.has(product.signingConfig)) {
      throw new Error('Invalid, duplicate or unresolved signing product');
    }
    products.add(product.name);
  }
  if (products.size === 0) throw new Error('Local signing requires a product');
  return parsed;
}

export function applyLocalSigning<T extends { app: { signingConfigs?: SigningConfig[]; products?: { name: string; signingConfig?: string }[] } }>(
  profile: T, local: LocalSigning): T {
  // 拷贝后合并；不得意外修改公共构建配置或 SDK/产品其他字段。
  const result: T = JSON.parse(JSON.stringify(profile)) as T;
  result.app.signingConfigs = local.signingConfigs;
  for (const selected of local.products) {
    const product = result.app.products?.find(value => value.name === selected.name);
    if (!product) throw new Error('Signing refers to a product absent from build-profile.json5');
    product.signingConfig = selected.signingConfig;
  }
  return result;
}
