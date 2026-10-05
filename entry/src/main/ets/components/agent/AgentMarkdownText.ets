// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentMarkdownBlock, AgentMarkdownRow, parseAgentMarkdown } from '../../model/agent/AgentMarkdown';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { AgentTextRun, parseAgentBoldRuns } from '../../model/agent/AgentTextFormatting';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { hasAgentMath } from '../../model/agent/AgentMath';
import { AgentMathText } from './AgentMathText';

interface MarkdownPosition { blockIndex: number; rowIndex: number; columnIndex: number; }

/** 对话共用渲染入口；原生文字/表格与离线公式组合，不执行回复中的 HTML。 */
@Component
export struct AgentMarkdownText {
  @Prop @Watch('contentChanged') text: string = '';
  @Prop textColor: ResourceColor = $r('app.color.text_primary');
  @Prop fontSize: number = 应用尺寸.字号_正文;
  @State private contentWidth: number = 320;
  @State private blocks: AgentMarkdownBlock[] = [];
  @State private containsMath: boolean = false;

  aboutToAppear(): void { this.contentChanged(); }

  private contentChanged(): void {
    this.containsMath = hasAgentMath(this.text);
    this.blocks = this.containsMath ? [] : parseAgentMarkdown(this.text);
  }

  private columnWidth(blockIndex: number): number {
    return Math.max(144, (this.contentWidth - 2) / this.blocks[blockIndex].alignments.length);
  }

  private cellAlignment(alignment: string): TextAlign {
    return alignment === 'center' ? TextAlign.Center : (alignment === 'end' ? TextAlign.End : TextAlign.Start);
  }

  private positionText(ctx: MarkdownPosition): string {
    return ctx.rowIndex < 0 ? this.blocks[ctx.blockIndex].text :
      this.blocks[ctx.blockIndex].rows[ctx.rowIndex].cells[ctx.columnIndex];
  }

  private positionAlignment(ctx: MarkdownPosition): TextAlign {
    return ctx.rowIndex < 0 ? TextAlign.Start :
      this.cellAlignment(this.blocks[ctx.blockIndex].alignments[ctx.columnIndex]);
  }

  @Builder
  private richText(ctx: MarkdownPosition) {
    Text() {
      ForEach(parseAgentBoldRuns(this.positionText(ctx)), (run: AgentTextRun) => {
        Span(run.text).fontWeight(ctx.rowIndex === 0 || run.bold ? FontWeight.Bold : FontWeight.Normal)
      })
    }.fontSize(this.fontSize).fontColor(this.textColor).width('100%')
    .textAlign(this.positionAlignment(ctx))
    .copyOption(CopyOptions.LocalDevice)
  }

  @Builder
  private tableRow(ctx: MarkdownPosition) {
    Row() {
      ForEach(this.blocks[ctx.blockIndex].rows[ctx.rowIndex].cells, (_cell: string, columnIndex: number) => {
        Column() {
          this.richText({ blockIndex: ctx.blockIndex, rowIndex: ctx.rowIndex, columnIndex: columnIndex })
        }.width(this.columnWidth(ctx.blockIndex)).padding(应用尺寸.间距_10)
      }, (_cell: string, columnIndex: number): string => `${columnIndex}`)
    }.alignItems(VerticalAlign.Top)
    .width(this.columnWidth(ctx.blockIndex) * this.blocks[ctx.blockIndex].alignments.length)
    .backgroundColor(ctx.rowIndex === 0 ? $r('app.color.surface_page') : $r('app.color.surface_card'))
    .border(SurfaceBorder.options({ bottom: 1 }))
  }

  @Builder
  private table(ctx: MarkdownPosition) {
    Scroll() {
      Column() {
        ForEach(this.blocks[ctx.blockIndex].rows, (_row: AgentMarkdownRow, rowIndex: number) => {
          this.tableRow({ blockIndex: ctx.blockIndex, rowIndex: rowIndex, columnIndex: -1 })
        }, (_row: AgentMarkdownRow, rowIndex: number): string => `${rowIndex}`)
      }.border(SurfaceBorder.options())
    }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Auto).width('100%')
  }

  @Builder
  private blockContent(ctx: MarkdownPosition) {
    if (this.blocks[ctx.blockIndex].kind === 'table') { this.table(ctx) }
    else { this.richText(ctx) }
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.containsMath) {
        AgentMathText({ text: this.text, textColor: this.textColor, fontSize: this.fontSize })
      } else {
        ForEach(this.blocks, (_block: AgentMarkdownBlock, index: number) => {
          this.blockContent({ blockIndex: index, rowIndex: -1, columnIndex: -1 })
        }, (block: AgentMarkdownBlock, index: number): string => `${index}-${block.kind}`)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
    .onAreaChange((_old: Area, area: Area): void => {
      const width: number = Number(area.width);
      if (width > 0 && Math.abs(width - this.contentWidth) > 1) this.contentWidth = width;
    })
  }
}
