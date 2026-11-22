// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { 从图库选取图片 } from '../utils/文件导入助手';
import { PROFILE_AVATAR_BYTES, PROFILE_AVATAR_PREFIX } from '../model/AccountProfile';

/** @throws {Error} 图片读取或压缩失败时保留现有头像。 */
export async function chooseProfileAvatar(context: common.UIAbilityContext): Promise<string | null> {
  const uri: string | null = await 从图库选取图片(context);
  if (uri === null) return null;
  const file: fs.File = fs.openSync(uri, fs.OpenMode.READ_ONLY);
  try {
    return await encodeProfileAvatar(image.createImageSource(file.fd));
  } finally { fs.closeSync(file); }
}

/** @throws {Error} 仅下载华为授权结果返回的 HTTPS 头像，并重新编码为本应用缩略图。 */
export async function downloadProfileAvatar(uri: string): Promise<string> {
  if (!uri.startsWith('https://')) throw new Error('invalid_profile_avatar');
  const request: http.HttpRequest = http.createHttp();
  try {
    const limit: number = 2 * 1024 * 1024;
    const response: http.HttpResponse = await request.request(uri, { method: http.RequestMethod.GET,
      maxLimit: limit, connectTimeout: 8000, readTimeout: 10000, expectDataType: http.HttpDataType.ARRAY_BUFFER });
    if (response.responseCode !== 200 || !(response.result instanceof ArrayBuffer) ||
      response.result.byteLength === 0 || response.result.byteLength > limit) throw new Error('invalid_profile_avatar');
    return await encodeProfileAvatar(image.createImageSource(response.result));
  } finally { request.destroy(); }
}

/** @throws {Error} 解码或压缩失败，或压到最低质量仍超出大小上限时由选择/下载入口上抛。 */
async function encodeProfileAvatar(source: image.ImageSource): Promise<string> {
  try {
    const info: image.ImageInfo = await source.getImageInfo();
    const scale: number = Math.min(1, 144 / Math.max(info.size.width, info.size.height));
    const size: image.Size = {
      width: Math.max(1, Math.round(info.size.width * scale)),
      height: Math.max(1, Math.round(info.size.height * scale))
    };
    const pixels: image.PixelMap = await source.createPixelMap({ desiredSize: size });
    try {
      const packer: image.ImagePacker = image.createImagePacker();
      try {
        for (const quality of [82, 65, 45, 25]) {
          const bytes: ArrayBuffer = await packer.packToData(pixels, { format: 'image/jpeg', quality: quality });
          if (bytes.byteLength <= PROFILE_AVATAR_BYTES) {
            return PROFILE_AVATAR_PREFIX + new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes));
          }
        }
        throw new Error('invalid_profile_avatar');
      } finally { await packer.release(); }
    } finally { await pixels.release(); }
  } finally { await source.release(); }
}
