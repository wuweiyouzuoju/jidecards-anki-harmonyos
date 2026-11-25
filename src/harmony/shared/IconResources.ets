// SPDX-License-Identifier: AGPL-3.0-or-later
/** 资源在公共 HAR 内解析；返回原生 Resource，明暗选择仍由产品资源模式决定。 */
export class SharedIconResources {
  static history(): Resource { return $r('app.media.jide_ic_common_history'); }
  static back(): Resource { return $r('app.media.jide_ic_common_arrow_left'); }
}
