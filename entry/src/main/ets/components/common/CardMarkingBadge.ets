// SPDX-License-Identifier: AGPL-3.0-or-later
import { CARD_FLAGS, FlagLabels, customFlagLabel } from '../../model/CardMarking';
import { localizedNamedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ActionIcon } from './ActionIcon';

/** 状态与菜单共用星/旗轮廓；状态保留实心颜色与独立读屏名称。 */
@Component
export struct CardMarkingBadge {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop flag: number = 0;
  @Prop marked: boolean = false;
  @Prop labels: FlagLabels = {};
  build() {
    Row({ space: 应用尺寸.间距_4 }) {
      if (this.marked) {
        Row() {
          ActionIcon({ source: $r('app.media.ic_study_mark'), glyphSize: 14,
            tint: '#D97A1C', strokeColor: '#D97A1C' })
        }.accessibilityText($r('app.string.card_mark_marked')).accessibilityLevel('yes')
      }
      if (this.flag > 0 && this.flag < CARD_FLAGS.length) {
        Row() {
          ActionIcon({ source: $r('app.media.ic_study_flag'), glyphSize: 14,
            tint: CARD_FLAGS[this.flag].color, strokeColor: CARD_FLAGS[this.flag].color })
        }.accessibilityText(customFlagLabel(this.labels, this.flag) ||
          localizedNamedResourceText(this.getUIContext(), this.uiLanguage, CARD_FLAGS[this.flag].labelKey))
          .accessibilityLevel('yes')
      }
    }
  }
}
