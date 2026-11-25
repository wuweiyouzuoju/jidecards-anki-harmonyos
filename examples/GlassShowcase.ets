// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedAnchoredMenu, SharedActionMenuList, SharedMenuTheme, sharedMenuTheme,
  SharedMenuScope, SharedToolbarMenuBounds, warmSharedGlassSource } from 'jide_foundation';

@Entry
@Component
struct GlassShowcase {
  @State private opened: boolean = false;
  @State private chosen: string = '';
  @State private bounds: SharedToolbarMenuBounds = { left: 16, top: 76, width: 360 };
  private scope: SharedMenuScope = { id: 1, clip: null, offset: 0, scroll: (_delta: number): void => {} };
  private captureAllowed: () => boolean = (): boolean => true;
  private theme(): SharedMenuTheme {
    const theme: SharedMenuTheme = sharedMenuTheme();
    theme.material = 'glass'; theme.supported = true; theme.panelOpacity = 0;
    return theme;
  }
  aboutToDisappear(): void {
    warmSharedGlassSource(this.getUIContext(), 'glass-example-source', false, this.captureAllowed);
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column({ space: 24 }) {
        Row() {
          Button('更多').onClick((): void => { this.opened = !this.opened; })
          Blank()
        }.width('100%').height(44).onAreaChange((_old: Area, area: Area): void => {
          this.bounds = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y) + Number(area.height) + 8,
            width: Number(area.width) };
        })
        Text('记得系列玻璃').fontSize(36)
        Divider().color('#2F5FD0').strokeWidth(4)
        Text('真实背景 · 连续折射').fontSize(28)
        Text(this.chosen).fontSize(20)
      }.padding(16).width('100%').height('100%').backgroundColor('#E9EEF7').id('glass-example-source')
        .onVisibleAreaChange([0, 1], (visible: boolean): void => {
          warmSharedGlassSource(this.getUIContext(), 'glass-example-source', visible, this.captureAllowed);
        })
      if (this.opened) {
        SharedAnchoredMenu({ theme: this.theme(), toolbarBounds: this.bounds, menuWidth: 120, alignEnd: false,
          refractionSource: 'glass-example-source', captureAllowed: this.captureAllowed, slideScope: this.scope,
          onClose: (): void => { this.opened = false; }, content: (): void => {
            SharedActionMenuList({ theme: this.theme(), slideScope: this.scope,
              items: [{ id: 'settings', label: '设置' }, { id: 'stats', label: '统计' }],
              onSelect: (id: string): void => { this.chosen = id; this.opened = false; } })
          } })
      }
    }.width('100%').height('100%')
  }
}
