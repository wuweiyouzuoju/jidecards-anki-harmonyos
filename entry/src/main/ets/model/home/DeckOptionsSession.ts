// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigsForUpdateView, UpdateDeckConfigsInput } from '../../proto/messages/DeckConfigMessages';
import { buildDeckConfigRequest, copyDeckConfig } from '../DeckConfigSave';
import type { DeckConfigRequestOptions } from '../DeckConfigSave';
import { applyFsrsParams, fsrsOptimizeInput, fsrsWorkloadInput } from '../FsrsOptions';
import type { ComputeFsrsParamsInput, ComputeFsrsParamsOutput, SimulateFsrsInput,
  FsrsWorkloadOutput, EvaluateFsrsInput, EvaluateFsrsOutput, FsrsHistoryCount } from '../../proto/messages/FsrsMessages';
import { AutoSyncScheduler, autoSyncScheduler } from '../AutoSyncScheduler';
import { SyncActivity, syncActivity } from '../SyncSettings';
import { DeckOptionsPresets } from '../DeckOptionsPresets';
import type { DeckOptionsPresetEntry } from '../DeckOptionsPresets';

// A reopened panel must wait for the previous panel's real Core call, including a failed call.
let deckOptionsWorkTail: Promise<void> = Promise.resolve();

export interface FsrsPresetResult {
  id: number;
  name: string;
  fsrsItems: number;
  healthCheckPassed: boolean | null;
  error: string;
}

export class DeckOptionsFsrsState {
  busy: boolean = false;
  operation: string = '';
  current: number = 0;
  total: number = 0;
  results: FsrsPresetResult[] = [];
  batchDraft: boolean = false;
  allPresets: boolean = false;
  workload: FsrsWorkloadOutput | null = null;
  workloadDays: number = 0;
  error: string = '';
  evaluation: EvaluateFsrsOutput | null = null;
  evaluationSearch: string = '';
  evaluationDate: string = '';
  historyCount: FsrsHistoryCount | null = null;
}

export interface DeckOptionsBackend {
  load(deckId: number): Promise<DeckConfigsForUpdateView>;
  save(request: UpdateDeckConfigsInput): Promise<void>;
  committed(): void;
  optimize?(input: ComputeFsrsParamsInput): Promise<ComputeFsrsParamsOutput>;
  workload?(input: SimulateFsrsInput): Promise<FsrsWorkloadOutput>;
  presetSearch?(id: number): Promise<string>;
  evaluate?(input: EvaluateFsrsInput): Promise<EvaluateFsrsOutput>;
  historyCount?(date: string, search: string): Promise<FsrsHistoryCount>;
}

export interface DeckOptionsSnapshot {
  phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error';
  view: DeckConfigsForUpdateView | null;
  config: DeckConfig | null;
  error: string;
  fsrs: DeckOptionsFsrsState;
  presets?: DeckOptionsPresetEntry[];
  presetKey?: string;
  presetAssignmentsChanged?: boolean;
}

/** 一个弹层实例拥有一次编辑会话。已接受写入继续，销毁后不再通知 UI。 */
export class DeckOptionsSession {
  private backend: DeckOptionsBackend;
  private publish: (state: DeckOptionsSnapshot) => void;
  private deckId: number;
  private version: number = 0;
  private alive: boolean = true;
  private saving: boolean = false;
  private completed: boolean = false;
  private loading: boolean = true;
  private view: DeckConfigsForUpdateView | null = null;
  private original: DeckConfig | null = null;
  private fsrs: DeckOptionsFsrsState = new DeckOptionsFsrsState();
  private optimized: DeckConfig[] = [];
  private presets: DeckOptionsPresets | null = null;
  private scheduler: AutoSyncScheduler;
  private activity: SyncActivity;

  constructor(deckId: number, backend: DeckOptionsBackend, publish: (state: DeckOptionsSnapshot) => void,
    scheduler: AutoSyncScheduler = autoSyncScheduler, activity: SyncActivity = syncActivity) {
    this.deckId = deckId;
    this.backend = backend;
    this.publish = publish;
    this.scheduler = scheduler;
    this.activity = activity;
  }

  async load(): Promise<void> {
    if (!this.alive || this.saving || this.fsrs.busy || this.completed) return;
    const version: number = ++this.version;
    this.loading = true;
    this.emit('loading', '');
    const owner: Object = {};
    this.scheduler.beginOperation(owner);
    try {
      await deckOptionsWorkTail;
      await this.activity.waitForCollection();
      if (!this.alive || version !== this.version) return;
      const view: DeckConfigsForUpdateView = await this.backend.load(this.deckId);
      if (!this.alive || version !== this.version) return;
      const entry = view.allConfigs.find(item => item.config.id === view.currentDeck?.configId);
      if (entry === undefined || entry.config.config === null) throw new Error('deck config not found');
      this.view = view;
      this.original = copyDeckConfig(entry.config);
      this.presets = new DeckOptionsPresets(view);
      this.optimized = [];
      this.fsrs = new DeckOptionsFsrsState();
      this.loading = false;
      this.emit('ready', '');
    } catch (error) {
      if (this.alive && version === this.version) this.emit('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.scheduler.endOperation(owner);
    }
  }

  async save(draft: DeckConfig, shared: boolean, options: DeckConfigRequestOptions): Promise<boolean> {
    if (!this.canOperate()) return false;
    // Bulk optimization changes shared parameters. Other current-deck edits still obey the user's scope.
    const optimizedCurrent = this.optimized.find(config => config.id === this.original!.id);
    const baseline = optimizedCurrent === undefined ? this.original! : optimizedCurrent;
    const request: UpdateDeckConfigsInput = buildDeckConfigRequest(this.deckId, this.view!, baseline, draft, shared, options);
    // Current config must stay last: Core uses it to bind targetDeckId.
    request.configs = this.optimized.filter(config => config.id !== request.configs[0].id)
      .map(config => copyDeckConfig(config)).concat(request.configs);
    if (this.presets !== null) {
      const staged = this.presets.modifiedExceptCurrent();
      const current = request.configs[request.configs.length - 1];
      const others = request.configs.slice(0, -1).filter(config => !this.presets!.removedIds.includes(config.id))
        .map(config => staged.find(item => item.id !== 0 && item.id === config.id) ?? config);
      request.configs = others.concat(staged.filter(config => config.id === 0 || !others.some(item => item.id === config.id)), [current]);
      request.removedConfigIds = this.presets.removedIds.slice();
    }
    this.saving = true;
    this.emit('saving', '');
    try {
      await this.runWork(async (): Promise<void> => { await this.backend.save(request); });
    } catch (error) {
      this.saving = false;
      this.emit('ready', error instanceof Error ? error.message : String(error));
      return false;
    }
    // 成功广播不依赖弹层是否仍挂载；刷新失败不得把已提交写入变回可重试。
    this.completed = true;
    this.saving = false;
    let notificationError: string = '';
    try { this.backend.committed(); }
    catch (error) { notificationError = error instanceof Error ? error.message : String(error); }
    this.emit('saved', notificationError);
    return true;
  }

  dispose(): void { this.alive = false; this.version++; }

  editPreset(action: string, value: string, draft: DeckConfig): boolean {
    if (!this.canOperate() || this.presets === null) return false;
    switch (action) {
      case 'select': this.presets.select(value, draft); break;
      case 'rename': this.presets.rename(value, draft); break;
      case 'create': this.presets.add(value, draft, false); break;
      case 'clone': this.presets.add(value, draft, true); break;
      case 'remove': this.presets.remove(draft); break;
      default: return false;
    }
    this.original = copyDeckConfig(this.presets.current().config);
    this.fsrs.workload = null; this.fsrs.evaluation = null; this.fsrs.historyCount = null;
    this.emit('ready', '');
    return true;
  }

  private canOperate(): boolean {
    return this.alive && !this.loading && !this.saving && !this.fsrs.busy && !this.completed && this.view !== null && this.original !== null;
  }

  /** Pure computation is staged; only save() submits deck configurations. */
  async optimize(draft: DeckConfig, options: DeckConfigRequestOptions, all: boolean,
    retryFailures: boolean = false): Promise<number[] | null> {
    if (!this.canOperate() || !options.fsrs || this.backend.optimize === undefined || this.presets?.assignmentsChanged) return null;
    const current = copyDeckConfig(draft);
    const targets: DeckConfig[] = [];
    const seen = new Set<number>();
    for (const entry of this.view!.allConfigs) {
      const config = entry.config.id === current.id ? current : copyDeckConfig(entry.config);
      if ((!all && config.id !== current.id) || seen.has(config.id)) continue;
      if (retryFailures && !this.fsrs.results.some(result => result.id === config.id && result.error !== '')) continue;
      seen.add(config.id);
      targets.push(config);
    }
    if (targets.length === 0) return null;
    const version = ++this.version;
    const healthCheck = options.fsrsHealthCheck;
    this.fsrs.busy = true;
    this.fsrs.operation = 'optimize';
    this.fsrs.allPresets = all;
    this.fsrs.current = 0;
    this.fsrs.total = targets.length;
    this.fsrs.error = '';
    this.fsrs.workload = null;
    if (!retryFailures) this.fsrs.results = [];
    this.emit('ready', '');
    let currentParams: number[] | null = null;
    try {
      await this.runWork(async (): Promise<void> => {
        for (const config of targets) {
          if (!this.alive || version !== this.version) return;
          this.fsrs.current++;
          this.emit('ready', '');
          const result: FsrsPresetResult = { id: config.id, name: config.name, fsrsItems: 0,
            healthCheckPassed: null, error: '' };
          try {
            const search = config.config!.paramSearch.trim() === ''
              ? await this.presetSearch(config.id) : config.config!.paramSearch;
            if (!this.alive || version !== this.version) return;
            const input = fsrsOptimizeInput(config, healthCheck, search);
            const response = await this.backend.optimize!(input);
            if (!this.alive || version !== this.version) return;
            result.fsrsItems = response.fsrsItems;
            result.healthCheckPassed = response.healthCheckPassed;
            if (response.fsrsItems > 0) {
              applyFsrsParams(config.config!, response.params);
              if (all) {
                const staged = config.id === current.id ? copyDeckConfig(this.original!) : config;
                applyFsrsParams(staged.config!, response.params);
                this.optimized = this.optimized.filter(item => item.id !== config.id).concat([staged]);
                this.fsrs.batchDraft = true;
                const entry = this.presets?.entries.find(item => item.config.id === config.id);
                if (entry !== undefined) applyFsrsParams(entry.config.config!, response.params);
              }
              if (config.id === current.id) currentParams = response.params.slice();
            }
          } catch (error) {
            if (!this.alive || version !== this.version) return;
            result.error = error instanceof Error ? error.message : String(error);
          }
          this.fsrs.results = this.fsrs.results.filter(item => item.id !== result.id).concat([result]);
          this.emit('ready', '');
        }
      });
    } catch (error) {
      this.fsrs.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.fsrs.busy = false;
      this.emit('ready', '');
    }
    return this.alive && version === this.version ? currentParams : null;
  }

  async evaluate(draft: DeckConfig): Promise<void> {
    if (!this.canOperate()) return;
    if (this.backend.evaluate === undefined || this.backend.historyCount === undefined) throw new Error('FSRS evaluation is unavailable');
    const frozen = copyDeckConfig(draft);
    const request = fsrsOptimizeInput(frozen, false, 'did:0 -is:suspended');
    const version: number = ++this.version;
    this.fsrs.busy = true; this.fsrs.operation = 'evaluate'; this.fsrs.error = '';
    this.fsrs.evaluation = null; this.fsrs.historyCount = null; this.emit('ready', '');
    try {
      await this.runWork(async (): Promise<void> => {
        if (!this.alive || version !== this.version) return;
        const search: string = frozen.config!.paramSearch.trim() === '' ? await this.presetSearch(frozen.id) : frozen.config!.paramSearch;
        if (!this.alive || version !== this.version) return;
        this.fsrs.evaluationSearch = search; this.fsrs.evaluationDate = frozen.config!.ignoreRevlogsBeforeDate;
        const count = await this.backend.historyCount!(this.fsrs.evaluationDate, search);
        if (!this.alive || version !== this.version) return;
        this.fsrs.historyCount = count;
        const result = await this.backend.evaluate!({ params: request.currentParams, search: search,
          ignoreRevlogsBeforeMs: request.ignoreRevlogsBeforeMs });
        if (this.alive && version === this.version) this.fsrs.evaluation = result;
      });
    } catch (error) { this.fsrs.error = error instanceof Error ? error.message : String(error); }
    finally { this.fsrs.busy = false; this.emit('ready', ''); }
  }

  async simulate(draft: DeckConfig, options: DeckConfigRequestOptions, days: number): Promise<void> {
    if (!this.canOperate() || !options.fsrs || this.backend.workload === undefined) return;
    // Freeze all draft inputs now; replace the empty scope only after collection access is available.
    const request = fsrsWorkloadInput(copyDeckConfig(draft), options, days, 'did:0 -is:suspended');
    const presetId = draft.id;
    const version = ++this.version;
    this.fsrs.busy = true;
    this.fsrs.operation = 'simulate';
    this.fsrs.error = '';
    this.fsrs.workload = null;
    this.emit('ready', '');
    try {
      await this.runWork(async (): Promise<void> => {
        if (!this.alive || version !== this.version) return;
        request.search = await this.presetSearch(presetId);
        if (!this.alive || version !== this.version) return;
        const result = await this.backend.workload!(request);
        if (!this.alive || version !== this.version) return;
        this.fsrs.workload = result;
        this.fsrs.workloadDays = days;
      });
    } catch (error) {
      this.fsrs.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.fsrs.busy = false;
      this.emit('ready', '');
    }
  }

  private async presetSearch(id: number): Promise<string> {
    if (this.backend.presetSearch === undefined) throw new Error('FSRS preset scope is unavailable');
    const search = await this.backend.presetSearch(id);
    if (search.trim() === '') throw new Error('Missing FSRS preset scope');
    return search;
  }

  private async runWork(operation: () => Promise<void>): Promise<void> {
    const owner: Object = {};
    this.scheduler.beginOperation(owner);
    const work = deckOptionsWorkTail.then(async (): Promise<void> => {
      await this.activity.waitForCollection();
      await operation();
    });
    deckOptionsWorkTail = work.then((): void => {}, (): void => {});
    try { await work; }
    finally { this.scheduler.endOperation(owner); }
  }

  private emit(phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error', error: string): void {
    if (!this.alive) return;
    const fsrs = new DeckOptionsFsrsState();
    fsrs.busy = this.fsrs.busy; fsrs.operation = this.fsrs.operation;
    fsrs.current = this.fsrs.current; fsrs.total = this.fsrs.total;
    fsrs.results = this.fsrs.results.slice(); fsrs.batchDraft = this.fsrs.batchDraft;
    fsrs.allPresets = this.fsrs.allPresets;
    fsrs.workload = this.fsrs.workload; fsrs.workloadDays = this.fsrs.workloadDays; fsrs.error = this.fsrs.error;
    fsrs.evaluation = this.fsrs.evaluation; fsrs.historyCount = this.fsrs.historyCount;
    fsrs.evaluationSearch = this.fsrs.evaluationSearch; fsrs.evaluationDate = this.fsrs.evaluationDate;
    this.publish({ phase: phase, view: this.view, config: this.original, error: error, fsrs: fsrs,
      presets: this.presets?.entries.map(entry => ({ key: entry.key, config: copyDeckConfig(entry.config), useCount: entry.useCount })),
      presetKey: this.presets?.selectedKey, presetAssignmentsChanged: this.presets?.assignmentsChanged });
  }
}
