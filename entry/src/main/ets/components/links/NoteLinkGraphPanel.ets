// SPDX-License-Identifier: AGPL-3.0-or-later
import { appInterface } from '../../backend/AppInterfaceService';
import { noteLinksService } from '../../backend/NoteLinksService';
import { NoteLinkGraph } from '../../model/NoteLinkGraph';
import { NoteLinkRow } from '../../model/NoteLinks';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { NoteLinkGraphCanvas } from './NoteLinkGraphCanvas';
import { 按下态按钮 } from '../common/按下态按钮';

@Component
export struct NoteLinkGraphPanel {
  @Prop initialCenter: number = 0;
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  onClose: () => void = (): void => {};
  onPreview: (ids: number[], center: number) => void = (_ids: number[], _center: number): void => {};

  @State private data: NoteLinkGraph = { nodes: [], edges: [] };
  @State private selected: number = 0;
  @State private busy: boolean = true;
  @State private error: string = '';
  private center: number = 0;
  private requestedCenter: number = 0;
  private generation: number = 0;
  private mounted: boolean = false;
  aboutToAppear(): void {
    this.mounted = true;
    this.load(this.initialCenter);
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.generation++;
    appInterface.leave('note_link_graph');
  }

  private currentRow(): NoteLinkRow | undefined { return this.data.nodes[this.selected]; }
  private canPreview(): boolean { return !this.busy && (this.currentRow()?.cardIds.length ?? 0) > 0; }
  private canCenter(): boolean { return !this.busy && this.selected !== 0 && (this.currentRow()?.noteId ?? 0) > 0; }

  private observe(): void {
    if (!this.mounted) return;
    appInterface.observe({ surface: 'note_link_graph', sectionId: 'graph', selectedId: '',
      optionIds: [], optionLabels: [], busy: this.busy, controlsComplete: true,
      items: [
        { id: 'close', titleKey: 'browser_preview_close', title: '', enabled: true, selected: false },
        { id: 'preview', titleKey: 'note_preview_card_label', title: '', enabled: this.canPreview(), selected: false },
        { id: 'center', titleKey: 'note_link_graph_center', title: '', enabled: this.canCenter(), selected: false }
      ],
      values: [{ id: 'node_count', value: String(this.data.nodes.length) },
        { id: 'edge_count', value: String(this.data.edges.length) }] });
  }

  private async load(id: number): Promise<void> {
    const generation: number = ++this.generation;
    this.requestedCenter = id;
    this.busy = true;
    this.error = '';
    this.observe();
    try {
      const graph: NoteLinkGraph = await noteLinksService.neighborhood(id);
      if (!this.mounted || generation !== this.generation) return;
      this.center = id;
      this.data = graph;
      this.selected = 0;
    } catch (error) {
      if (!this.mounted || generation !== this.generation) return;
      this.error = resourceText(this.getUIContext(), (error as Error).message === 'note_links_migrate'
        ? $r('app.string.note_links_migrate') : $r('app.string.note_links_error'));
    } finally {
      if (this.mounted && generation === this.generation) {
        this.busy = false;
        this.observe();
      }
    }
  }

  private select(index: number): void {
    if (!this.mounted || this.busy || index >= this.data.nodes.length) return;
    this.selected = index;
    this.observe();
  }

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.note_link_graph_title'), closeLabel: $r('app.string.browser_preview_close'),
      showAction: false, onClose: this.onClose })
  }

  @Builder
  private content() {
    Stack({ alignContent: Alignment.Center }) {
      NoteLinkGraphCanvas({ graph: this.data, interactive: !this.busy, onSelect: (index: number): void => { this.select(index); } })
      if (this.busy) LoadingProgress().width(32).height(32)
      if (!this.busy && this.error !== '') {
        Column({ space: 应用尺寸.间距_8 }) {
          Text(this.error).fontColor($r('app.color.error_text'))
          按下态按钮({ 文案: $r('app.string.note_links_reload'), 点击回调: (): void => { this.load(this.requestedCenter); } })
        }.padding(应用尺寸.间距_12)
        .backgroundColor(appearanceElementColor(this.appearanceElements, 'surface_page', $r('app.color.surface_page')))
      }
    }.width('100%').height('100%').clip(true)
  }

  @Builder
  private footer() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.data.nodes.length > 0) {
        Text(this.currentRow()?.label ?? '').fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.currentRow()?.noteId === 0 ? $r('app.string.note_links_missing') :
          this.data.edges.length === 0 && !this.busy ? $r('app.string.note_link_graph_empty') : $r('app.string.note_link_graph_direction'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
          .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%').height(36)
        Row({ space: 应用尺寸.间距_8 }) {
          PrimaryActionButton({ label: $r('app.string.note_preview_card_label'), isInteractive: this.canPreview(),
            onAction: (): void => { if (this.canPreview()) this.onPreview(this.currentRow()?.cardIds ?? [], this.center); } }).layoutWeight(1)
          按下态按钮({ 文案: $r('app.string.note_link_graph_center'), 是否启用: this.canCenter(),
            fillWidth: true, singleLine: false, autoHeight: true,
            点击回调: (): void => { if (this.canCenter()) this.load(this.currentRow()?.noteId ?? 0); } }).layoutWeight(1)
        }.width('100%')
      }
    }.width('100%')
  }

  build() {
    DialogFrame({ protectPanelGestures: true, fixedHeight: 660, maximumWidth: 680, fillBody: true, showFooter: true, opaque: true,
      header: (): void => { this.header(); }, content: (): void => { this.content(); }, footer: (): void => { this.footer(); }, onDismiss: this.onClose })
  }
}
