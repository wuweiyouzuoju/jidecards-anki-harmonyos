// SPDX-License-Identifier: AGPL-3.0-or-later
export interface DialogSurfaceSize {
  id: number;
  widthPercent: number;
  maximumWidth: number;
}

/** 当前已挂载遮罩的尺寸栈；只管理展示，不拥有业务显隐或关闭权限。 */
export class DialogHierarchy {
  private nextId: number = 0;
  private surfaces: DialogSurfaceSize[] = [];

  enter(widthPercent: number, maximumWidth: number): DialogSurfaceSize {
    const parent: DialogSurfaceSize | undefined = this.surfaces[this.surfaces.length - 1];
    const size: DialogSurfaceSize = {
      id: ++this.nextId,
      widthPercent: parent === undefined ? widthPercent : Math.min(widthPercent, Math.max(64, parent.widthPercent - 8)),
      maximumWidth: parent === undefined ? maximumWidth : Math.min(maximumWidth, Math.max(280, parent.maximumWidth - 48))
    };
    this.surfaces.push(size);
    return size;
  }

  leave(id: number): void {
    this.surfaces = this.surfaces.filter((surface: DialogSurfaceSize): boolean => surface.id !== id);
  }
}

// 原生自定义窗口与页面内弹层共用同一展示栈，不能各自从一级重新计数。
export const dialogHierarchy: DialogHierarchy = new DialogHierarchy();
