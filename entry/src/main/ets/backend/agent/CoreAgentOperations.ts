// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentOperationBackend, OperationArguments, OperationSnapshot } from '../../model/agent/AgentOperations';
import { operationDefinition } from '../../model/agent/AgentOperations';
import { 卡片服务 } from '../卡片服务';
import { 笔记服务 } from '../笔记服务';
import { 调度器服务 } from '../调度器服务';
import { 集合服务 } from '../集合服务';
import { 搜索服务 } from '../搜索服务';
import { 标签服务 } from '../标签服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { 牌组服务 } from '../牌组服务';
import { 牌组配置服务 } from '../牌组配置服务';
import { 卡片渲染服务 } from '../卡片渲染服务';
import { AnkiBrowserSidebar } from '../AnkiBrowserSidebar';
import { AnkiCardMarking } from '../AnkiCardMarking';
import { AnkiNoteDuplicates } from '../AnkiNoteDuplicates';
import { FsrsService } from '../FsrsService';
import { NoteDuplicateSession, initialDuplicateScanState } from '../../model/NoteDuplicateSession';
import type { DuplicateScanState } from '../../model/NoteDuplicateSession';
import { parseBrowserSavedSearches, serializeBrowserSavedSearches, upsertBrowserSavedSearch, removeBrowserSavedSearch } from '../../model/BrowserSidebar';
import { renameCardFlag, parseFlagLabels, setCardFlags } from '../../model/CardMarking';
import { cloneNotetypeJson } from '../../model/NotetypeManagement';
import { serializeNotetypeFields } from '../../model/NotetypeFieldDraft';
import type { NotetypeFieldDraft } from '../../model/NotetypeFieldDraft';
import { filteredDeckPatch } from '../../model/FilteredDeckCommands';
import { customStudyValueValid } from '../../model/CustomStudyOptions';
import { DeckOptionsPresets } from '../../model/DeckOptionsPresets';
import { buildDeckConfigRequest, copyDeckConfig } from '../../model/DeckConfigSave';
import { fsrsOptimizeInput } from '../../model/FsrsOptions';
import { validateSchedulingScript } from '../../model/CustomScheduling';
import type { Card } from '../../proto/messages/CardsMessages';
import type { EditableNote } from '../../proto/messages/NoteMessages';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { DeckConfigsForUpdateView, DeckConfig } from '../../proto/messages/DeckConfigMessages';
import type { CustomStudyCram } from '../../proto/messages/SchedulerMessages';
import { 自定义学习预设, BURY_SUSPEND_MODE_SUSPEND, BURY_SUSPEND_MODE_BURY_USER } from '../../proto/messages/SchedulerMessages';

export function operationSnapshot(name: string, args: OperationArguments, baseline: Object,
  cards: number[] = [], notes: number[] = [], decks: number[] = [], types: number[] = []): OperationSnapshot {
  return { baseline: JSON.stringify(baseline), preview: [{ title: operationDefinition(name)!.titleKey,
    before: '', after: JSON.stringify(args, null, 2) }], cardIds: cards.slice().sort((a,b): number => a-b),
    noteIds: notes.slice().sort((a,b): number => a-b), deckIds: decks.slice().sort((a,b): number => a-b),
    notetypeIds: types.slice().sort((a,b): number => a-b) };
}
function unique(ids: number[]): number[] { return Array.from(new Set<number>(ids)).sort((a,b): number => a-b); }
function deckIds(node: DeckTreeNode): number[] { return (node.deckId > 0 ? [node.deckId] : []).concat(...node.children.map(deckIds)); }
function studyPreset(operation: string): number {
  switch (operation) {
    case 'extend_new': return 自定义学习预设.新卡上限增量;
    case 'extend_review': return 自定义学习预设.复习上限增量;
    case 'forgotten_days': return 自定义学习预设.复习遗忘天数;
    case 'review_ahead': return 自定义学习预设.提前复习天数;
    case 'preview_new': return 自定义学习预设.预览新卡天数;
    default: throw new Error('invalid_custom_study_preset');
  }
}
function cram(json: string): CustomStudyCram {
  const value: CustomStudyCram = JSON.parse(json) as CustomStudyCram;
  if (value === null || Array.isArray(value) || typeof value !== 'object' ||
    Object.keys(value).some((key): boolean => !['kind','cardLimit','tagsToInclude','tagsToExclude'].includes(key)) ||
    !Number.isInteger(value.kind) || value.kind < 0 || value.kind > 3 ||
    !Number.isInteger(value.cardLimit) || value.cardLimit < 1 || value.cardLimit > 100000 ||
    !Array.isArray(value.tagsToInclude) || !Array.isArray(value.tagsToExclude) ||
    value.tagsToInclude.concat(value.tagsToExclude).some((tag): boolean => typeof tag !== 'string' || tag.trim() === '' || /\s/.test(tag))) {
    throw new Error('invalid_custom_study_cram');
  }
  return value;
}
function notetypeDraft(json: string, args: OperationArguments): string {
  if (args.name !== undefined) {
    if (args.name.trim() === '') throw new Error('notetype_name_required');
    const named: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
    named['name'] = args.name.trim(); return JSON.stringify(named);
  }
  const fields: NotetypeFieldDraft[] = JSON.parse(args.changesJson!) as NotetypeFieldDraft[];
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 999 || fields.some((field): boolean =>
    field === null || typeof field !== 'object' || Array.isArray(field) || Object.keys(field).some((key): boolean => !['ord','name'].includes(key)) ||
    (field.ord !== null && (!Number.isInteger(field.ord) || field.ord < 0)) || typeof field.name !== 'string' || field.name.trim() === '')) throw new Error('invalid_notetype_fields');
  if (new Set<string>(fields.map((field): string => field.name.trim().toLowerCase())).size !== fields.length) throw new Error('duplicate_notetype_field');
  const out: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
  out['flds'] = serializeNotetypeFields(out['flds'] as Object[], fields);
  return JSON.stringify(out);
}

/** 领域命令适配：调度、撤销、类型和预设均交给已有 Core 服务，不计算调度算法。 */
export class CoreAgentOperations implements AgentOperationBackend {
  private cards: 卡片服务 = new 卡片服务();
  private notes: 笔记服务 = new 笔记服务();
  private scheduler: 调度器服务 = new 调度器服务();
  private collection: 集合服务 = new 集合服务();
  private search: 搜索服务 = new 搜索服务();
  private tags: 标签服务 = new 标签服务();
  private types: 笔记类型服务 = new 笔记类型服务();
  private decks: 牌组服务 = new 牌组服务();
  private configs: 牌组配置服务 = new 牌组配置服务();
  private sidebar: AnkiBrowserSidebar = new AnkiBrowserSidebar();
  private marking: AnkiCardMarking = new AnkiCardMarking();
  private fsrs: FsrsService = new FsrsService();
  private async cardList(ids: number[]): Promise<Card[]> {
    const cards: Card[] = []; for (const id of ids) cards.push(await this.cards.获取卡片(id)); return cards;
  }
  private async noteList(ids: number[]): Promise<EditableNote[]> {
    const notes: EditableNote[] = []; for (const id of ids) notes.push(await this.notes.获取笔记(id)); return notes;
  }
  private async noteCards(ids: number[]): Promise<number[]> {
    let cards: number[] = []; for (const id of ids) cards = cards.concat(await this.notes.获取笔记的卡片(id)); return unique(cards);
  }
  private async presetView(args: OperationArguments): Promise<DeckConfigsForUpdateView> { return this.configs.获取牌组配置编辑视图(args.deckId!); }
  async read(name: string, args: OperationArguments): Promise<string> {
    switch (name) {
      case 'get_card_states': return JSON.stringify({ cards: await this.cardList(args.cardIds!), resetDefaults: await this.scheduler.scheduleCardsAsNewDefaults() });
      case 'get_saved_searches': return JSON.stringify({ saved: parseBrowserSavedSearches(await this.sidebar.savedSearches()) });
      case 'get_collection_history': return JSON.stringify(await this.collection.获取撤销状态());
      case 'get_flag_names': return JSON.stringify(parseFlagLabels(await this.marking.labels()));
      case 'get_deck_presets': {
        const view = await this.presetView(args); return JSON.stringify({ current: view.currentDeck?.configId,
          presets: view.allConfigs.map((entry): Object => ({ id: entry.config.id, name: entry.config.name, useCount: entry.useCount })) });
      }
      case 'get_custom_scheduling': return JSON.stringify({ script: (await this.presetView(args)).cardStateCustomizer });
      case 'get_custom_study_defaults': return JSON.stringify(await this.scheduler.获取自定义学习默认值(args.deckId!));
      case 'get_empty_cards': {
        const report = await new 卡片渲染服务().获取空卡报告();
        const rows = report.笔记列表; const offset = args.offset ?? 0; const limit = args.limit ?? 100;
        return JSON.stringify({ total: rows.length, offset: offset, nextOffset: offset + limit < rows.length ? offset + limit : null, rows: rows.slice(offset, offset + limit) });
      }
      case 'get_duplicate_notes': {
        const view = await this.types.获取编辑笔记类型(args.notetypeId!);
        const fieldOrd = view.fieldNames.indexOf(args.field!); if (fieldOrd < 0) throw new Error('notetype_field_missing');
        let state: DuplicateScanState = initialDuplicateScanState();
        const session = new NoteDuplicateSession(new AnkiNoteDuplicates(), (next): void => { state = next; });
        try { await session.scan({ notetypeId: args.notetypeId!, fieldOrd: fieldOrd, search: args.query! });
          if (!state.complete) throw new Error(state.error || 'duplicate_scan_incomplete'); return JSON.stringify(state);
        } finally { session.dispose(); }
      }
      default: throw new Error('operation_unavailable');
    }
  }
  async snapshot(name: string, args: OperationArguments): Promise<OperationSnapshot> {
    const history = await this.collection.获取撤销状态();
    let cards = args.cardIds?.slice() ?? []; let notes = args.noteIds?.slice() ?? [];
    let decks = args.deckId === undefined ? [] : [args.deckId]; const types = args.notetypeId === undefined ? [] : [args.notetypeId];
    let details: Object = history;
    if (args.cardIds !== undefined) {
      if (name === 'propose_reposition_cards' && args.shift) {
        // Core shifts every type=new card at/above start, including suspended/buried cards.
        const all = await this.search.搜索卡片({ search: '', order: { kind: 'none' } });
        const shifted = (await this.cardList(all)).filter((card): boolean => card.ctype === 0 && card.due >= args.start!);
        cards = unique(cards.concat(shifted.map((card): number => card.id)));
      }
      const states = await this.cardList(cards); notes = unique(states.map((card): number => card.noteId)); details = states;
      if (name === 'propose_reposition_cards' && (await this.cardList(args.cardIds)).some((card): boolean => card.ctype !== 0)) throw new Error('reposition_requires_new_cards');
      if (name === 'propose_reposition_cards' && args.start! + args.step! * cards.length > 2147483647) throw new Error('reposition_overflow');
    } else if (args.noteIds !== undefined) {
      details = await this.noteList(notes); cards = await this.noteCards(notes);
    } else if (name === 'propose_rename_tag' || name === 'propose_delete_tag' || name === 'propose_clear_unused_tags') {
      details = await this.tags.标签树();
      if (name !== 'propose_clear_unused_tags') {
        const query = await this.search.构建搜索串({ kind: 'tag', tag: args.name! });
        notes = await this.search.搜索笔记({ search: query, order: { kind: 'none' } });
        cards = await this.noteCards(notes); details = [details, await this.noteList(notes)];
      }
    } else if (name === 'propose_saved_search') {
      details = await this.sidebar.savedSearches(); this.savedSearch(details as string, args);
    } else if (name === 'propose_flag_name') details = await this.marking.labels();
    else if (types.length > 0) {
      const json = await this.types.获取笔记类型旧版(args.notetypeId!);
      if (name === 'propose_clone_notetype') details = [json, await this.types.获取笔记类型名列表()];
      else {
        const draft = notetypeDraft(json, args); const impact = await this.types.impact(args.notetypeId!, json, draft);
        notes = impact.noteIds; cards = impact.cardIds; details = [json, draft, impact];
      }
    } else if (['propose_manage_deck_preset','propose_custom_scheduling','propose_optimize_fsrs'].includes(name)) {
      if (name === 'propose_custom_scheduling' && !validateSchedulingScript(args.value!)) throw new Error('custom_scheduling_too_large');
      const view = await this.presetView(args);
      details = [view, await this.decks.获取牌组树()];
      if (name === 'propose_manage_deck_preset') {
        this.presetRequest(view, args);
        const search = await this.fsrs.presetSearch(args.presetId!);
        const match = /^did:([0-9,]+) /.exec(search); if (match === null) throw new Error('preset_scope_unavailable');
        decks = unique(decks.concat(match[1].split(',').map(Number).filter((id): boolean => id > 0)));
      }
      if (name === 'propose_custom_scheduling') decks = deckIds(await this.decks.获取牌组树());
    } else if (name === 'propose_create_filtered_deck') {
      const tree = await this.decks.获取牌组树(); const template = await this.decks.获取或创建过滤牌组(0);
      // Core 的未保存模板名称含当前时间；确认冻结的是用户明确给出的名称。
      template.name = args.name!;
      const draft = filteredDeckPatch(template, args.changesJson!);
      for (const term of draft.config.searchTerms) cards = cards.concat(await this.search.搜索卡片({ search: (term.search.trim() === '' ? '' : '(' + term.search + ') ') + '-is:suspended -is:buried', order: { kind: 'none' } }));
      cards = unique(cards); const states = await this.cardList(cards);
      notes = unique(states.map((card): number => card.noteId)); decks = unique(states.map((card): number => card.deckId));
      details = [tree,template,draft,states];
    } else if (name === 'propose_maintain_filtered_deck') {
      const deck = await this.decks.获取或创建过滤牌组(args.deckId!); details = deck;
      cards = await this.search.搜索卡片({ search: 'did:' + args.deckId, order: { kind: 'none' } });
      if (args.operation === 'rebuild_filtered') for (const term of deck.config.searchTerms) cards = cards.concat(await this.search.搜索卡片({ search: (term.search.trim() === '' ? '' : '(' + term.search + ') ') + '-is:suspended -is:buried', order: { kind: 'none' } }));
      cards = unique(cards); details = [deck,await this.cardList(cards)];
      notes = unique((await this.cardList(cards)).map((card): number => card.noteId));
    } else if (name === 'propose_custom_study') {
      if (args.operation === 'state_or_tags') cram(args.value!);
      else if (!customStudyValueValid(studyPreset(args.operation!), args.value!)) throw new Error('invalid_custom_study_value');
      details = [await this.scheduler.获取自定义学习默认值(args.deckId!), await this.decks.获取牌组树()];
      cards = await this.search.搜索卡片({search:'did:' + args.deckId,order:{kind:'none'}});
      const states = await this.cardList(cards); notes = unique(states.map((card): number => card.noteId)); details = [details,states];
    }
    const snapshot = operationSnapshot(name, args, [history, details], cards, notes, decks, types);
    if (name === 'propose_create_filtered_deck' || name === 'propose_custom_study' || args.operation === 'rebuild_filtered') {
      snapshot.preview.push({title:'agent_operation_candidate_scope',before:JSON.stringify({candidateCardIds:cards,deckIds:decks}),after:''});
    }
    if (name === 'propose_edit_notetype_structure') {
      const before = await this.types.获取笔记类型旧版(args.notetypeId!);
      snapshot.preview[0].before = JSON.stringify((JSON.parse(before) as Record<string,Object>)['flds'], null, 2);
      snapshot.preview[0].after = args.changesJson!;
    }
    return snapshot;
  }
  private savedSearch(json: string, args: OperationArguments): string {
    const items = parseBrowserSavedSearches(json);
    const result = args.operation === 'delete' ? removeBrowserSavedSearch(items, args.name!) :
      upsertBrowserSavedSearch(items, args.name!, args.query ?? '', items.some((item): boolean => item.name === args.name!) ? args.name! : '');
    if (!result.ok) throw new Error('saved_search_' + result.reason); return serializeBrowserSavedSearches(result.items);
  }
  private presetRequest(view: DeckConfigsForUpdateView, args: OperationArguments) {
    const presets = new DeckOptionsPresets(view); const current = copyDeckConfig(presets.current().config);
    if (!presets.entries.some((entry): boolean => entry.config.id === args.presetId)) throw new Error('preset_missing');
    presets.select(String(args.presetId), current);
    const selected = copyDeckConfig(presets.current().config);
    if (args.operation === 'rename') presets.rename(args.name ?? '', selected);
    else if (args.operation === 'clone') presets.add(args.name ?? '', selected, true);
    else if (args.operation === 'delete') presets.remove(selected);
    if ((args.operation === 'rename' || args.operation === 'delete') && args.presetId !== view.currentDeck?.configId) {
      presets.select(String(view.currentDeck!.configId),presets.current().config);
    }
    const draft: DeckConfig = copyDeckConfig(presets.current().config);
    const original = view.allConfigs.find((entry): boolean => entry.config.id === view.currentDeck?.configId)!.config;
    const request = buildDeckConfigRequest(args.deckId!, view, original, draft, true, {
      limits: view.currentDeck?.limits ?? null, newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit,
      fsrs: view.fsrs, applyAllParentLimits: view.applyAllParentLimits, fsrsHealthCheck: view.fsrsHealthCheck, fsrsReschedule: false });
    request.configs = presets.modifiedExceptCurrent().concat([draft]); request.removedConfigIds = presets.removedIds.slice(); return request;
  }
  async execute(name: string, args: OperationArguments, snapshot: OperationSnapshot): Promise<string> {
    let result: Object = { completed: true };
    switch (name) {
      case 'propose_set_card_state': {
        const states = await this.cardList(args.cardIds!);
        const ids = states.filter((card): boolean => args.operation === 'unsuspend' ? card.queue === -1 : args.operation === 'unbury' ? card.queue < -1 : true).map((card): number => card.id);
        if (ids.length > 0) {
          if (args.operation === 'unsuspend' || args.operation === 'unbury') await this.scheduler.恢复埋藏与暂停的卡片(ids);
          else await this.scheduler.批量埋藏或暂停卡片(ids, args.operation === 'suspend' ? BURY_SUSPEND_MODE_SUSPEND : BURY_SUSPEND_MODE_BURY_USER);
        }
        result = { affected: ids.length, cards: await this.cardList(args.cardIds!) }; break;
      }
      case 'propose_reset_cards': await this.scheduler.scheduleCardsAsNew(args.cardIds!, { restorePosition: args.restorePosition!, resetCounts: args.resetCounts! }); result = await this.cardList(args.cardIds!); break;
      case 'propose_set_due_date': await this.scheduler.设置到期日(args.cardIds!, args.days!); result = await this.cardList(args.cardIds!); break;
      case 'propose_reposition_cards': await this.scheduler.排序卡片(args.cardIds!, args.start!, args.step!, args.random!, args.shift!); result = await this.cardList(snapshot.cardIds); break;
      case 'propose_grade_cards': await this.scheduler.gradeNow(args.cardIds!, args.rating!); result = await this.cardList(args.cardIds!); break;
      case 'propose_set_card_flag': await setCardFlags(this.marking, args.cardIds!, args.flag!); result = await this.cardList(args.cardIds!); break;
      case 'propose_update_note_tags': {
        if (args.operation === 'add') result = await this.tags.添加笔记标签({ noteIds: args.noteIds!, tags: args.value! });
        else if (args.operation === 'remove') result = await this.tags.移除笔记标签({ noteIds: args.noteIds!, tags: args.value! });
        else { const notes = await this.noteList(args.noteIds!); for (const note of notes) note.tags = args.value!.trim().split(/\s+/).filter((tag): boolean => tag !== ''); await this.notes.更新笔记(notes, false); }
        result = { notes: (await this.noteList(args.noteIds!)).map((note): Object => ({ id: note.id, tags: note.tags })) }; break;
      }
      case 'propose_rename_tag': result = await this.tags.重命名标签({ currentPrefix: args.name!, newPrefix: args.value! }); break;
      case 'propose_delete_tag': result = await this.tags.移除标签(args.name!); break;
      case 'propose_clear_unused_tags': result = await this.tags.清除未用标签(); break;
      case 'propose_saved_search': {
        const json = this.savedSearch(await this.sidebar.savedSearches(), args); await this.sidebar.saveSavedSearches(json);
        if (await this.sidebar.savedSearches() !== json) throw new Error('saved_search_save_unverified'); result = JSON.parse(json) as Object; break;
      }
      case 'propose_find_replace': result = await this.search.查找并替换({ nids: args.noteIds!, search: args.find!, replacement: args.replace!, regex: args.regex!, matchCase: args.matchCase!, fieldName: args.field! }); break;
      case 'propose_collection_history': result = args.operation === 'undo' ? await this.collection.撤销() : await this.collection.重做(); break;
      case 'propose_check_database': result = await this.collection.检查数据库(); break;
      case 'propose_flag_name': result = await renameCardFlag(this.marking, args.flag!, args.name!); break;
      case 'propose_clone_notetype': result = { notetypeId: await this.types.添加笔记类型旧版(cloneNotetypeJson(await this.types.获取笔记类型旧版(args.notetypeId!), args.name!)) }; break;
      case 'propose_rename_notetype':
      case 'propose_edit_notetype_structure': {
        const json = await this.types.获取笔记类型旧版(args.notetypeId!);
        await this.types.更新笔记类型旧版(notetypeDraft(json, args), false); result = await this.types.获取笔记类型旧版(args.notetypeId!); break;
      }
      case 'propose_create_filtered_deck': {
        const draft = filteredDeckPatch(await this.decks.获取或创建过滤牌组(0), args.changesJson!); draft.name = args.name!;
        result = { deckId: await this.decks.添加或更新过滤牌组(draft) }; break;
      }
      case 'propose_maintain_filtered_deck': {
        if (args.operation === 'empty_filtered') await this.scheduler.清空过滤牌组(args.deckId!);
        else result = { count: await this.scheduler.重建过滤牌组(args.deckId!) }; break;
      }
      case 'propose_custom_study': {
        if (args.operation === 'state_or_tags') await this.scheduler.customStudyByStateOrTags(args.deckId!, cram(args.value!));
        else await this.scheduler.自定义学习(args.deckId!, studyPreset(args.operation!), Number(args.value)); break;
      }
      case 'propose_manage_deck_preset': await this.configs.更新牌组配置(this.presetRequest(await this.presetView(args), args)); result = JSON.parse(await this.read('get_deck_presets', args)) as Object; break;
      case 'propose_custom_scheduling': {
        const view = await this.presetView(args); const config = view.allConfigs.find((entry): boolean => entry.config.id === view.currentDeck?.configId)!.config;
        const request = buildDeckConfigRequest(args.deckId!, view, config, config, true, { cardStateCustomizer: args.value!, limits: view.currentDeck?.limits ?? null,
          newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit, fsrs: view.fsrs, applyAllParentLimits: view.applyAllParentLimits, fsrsHealthCheck: view.fsrsHealthCheck, fsrsReschedule: false });
        await this.configs.更新牌组配置(request);
        if ((await this.presetView(args)).cardStateCustomizer !== args.value) throw new Error('custom_scheduling_save_unverified'); break;
      }
      case 'propose_optimize_fsrs': {
        const view = await this.presetView(args); const results: Object[] = [];
        for (const entry of view.allConfigs.filter((entry): boolean => args.scope === 'all_presets' || entry.config.id === view.currentDeck?.configId)) {
          if (entry.config.config === null) throw new Error('fsrs_config_unavailable');
          const input = fsrsOptimizeInput(entry.config, view.fsrsHealthCheck, await this.fsrs.presetSearch(entry.config.id));
          results.push({ presetId: entry.config.id, result: await this.fsrs.optimize(input) });
        }
        result = { saved: false, results: results }; break;
      }
      default: throw new Error('operation_unavailable');
    }
    return JSON.stringify({ status: 'completed', result: result });
  }
}
