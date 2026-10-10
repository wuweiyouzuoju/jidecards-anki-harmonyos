// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 标签占剩余宽度，右侧控件按内容测量并限宽；行外边距由宿主拥有。 */
export class FormRowLayout {
  static readonly rowGap: number = 应用尺寸.间距_8;
  static readonly hintGap: number = 应用尺寸.间距_4;
  static readonly gap: number = 应用尺寸.间距_12;
  static readonly controlHeight: number = 40;
  static readonly trailingConstraint: ConstraintSizeOptions = { maxWidth: '56%' };
  // 目录值常包含完整路径；放宽右侧占比，字段标签仍使用剩余空间并可换行。
  static readonly directoryConstraint: ConstraintSizeOptions = { maxWidth: '70%' };
}
