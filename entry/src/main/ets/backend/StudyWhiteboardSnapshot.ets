// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { UIContext } from '@kit.ArkUI';
import { fileIo, picker } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';

/**
 * 截取合成窗口，因为卡面和笔迹分别位于不同的渲染层。
 * @throws {Error} 截图、裁剪或保存失败由学习白板显示错误。
 */
export async function saveStudyWhiteboardSnapshot(ui: UIContext, area: Area): Promise<boolean> {
  const context = ui.getHostContext() as common.UIAbilityContext;
  const host = context.windowStage.getMainWindowSync();
  const x = Number(area.globalPosition.x);
  const y = Number(area.globalPosition.y);
  const left = Math.max(0, Math.ceil(ui.vp2px(x)));
  const top = Math.max(0, Math.ceil(ui.vp2px(y)));
  const right = Math.floor(ui.vp2px(x + Number(area.width)));
  const bottom = Math.floor(ui.vp2px(y + Number(area.height)));
  const pixels = await host.snapshot();
  try {
    const info = pixels.getImageInfoSync();
    const width = Math.min(right, info.size.width) - left;
    const height = Math.min(bottom, info.size.height) - top;
    if (!(width > 0 && height > 0)) throw new Error('invalid whiteboard screenshot area');
    await pixels.crop({ x: left, y: top, size: { width, height } });
    const options = new picker.DocumentSaveOptions();
    options.newFileNames = ['jidecards-' + Date.now() + '.png'];
    options.fileSuffixChoices = ['.png'];
    const targets = await new picker.DocumentViewPicker(context).save(options);
    if (targets.length === 0) return false;
    const packer = image.createImagePacker();
    try {
      const data = await packer.packToData(pixels, { format: 'image/png', quality: 100 });
      const file = await fileIo.open(targets[0], fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try {
        const written = await fileIo.write(file.fd, data);
        if (written !== data.byteLength) throw new Error('incomplete whiteboard screenshot write');
      } finally { await fileIo.close(file); }
    } finally { await packer.release(); }
    return true;
  } finally { await pixels.release(); }
}
