import { EditNotePage } from '../EditNotePage';
import { NoteDraftPreviewPage } from '../NoteDraftPreviewPage';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { 学习页, 学习页参数 } from '../学习页';
import { 浏览页 } from '../浏览页';
import { 统计页, 统计页参数 } from '../统计页';
import { 添加笔记页, 添加笔记页参数 } from '../添加笔记页';
import { AI制卡页, AI制卡页参数 } from '../AI制卡页';
import { 学习提醒页 } from '../学习提醒页';
import { 设置页 } from '../设置页';
import { 设置页参数, 浏览页参数, EditNotePageParams, NoteDraftPreviewPageParams } from '../../model/navigation/PageParams';

export interface HomeDestinationContext {
  pathStack: NavPathStack;
  onManualSync: () => void;
}

/** 只映射参数并渲染目的地，导航时机及返回效果由首页宿主持有。 */
@Builder
export function HomeDestinations(name: string, param: ESObject, context: HomeDestinationContext) {
  if (name === 'StudyPage') {
    学习页({
      pageDeckId: (param as 学习页参数).deckId ?? '',
      pageDeckName: (param as 学习页参数).deckName ?? '',
      pathStack: context.pathStack
    })
  } else if (name === 'BrowserPage') {
    浏览页({
      pageDeckId: (param as 浏览页参数).deckId ?? '',
      pageInitialSearch: (param as 浏览页参数).initialSearch ?? '',
      pageInitialNotesMode: (param as 浏览页参数).initialNotesMode ?? false,
      pageSelectForAgentEdit: (param as 浏览页参数).selectForAgentEdit ?? false,
      pathStack: context.pathStack
    })
  } else if (name === 'EditNotePage') {
    EditNotePage({ targetId: (param as EditNotePageParams).targetId,
      isNote: (param as EditNotePageParams).isNote, pathStack: context.pathStack })
  } else if (name === 'NoteDraftPreviewPage') {
    NoteDraftPreviewPage({ input: (param as NoteDraftPreviewPageParams).input, pathStack: context.pathStack })
  } else if (name === 'StatsPage') {
    统计页({
      pathStack: context.pathStack,
      initialSnapshot: param as 统计页参数
    })
  } else if (name === 'AddNotePage') {
    添加笔记页({
      pageDeckId: (param as 添加笔记页参数).deckId ?? '',
      pageDeckName: (param as 添加笔记页参数).deckName ?? '',
      pageDeckOptions: (param as 添加笔记页参数).deckOptions ?? [],
      pathStack: context.pathStack
    })
  } else if (name === 'AiCardPage') {
    AI制卡页({
      pageMode: (param as AI制卡页参数).mode ?? 'create',
      pageDeckId: (param as AI制卡页参数).deckId ?? '',
      pageDeckName: (param as AI制卡页参数).deckName ?? '',
      pageDeckOptions: (param as AI制卡页参数).deckOptions ?? [],
      pageCardIds: (param as AI制卡页参数).cardIds ?? [],
      pageNoteIds: (param as AI制卡页参数).noteIds ?? [],
      pageTemplateIdx: (param as AI制卡页参数).templateIdx ?? -1,
      pathStack: context.pathStack
    })
  } else if (name === 'ReminderPage') {
    学习提醒页({
      pathStack: context.pathStack
    })
  } else if (name === 'SettingsPage') {
    设置页({
      openAiSettings: (param as 设置页参数).openAiSettings ?? false,
      onManualSync: (): void => { context.onManualSync(); },
      pathStack: context.pathStack
    })
  }
}
