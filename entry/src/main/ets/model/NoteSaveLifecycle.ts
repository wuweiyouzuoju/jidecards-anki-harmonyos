// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Owns the UI side of an accepted note save.
 *
 * A write that has crossed the backend boundary is allowed to finish after the
 * page disappears, but its completion may no longer mutate the new page or
 * navigate the old page.  The page keeps the backend operation; this class
 * only supplies the generation/disposal gate.
 */
export class NoteSaveLifecycle {
  private mounted: boolean = false;
  private generation: number = 0;

  appear(): void {
    this.mounted = true;
    this.generation += 1;
  }

  disappear(): void {
    this.mounted = false;
    this.generation += 1;
  }

  accept(): number | null {
    if (!this.mounted) return null;
    return this.generation;
  }

  isCurrent(token: number): boolean {
    return this.mounted && token === this.generation;
  }

  canNavigate(token: number): boolean {
    return this.isCurrent(token);
  }
}
