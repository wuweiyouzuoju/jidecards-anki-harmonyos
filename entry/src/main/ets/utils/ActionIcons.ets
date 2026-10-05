// SPDX-License-Identifier: AGPL-3.0-or-later

/** 同义卡片动作在学习、浏览多选和预览中共用图标；未知动作不伪装成指南。 */
export function actionIcon(id: string): Resource | undefined {
  switch (id) {
    case 'edit': return $r('app.media.ic_study_edit');
    case 'agent': return $r('app.media.ic_study_agent');
    case 'undo': return $r('app.media.ic_study_undo');
    case 'marking': return $r('app.media.ic_study_marking');
    case 'mark':
    case 'unmark': return $r('app.media.ic_study_mark');
    case 'flag': return $r('app.media.ic_study_flag');
    case 'flag_names': return $r('app.media.ic_study_flag_names');
    case 'audio': return $r('app.media.ic_study_audio');
    case 'card_actions': return $r('app.media.ic_study_card_actions');
    case 'bury': return $r('app.media.ic_study_bury');
    case 'suspend': return $r('app.media.ic_study_suspend');
    case 'delete': return $r('app.media.ic_study_delete');
    case 'handwrite': return $r('app.media.ic_study_handwrite');
    case 'auto_advance': return $r('app.media.ic_study_auto_advance');
    case 'guide':
    case 'help': return $r('app.media.ic_study_guide');
    case 'notetype': return $r('app.media.ic_settings_notetypes');
    case 'deck': return $r('app.media.ic_action_move_deck');
    case 'reset':
    case 'reposition': return $r('app.media.ic_action_reposition');
    case 'due': return $r('app.media.ic_action_due');
    case 'tags': return $r('app.media.ic_settings_tags');
    case 'exit': return $r('app.media.ic_common_close');
    default: return undefined;
  }
}
