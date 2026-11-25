// SPDX-License-Identifier: AGPL-3.0-or-later
/** 文件名只用于展示；文件读取始终使用选择器授予的原始 URI。 */
export function transferFileName(uri: string): string {
  const path = uri.split('?')[0].split('#')[0];
  const name = path.substring(path.lastIndexOf('/') + 1);
  try { return decodeURIComponent(name); } catch (_error) { return name; }
}

export function transferExportName(name: string, extension: string): string {
  if (!/^\.[a-zA-Z0-9.]+$/.test(extension)) throw new Error('Invalid transfer extension');
  const stem = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 64);
  return (stem === '' || /^\.+$/.test(stem) ? 'export' : stem) + extension;
}

/** 产品拥有取消状态与进度展示，基础库只在真实复制边界调用。 */
export interface FileTransferObserver {
  check(): void;
  progress(processed: number, total: number): void;
}
