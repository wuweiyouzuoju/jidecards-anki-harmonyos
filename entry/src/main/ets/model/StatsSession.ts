// SPDX-License-Identifier: AGPL-3.0-or-later
import type { GraphsView, GraphPreferences } from '../proto/messages/StatsMessages';

export interface StatsRequest { days: number; search: string; hours: number; }
export interface StatsSnapshot {
  phase: 'loading' | 'content' | 'error';
  graphs: GraphsView | null;
  preferences: GraphPreferences;
  error: string;
}
export interface StatsBackend {
  waitForCollection(): Promise<void>;
  graphs(request: StatsRequest, current: () => boolean): Promise<GraphsView>;
  preferences(): Promise<GraphPreferences>;
  savePreferences(value: GraphPreferences): Promise<void>;
  publishWidget(graphs: GraphsView, hours: number, separate: boolean, current: () => boolean): Promise<void>;
}

/** 查询与偏好写入各自串行/失效；图表布局和范围选择仍由页面持有。 */
export class StatsSession {
  private backend: StatsBackend;
  private notify: (snapshot: StatsSnapshot) => void;
  private state: StatsSnapshot;
  private defaults: GraphPreferences;
  private alive: boolean = true;
  private generation: number = 0;
  private preferenceRevision: number = 0;
  private writes: Promise<void> = Promise.resolve();

  constructor(backend: StatsBackend, initial: GraphsView | null, defaults: GraphPreferences,
    notify: (snapshot: StatsSnapshot) => void) {
    this.backend = backend;
    this.defaults = defaults;
    this.notify = notify;
    this.state = { phase: 'loading', graphs: initial, preferences: defaults, error: '' };
  }
  dispose(): void { this.alive = false; this.generation++; }
  private emit(): void {
    if (this.alive) this.notify({ phase: this.state.phase, graphs: this.state.graphs,
      preferences: this.state.preferences, error: this.state.error });
  }

  async load(request: StatsRequest): Promise<void> {
    if (!this.alive) return;
    const frozen: StatsRequest = { days: request.days, search: request.search, hours: request.hours };
    const generation: number = ++this.generation;
    const preferenceRevision: number = this.preferenceRevision;
    const current = (): boolean => this.alive && generation === this.generation;
    this.state.phase = 'loading';
    this.emit();
    try {
      await this.backend.waitForCollection();
      if (!current()) return;
      const graphs: GraphsView = await this.backend.graphs(frozen, current);
      if (!current()) return;
      let preferences: GraphPreferences = this.defaults;
      try { preferences = await this.backend.preferences(); } catch (error) {}
      if (!current()) return;
      this.state.graphs = graphs;
      if (preferenceRevision === this.preferenceRevision) this.state.preferences = preferences;
      this.state.phase = 'content';
      this.state.error = '';
      this.emit();
      if (frozen.search === '') await this.backend.publishWidget(graphs, frozen.hours,
        this.state.preferences.cardCountsSeparateInactive, current);
    } catch (error) {
      if (!current()) return;
      this.state.phase = 'error';
      this.state.error = error instanceof Error ? error.message : `${error}`;
      this.emit();
    }
  }

  updatePreferences(change: (old: GraphPreferences) => GraphPreferences): Promise<void> {
    const operation: Promise<void> = this.writes.then(async (): Promise<void> => {
      await this.backend.waitForCollection();
      if (!this.alive) return;
      const value: GraphPreferences = change(this.state.preferences);
      this.preferenceRevision++;
      this.state.preferences = value;
      this.emit();
      // 已接受的偏好写入完成后才放行下一项；展示继续保留用户选择。
      try { await this.backend.savePreferences(value); } catch (error) {}
    });
    this.writes = operation.catch((): void => {});
    return operation;
  }

  async refreshWidget(request: StatsRequest): Promise<void> {
    if (!this.alive || this.state.phase !== 'content' || request.search !== '' || this.state.graphs === null) return;
    const generation: number = this.generation;
    await this.backend.publishWidget(this.state.graphs, request.hours, this.state.preferences.cardCountsSeparateInactive,
      (): boolean => this.alive && generation === this.generation);
  }
}
