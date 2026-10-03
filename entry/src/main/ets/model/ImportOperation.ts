// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ImportProgress {
  text: string;
  processed: number;
  total: number;
  cancellable: boolean;
}

export class ImportCancelled extends Error {
  constructor() { super('transfer_cancelled'); }
}

/** One operation owns cancellation, including the interval before Core installs its handler. */
export class ImportOperation {
  cancelled: boolean = false;
  private publish: (progress: ImportProgress) => void;
  private lastByteProgress: number = 0;
  constructor(publish: (progress: ImportProgress) => void) { this.publish = publish; }
  cancel(): void { this.cancelled = true; }
  check(): void { if (this.cancelled) throw new ImportCancelled(); }
  progress(text: string, processed: number = 0, total: number = 0, cancellable: boolean = true): void {
    const now: number = Date.now();
    if (total > 0 && processed < total && now - this.lastByteProgress < 100) return;
    if (total > 0) this.lastByteProgress = now;
    this.publish({ text, processed, total, cancellable });
  }
}
