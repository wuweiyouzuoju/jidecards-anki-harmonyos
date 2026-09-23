// SPDX-License-Identifier: AGPL-3.0-or-later
import { DataTransferSession, DataTransferState, initialTransferState } from '../../model/home/DataTransferSession';
import { 导出牌组选项, 数据迁移意图 } from '../../model/DataTransferIntent';
import { 数据迁移面板 } from '../数据迁移面板';

@Component
export struct DataTransferFeature {
  @Prop state: DataTransferState = initialTransferState();
  @Prop deckOptions: 导出牌组选项[] = [];
  @Prop isDark: boolean = false;
  session: DataTransferSession | null = null;
  build() {
    if (this.state.visible) {
      数据迁移面板({ deckId: this.state.deckId, initialMode: this.state.mode,
        deckOptions: this.deckOptions, allowDeckSelection: this.state.allowDeckSelection,
        busy: this.state.phase !== 'idle', errorMessage: this.state.error,
        personalReplacementStep: this.state.replacementStep, stage: this.state.stage, isDark: this.isDark,
        onIntent: (intent: 数据迁移意图): void => { this.session?.execute(intent); },
        onClose: (): void => { this.session?.close(); } })
    }
  }
}
