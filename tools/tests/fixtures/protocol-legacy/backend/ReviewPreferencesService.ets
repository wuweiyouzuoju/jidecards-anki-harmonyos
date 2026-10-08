// SPDX-License-Identifier: AGPL-3.0-or-later
import { 配置服务 } from './配置服务';
import { ReviewPreferencesBackend, ReviewPreferencesStore } from '../model/ReviewPreferencesStore';

class CoreReviewPreferences implements ReviewPreferencesBackend {
  private readonly config: 配置服务 = new 配置服务();
  read(): Promise<Uint8Array> { return this.config.getPreferences(); }
  async write(bytes: Uint8Array): Promise<void> { await this.config.setPreferences(bytes); }
  changed(): void {
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }
}

export const reviewPreferences: ReviewPreferencesStore = new ReviewPreferencesStore(new CoreReviewPreferences());
