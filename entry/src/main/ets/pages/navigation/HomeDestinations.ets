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
import { appPageName, AppNavigationRequest } from '../../model/navigation/AppNavigation';

export interface HomeDestinationContext {
  pathStack: NavPathStack;
  onManualSync: () => void;
  onNavigateApp?: (request: AppNavigationRequest) => void;
}

/** 只映射参数并渲染目的地，导航时机及返回效果由首页宿主持有。 */
@Builder
export function HomeDestinations(name: string, param: ESObject, context: HomeDestinationContext) {
  if (name === appPageName('study')) {
    学习页({
      pageDeckId: (param as 学习页参数).deckId ?? '',
      pageDeckName: (param as 学习页参数).deckName ?? '',
      pathStack: context.pathStack
    })
  } else if (name === appPageName('browser')) {
    浏览页({
      pageDeckId: (param as 浏览页参数).deckId ?? '',
      pageInitialSearch: (param as 浏览页参数).initialSearch ?? '',
      pageInitialNotesMode: (param as 浏览页参数).initialNotesMode ?? false,
      pageInitialPreviewCardId: (param as 浏览页参数).initialPreviewCardId ?? 0,
      pageSelectForAgentEdit: (param as 浏览页参数).selectForAgentEdit ?? false,
      pathStack: context.pathStack
    })
  } else if (name === appPageName('edit_note')) {
    EditNotePage({ targetId: (param as EditNotePageParams).targetId,
      isNote: (param as EditNotePageParams).isNote, pathStack: context.pathStack })
  } else if (name === appPageName('note_draft_preview')) {
    NoteDraftPreviewPage({ input: (param as NoteDraftPreviewPageParams).input, pathStack: context.pathStack })
  } else if (name === appPageName('stats')) {
    统计页({
      pathStack: context.pathStack,
      initialSnapshot: param as 统计页参数
    })
  } else if (name === appPageName('add_note')) {
    添加笔记页({
      pageDeckId: (param as 添加笔记页参数).deckId ?? '',
      pageDeckName: (param as 添加笔记页参数).deckName ?? '',
      pageDeckOptions: (param as 添加笔记页参数).deckOptions ?? [],
      pathStack: context.pathStack
    })
  } else if (name === appPageName('agent')) {
    AI制卡页({
      pageMode: (param as AI制卡页参数).mode ?? 'create',
      pageDeckId: (param as AI制卡页参数).deckId ?? '',
      pageDeckName: (param as AI制卡页参数).deckName ?? '',
      pageDeckOptions: (param as AI制卡页参数).deckOptions ?? [],
      pageCardIds: (param as AI制卡页参数).cardIds ?? [],
      pageNoteIds: (param as AI制卡页参数).noteIds ?? [],
      pageTemplateIdx: (param as AI制卡页参数).templateIdx ?? -1,
      onNavigateApp: context.onNavigateApp,
      pathStack: context.pathStack
    })
  } else if (name === appPageName('reminders')) {
    学习提醒页({
      pathStack: context.pathStack
    })
  } else if (name === appPageName('settings')) {
    设置页({
      openAiSettings: (param as 设置页参数).openAiSettings ?? false,
      initialSectionId: (param as 设置页参数).sectionId ?? '',
      onManualSync: (): void => { context.onManualSync(); },
      pathStack: context.pathStack
    })
  }
}
