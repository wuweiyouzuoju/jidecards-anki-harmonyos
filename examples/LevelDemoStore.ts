// SPDX-License-Identifier: AGPL-3.0-or-later
import * as Levels from '../src/core/Levels.ts';

interface DemoReceipt {
  key: string;
  fingerprint: string;
}

interface DemoSnapshot {
  accounts: Levels.LevelState[];
  receipts: DemoReceipt[];
}

/** 单进程事务示例；正式接入替换为共享账户持久化事务/API，不能每个应用各建一份。 */
export class DemoLevelDatabase {
  accounts: Map<string, Levels.LevelState> = new Map<string, Levels.LevelState>();
  receipts: Map<string, string> = new Map<string, string>();
  tail: Promise<void> = Promise.resolve();

  snapshot(): string {
    const accounts: Levels.LevelState[] = [];
    const receipts: DemoReceipt[] = [];
    this.accounts.forEach((state: Levels.LevelState): void => { accounts.push(Levels.cloneLevelState(state)); });
    this.receipts.forEach((fingerprint: string, key: string): void => {
      receipts.push({ key: key, fingerprint: fingerprint });
    });
    const saved: DemoSnapshot = { accounts: accounts, receipts: receipts };
    return JSON.stringify(saved);
  }

  static restore(snapshot: string): DemoLevelDatabase {
    const saved: DemoSnapshot = JSON.parse(snapshot) as DemoSnapshot;
    const database: DemoLevelDatabase = new DemoLevelDatabase();
    for (const state of saved.accounts) { database.accounts.set(state.accountId, Levels.cloneLevelState(state)); }
    for (const receipt of saved.receipts) { database.receipts.set(receipt.key, receipt.fingerprint); }
    return database;
  }
}

export class DemoSharedLevelStore implements Levels.SharedLevelStore {
  readonly database: DemoLevelDatabase;

  constructor(database: DemoLevelDatabase = new DemoLevelDatabase()) { this.database = database; }

  async read(accountId: string): Promise<Levels.LevelState | undefined> {
    await this.database.tail;
    const state: Levels.LevelState | undefined = this.database.accounts.get(accountId);
    return state === undefined ? undefined : Levels.cloneLevelState(state);
  }

  transact(accountId: string, operationId: string, fingerprint: string,
    update: (current: Levels.LevelState | undefined) => Levels.LevelMutation): Promise<Levels.LevelCommit> {
    const work: Promise<Levels.LevelCommit> = this.database.tail.then((): Levels.LevelCommit => {
      const key: string = JSON.stringify([accountId, operationId]);
      const receipt: string | undefined = this.database.receipts.get(key);
      const current: Levels.LevelState | undefined = this.database.accounts.get(accountId);
      if (receipt !== undefined) {
        if (receipt !== fingerprint) { throw new Error('Conflicting shared level operation'); }
        if (current === undefined) { throw new Error('Missing state for committed receipt'); }
        return { state: Levels.cloneLevelState(current), changed: false, replayed: true };
      }
      const mutation: Levels.LevelMutation = update(current === undefined ? undefined : Levels.cloneLevelState(current));
      // 此同步临界区演示状态与回执一起提交；真实数据库必须在同一事务内完成。
      if (mutation.changed) {
        this.database.accounts.set(accountId, Levels.cloneLevelState(mutation.state));
        this.database.receipts.set(key, fingerprint);
      }
      return { state: Levels.cloneLevelState(mutation.state), changed: mutation.changed, replayed: false };
    });
    this.database.tail = work.then((): void => {}, (): void => {});
    return work;
  }
}
