// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 标签占剩余宽度，右侧控件按内容测量并限宽；行外边距由宿主拥有。 */
export class FormRowLayout {
  static readonly gap: number = 应用尺寸.间距_12;
  static readonly controlHeight: number = 40;
  static readonly trailingConstraint: ConstraintSizeOptions = { maxWidth: '56%' };
}
