// SPDX-License-Identifier: AGPL-3.0-or-later

/** 末尾折叠区展开后，只在内容完成布局时滚动一次；展开状态仍由宿主持有。 */
export class ExpansionReveal {
  readonly scroller: Scroller = new Scroller();
  private pending: boolean = false;

  request(expanded: boolean): void {
    this.pending = expanded;
  }

  revealAfterLayout(expanded: boolean, contentHeight: number): void {
    if (!expanded) {
      this.cancel();
      return;
    }
    if (!this.pending || !Number.isFinite(contentHeight) || contentHeight <= 0) {
      return;
    }
    this.pending = false;
    this.scroller.scrollEdge(Edge.Bottom);
  }

  cancel(): void {
    this.pending = false;
  }
}
