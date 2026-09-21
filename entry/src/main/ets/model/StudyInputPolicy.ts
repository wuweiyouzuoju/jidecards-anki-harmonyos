// SPDX-License-Identifier: AGPL-3.0-or-later
export type StudyInputCommand = 'none' | 'consume' | 'undo' | 'back' | 'delete' | 'bury' | 'suspend' | 'replay' | 'flip' | 'again' | 'hard' | 'good' | 'easy';
export interface StudyKeyResult { control: boolean; command: StudyInputCommand; }
export function resolveStudyKey(key: string, down: boolean, control: boolean,
  phase: string, editing: boolean, guiding: boolean): StudyKeyResult {
  if (editing) return { control: false, command: 'none' };
  // 引导期间也要消费修饰键释放，防止引导结束后 Ctrl 粘住。
  if (!down) return { control: key === 'control' ? false : control, command: 'none' };
  if (guiding) return { control: control, command: 'none' };
  if (key === 'control') return { control: true, command: 'consume' };
  let command: StudyInputCommand = 'none';
  if (control && key === 'z') command = 'undo';
  else if (key === 'escape') command = 'back';
  else if (phase === 'question' || phase === 'answer') {
    switch (key) {
      case 'delete': command = 'delete'; break;
      case 'star': case 'b': command = 'bury'; break;
      case 'at': case 's': command = 'suspend'; break;
      case 'r': command = 'replay'; break;
      case 'space': case 'enter': command = phase === 'question' ? 'flip' : 'good'; break;
      case '1': if (phase === 'answer') command = 'again'; break;
      case '2': if (phase === 'answer') command = 'hard'; break;
      case '3': if (phase === 'answer') command = 'good'; break;
      case '4': if (phase === 'answer') command = 'easy'; break;
    }
  }
  return { control: control, command: command };
}
