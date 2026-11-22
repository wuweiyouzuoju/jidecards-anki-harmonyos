// SPDX-License-Identifier: AGPL-3.0-or-later
import { displaySync } from '@kit.ArkGraphics2D';
import { ColorMetrics } from '@kit.ArkUI';
import { NoteLinkGraph, NoteLinkGraphEdge } from '../../model/NoteLinkGraph';
import { NoteLinkOrbit, OrbitNode } from '../../model/NoteLinkOrbit';
import { 颜色键 } from '../../model/颜色主题';
import { currentMotionProfile } from '../../utils/AppMotion';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { prefersReducedMotion } from '../../utils/ReducedMotion';
import { AppLog } from '../../model/AppLog';

interface GraphEdge extends NoteLinkGraphEdge { reciprocal: boolean; }
interface LabelHit { index: number; x: number; y: number; width: number; }
interface GraphLabel { text: string; normalWidth: number; emphasisWidth: number; }
interface GraphTouch { x: number; y: number; }
interface Pinch { x: number; y: number; distance: number; }

function pinch(points: TouchObject[]): Pinch | null {
  if (points.length < 2) return null;
  const a: TouchObject = points[0];
  const b: TouchObject = points[1];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

function ease(fraction: number): number { return 1 - Math.pow(1 - Math.min(1, Math.max(0, fraction)), 3); }

@Component
export struct NoteLinkGraphCanvas {
  @Prop @Watch('graphChanged') graph: NoteLinkGraph = { nodes: [], edges: [] };
  @Prop interactive: boolean = true;
  @StorageProp(颜色键.动作主色) @Watch('updatePalette') private accent: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) @Watch('updatePalette') private selectedSurface: string = '#E8EEFC';
  @StorageProp('appearance_elements_active') @Watch('updatePalette') private appearance: string = '';
  @StorageProp('systemDarkMode') @Watch('updatePalette') private systemDark: boolean = false;
  @StorageProp('themeMode') @Watch('updatePalette') private theme: string = 'system';
  onSelect: (index: number) => void = (_index: number): void => {};

  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private orbit: NoteLinkOrbit = new NoteLinkOrbit();
  private sync: displaySync.DisplaySync | null = null;
  private running: boolean = false;
  private visible: boolean = true;
  private ready: boolean = false;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private frameTime: number = 0;
  private reducedMotion: boolean = false;
  private edges: GraphEdge[] = [];
  private nodes: OrbitNode[] = [];
  private labels: LabelHit[] = [];
  private labelMetrics: GraphLabel[] = [];
  private labelFont: string = '';
  private emphasisFont: string = '';
  private selected: number = 0;
  private previous: number = 0;
  private highlightedAt: number = 0;
  private focusAt: number = 0;
  private focusMs: number = 0;
  private selectionMs: number = 0;
  private titleColor: string = '#182230';
  private lineColor: string = '#5D6878';
  private surface: string = '#FFFFFF';
  private tap: GraphTouch | null = null;
  private pointer: GraphTouch | null = null;
  private pinchBase: Pinch | null = null;
  private active: boolean = false;

  aboutToAppear(): void {
    this.sync = displaySync.create();
    this.sync.on('frame', (): void => { this.frame(); });
    this.graphChanged();
  }

  aboutToDisappear(): void {
    this.stopFrames();
    this.sync?.off('frame');
    this.sync = null;
    this.ready = false;
  }

  /** @throws Invalid resource colors are handled by the palette owner. */
  private colors(): void {
    this.titleColor = ColorMetrics.resourceColor(appearanceElementColor(this.appearance, 'text_primary', $r('app.color.text_primary'))).color;
    this.lineColor = ColorMetrics.resourceColor(appearanceElementColor(this.appearance, 'text_secondary', $r('app.color.text_secondary'))).color;
    this.surface = ColorMetrics.resourceColor(appearanceElementColor(this.appearance, 'surface_card', $r('app.color.surface_card'))).color;
  }

  private updatePalette(): void {
    if (!this.ready) return;
    try { this.colors(); }
    catch (error) { AppLog.warn('NoteLinkGraph', `Relationship graph palette: ${error}`); }
    this.schedule();
  }

  private graphChanged(): void {
    const time: number = Date.now();
    const recenter: boolean = this.nodes.length > 0;
    const pairs = new Set<string>(this.graph.edges.map((edge: NoteLinkGraphEdge): string => edge.source + ':' + edge.target));
    this.edges = this.graph.edges.map((edge: NoteLinkGraphEdge): GraphEdge => ({
      source: edge.source, target: edge.target, reciprocal: pairs.has(edge.target + ':' + edge.source)
    }));
    this.orbit.reset(this.graph.nodes.length, time, recenter);
    this.selected = 0;
    this.previous = 0;
    this.highlightedAt = 0;
    this.focusAt = time;
    this.focusMs = recenter ? currentMotionProfile().disclosureMs : 0;
    this.selectionMs = currentMotionProfile().statusMs;
    this.measureLabels();
    this.schedule();
  }

  private schedule(): void {
    if (this.running || !this.ready || !this.visible || this.sync === null || this.canvasWidth < 1 || this.canvasHeight < 1) return;
    this.frameTime = Date.now();
    this.running = true;
    this.sync.start();
  }

  private stopFrames(): void {
    if (!this.running) return;
    this.running = false;
    this.sync?.stop();
  }

  private strength(index: number, t: number): number {
    return index === this.selected ? t : index === this.previous ? 1 - t : 0;
  }

  private frame(): void {
    if (!this.running) return;
    const time: number = Date.now();
    const elapsed: number = Math.max(0, Math.min(40, time - this.frameTime));
    this.frameTime = time;
    const moving: boolean = !this.active && !this.reducedMotion && this.orbit.step(time, elapsed);
    const focus: number = this.reducedMotion || this.focusMs === 0 ? 1 : ease((time - this.focusAt) / this.focusMs);
    const selection: number = this.reducedMotion || this.selectionMs === 0 ? 1 : ease((time - this.highlightedAt) / this.selectionMs);
    const ctx: CanvasRenderingContext2D = this.canvas;
    // Fill the frame with the same solid color as its native backing surface before drawing.
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.surface;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (this.graph.nodes.length > 0) {
      this.nodes = this.orbit.project(this.canvasWidth, this.canvasHeight, .88 + .12 * focus);
      for (const edge of this.edges) this.drawEdge(edge, selection);
      const depthOrder: OrbitNode[] = this.nodes.slice().sort((a: OrbitNode, b: OrbitNode): number => a.depth - b.depth);
      for (const node of depthOrder) {
        if (node.index !== 0) this.drawNode(node, this.strength(node.index, selection));
      }
      this.drawNode(this.nodes[0], this.strength(0, selection));
      this.drawLabels();
    }
    ctx.globalAlpha = 1;
    if (!moving && focus === 1 && selection === 1) this.stopFrames();
  }

  private drawEdge(edge: GraphEdge, selection: number): void {
    const a: OrbitNode = this.nodes[edge.source];
    const b: OrbitNode = this.nodes[edge.target];
    const length: number = Math.hypot(b.x - a.x, b.y - a.y);
    const clearance: number = length - a.radius - b.radius;
    if (clearance <= 5) return;
    const ux: number = (b.x - a.x) / length;
    const uy: number = (b.y - a.y) / length;
    const startX: number = a.x + a.radius * ux;
    const startY: number = a.y + a.radius * uy;
    const endX: number = b.x - (b.radius + 3) * ux;
    const endY: number = b.y - (b.radius + 3) * uy;
    const bend: number = edge.reciprocal ? Math.min(25, length * .21) : 0;
    const midX: number = (startX + endX) / 2 - uy * bend;
    const midY: number = (startY + endY) / 2 + ux * bend;
    const angle: number = Math.atan2(endY - midY, endX - midX);
    const emphasize: number = this.strength(edge.source || edge.target, selection);
    const arrow: number = 6 + emphasize * 2;
    const ctx: CanvasRenderingContext2D = this.canvas;
    ctx.globalAlpha = (.53 + .41 * emphasize) * Math.min(1, (clearance - 5) / 13);
    ctx.strokeStyle = emphasize > .01 ? this.accent : this.lineColor;
    ctx.lineWidth = 1.15 + .7 * emphasize;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.moveTo(endX - arrow * Math.cos(angle - .49), endY - arrow * Math.sin(angle - .49));
    ctx.lineTo(endX, endY);
    ctx.lineTo(endX - arrow * Math.cos(angle + .49), endY - arrow * Math.sin(angle + .49));
    ctx.stroke();
  }

  private drawNode(node: OrbitNode, emphasis: number): void {
    const ctx: CanvasRenderingContext2D = this.canvas;
    const main: boolean = node.index === 0;
    const missing: boolean = this.graph.nodes[node.index].noteId === 0;
    if (main || emphasis > .02) {
      ctx.globalAlpha = main ? .76 : emphasis * .85;
      ctx.fillStyle = this.selectedSurface;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = missing ? .46 : 1;
    ctx.fillStyle = main ? this.accent : this.surface;
    ctx.strokeStyle = main || emphasis > .02 ? this.accent : this.lineColor;
    ctx.lineWidth = main ? 1.5 : 1.25 + emphasis * .3;
    ctx.setLineDash(missing ? [3, 3] : []);
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (!main && !missing) {
      ctx.globalAlpha = .64 + .15 * node.depth;
      ctx.fillStyle = emphasis > .02 ? this.accent : this.lineColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * .27, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawLabels(): void {
    this.labels = [];
    const center: LabelHit | null = this.labelPosition(this.nodes[0], true);
    const selected: LabelHit | null = this.selected === 0 ? null : this.labelPosition(this.nodes[this.selected], true);
    for (const node of this.nodes) {
      if (node.index === 0 || node.index === this.selected || node.index >= 18) continue;
      const label: LabelHit | null = this.labelPosition(node, false);
      if (label === null) continue;
      const opacity: number = Math.min(this.labelClearance(label, center), this.labelClearance(label, selected));
      if (opacity > .04) this.drawLabel(label, false, opacity * .94);
    }
    if (center !== null) this.drawLabel(center, true, 1);
    if (selected !== null) {
      const opacity: number = this.labelClearance(selected, center);
      if (opacity > .04) this.drawLabel(selected, true, opacity);
    }
  }

  private labelClearance(label: LabelHit, important: LabelHit | null): number {
    if (important === null) return 1;
    const horizontal: number = Math.abs(label.x - important.x) - (label.width + important.width) / 2;
    const vertical: number = Math.abs(label.y - important.y) - 15;
    const marker: OrbitNode = this.nodes[important.index];
    const markerX: number = Math.abs(label.x - marker.x) - label.width / 2 - marker.radius - 5;
    const markerY: number = Math.abs(label.y + 7 - marker.y) - 7 - marker.radius - 5;
    const clearance: number = Math.min(Math.max(horizontal, vertical), Math.max(markerX, markerY));
    return Math.max(0, Math.min(1, (clearance + 1) / 10));
  }

  private measureLabels(): void {
    if (!this.ready) return;
    const ui: UIContext = this.getUIContext();
    this.labelFont = 'normal ' + ui.fp2px(13) + 'px sans-serif';
    this.emphasisFont = '500 ' + ui.fp2px(14) + 'px sans-serif';
    const ctx: CanvasRenderingContext2D = this.canvas;
    this.labelMetrics = [];
    for (let index: number = 0; index < this.graph.nodes.length; index++) {
      const name: string = this.graph.nodes[index].label;
      const text: string = name.length > 16 ? name.slice(0, 15) + '…' : name;
      ctx.font = this.labelFont;
      const normalWidth: number = ctx.measureText(text).width;
      ctx.font = this.emphasisFont;
      this.labelMetrics.push({ text, normalWidth, emphasisWidth: ctx.measureText(text).width });
    }
  }

  private labelPosition(node: OrbitNode, emphasis: boolean): LabelHit | null {
    const label: GraphLabel | undefined = this.labelMetrics[node.index];
    if (label === undefined || this.canvasWidth < 20) return null;
    const y: number = node.y + node.radius + 9;
    if (y < 0 || y + 17 > this.canvasHeight || node.x < -10 || node.x > this.canvasWidth + 10) return null;
    const width: number = Math.min(emphasis ? label.emphasisWidth : label.normalWidth, this.canvasWidth - 18);
    const x: number = Math.min(this.canvasWidth - width / 2 - 9, Math.max(width / 2 + 9, node.x));
    return { index: node.index, x, y, width };
  }

  private drawLabel(position: LabelHit, emphasis: boolean, opacity: number): void {
    const ctx: CanvasRenderingContext2D = this.canvas;
    const text: string = this.labelMetrics[position.index].text;
    this.labels.push(position);
    ctx.font = emphasis ? this.emphasisFont : this.labelFont;
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.surface;
    ctx.lineWidth = 3;
    ctx.strokeText(text, position.x, position.y, this.canvasWidth - 18);
    ctx.fillStyle = emphasis ? this.titleColor : this.lineColor;
    ctx.fillText(text, position.x, position.y, this.canvasWidth - 18);
  }

  private choose(x: number, y: number): void {
    const node: OrbitNode | undefined = this.nodes.filter((item: OrbitNode): boolean =>
      Math.hypot(item.x - x, item.y - y) <= Math.max(17, item.radius + 5))
      .sort((a: OrbitNode, b: OrbitNode): number => a.index === 0 ? -1 : b.index === 0 ? 1 : b.depth - a.depth)[0];
    const label: LabelHit | undefined = this.labels.slice().reverse().find((item: LabelHit): boolean =>
      Math.abs(item.x - x) <= item.width / 2 + 5 && y >= item.y - 3 && y <= item.y + 18);
    const index: number | undefined = node?.index ?? label?.index;
    this.orbit.paused = index !== undefined;
    this.orbit.stop();
    if ((index ?? 0) !== this.selected) {
      this.previous = this.selected;
      this.selected = index ?? 0;
      this.highlightedAt = Date.now();
      this.onSelect(this.selected);
    }
  }

  private touch(event: TouchEvent): void {
    event.stopPropagation();
    if (!this.interactive || this.graph.nodes.length === 0) return;
    const now: number = Date.now();
    const touches: TouchObject[] = event.touches.filter((item: TouchObject): boolean =>
      event.type !== TouchType.Up || !event.changedTouches.some((up: TouchObject): boolean => up.id === item.id));
    const contact: TouchObject | undefined = touches[0];
    const changed: TouchObject | undefined = event.changedTouches[0];
    if (event.type === TouchType.Cancel || (event.type === TouchType.Up && contact === undefined)) {
      if (this.active && this.tap !== null && changed !== undefined && event.type === TouchType.Up &&
        Math.hypot(changed.x - this.tap.x, changed.y - this.tap.y) < 7) this.choose(changed.x, changed.y);
      this.active = false;
      this.tap = null; this.pointer = null; this.pinchBase = null;
      this.orbit.release(now, this.reducedMotion || event.type === TouchType.Cancel);
    } else if (contact !== undefined) {
      const two: Pinch | null = pinch(touches);
      if (event.type === TouchType.Down) {
        if (!this.active) this.tap = { x: contact.x, y: contact.y };
        this.active = true;
        this.orbit.stop();
      }
      if (two !== null) {
        const before: Pinch | null = this.pinchBase;
        if (before !== null && before.distance > 0) {
          this.orbit.move(two.x - before.x, two.y - before.y, two.distance / before.distance, this.canvasWidth, this.canvasHeight);
        }
        this.tap = null;
        this.orbit.stop();
      } else if (event.type === TouchType.Move && this.pointer !== null && this.pinchBase === null) {
        const start: GraphTouch = this.tap ?? this.pointer;
        if (this.tap === null || Math.hypot(contact.x - start.x, contact.y - start.y) >= 5) {
          this.tap = null;
          this.orbit.rotate(contact.x - start.x, contact.y - start.y, now);
        }
      }
      this.pointer = { x: contact.x, y: contact.y };
      this.pinchBase = two;
    }
    this.schedule();
  }

  private zoomWithAxis(event: AxisEvent): void {
    if (!this.interactive || this.graph.nodes.length === 0 || event.action !== AxisAction.UPDATE) return;
    try {
      const offset: number = event.getVerticalAxisValue();
      const pinchScale: number = event.getPinchAxisScaleValue();
      const scale: number = pinchScale > 0 && pinchScale !== 1 ? pinchScale : Math.exp(-offset * .015);
      this.orbit.stop();
      this.orbit.move(0, 0, scale, this.canvasWidth, this.canvasHeight);
      this.orbit.release(Date.now(), true);
      this.schedule();
    } catch (error) { AppLog.warn('NoteLinkGraph', `Relationship graph scroll: ${error}`); }
  }

  build() {
    Canvas(this.canvas).width('100%').height('100%')
      .backgroundColor(appearanceElementColor(this.appearance, 'surface_card', $r('app.color.surface_card')))
      .accessibilityText($r('app.string.note_link_graph_title'))
      .onReady((): void => {
        this.ready = true;
        this.reducedMotion = prefersReducedMotion(this.getUIContext());
        this.measureLabels();
        this.updatePalette();
      })
      .onAreaChange((_old: Area, area: Area): void => {
        this.canvasWidth = Number(area.width); this.canvasHeight = Number(area.height);
        this.schedule();
      })
      .onVisibleAreaChange([0], (visible: boolean): void => {
        this.visible = visible;
        if (visible) this.schedule(); else this.stopFrames();
      })
      .onTouch((event: TouchEvent): void => { this.touch(event); })
      .onAxisEvent((event: AxisEvent): void => { this.zoomWithAxis(event); })
  }
}
