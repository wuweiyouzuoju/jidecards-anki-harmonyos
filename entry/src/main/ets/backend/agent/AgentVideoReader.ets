// SPDX-License-Identifier: AGPL-3.0-or-later
import { media } from '@kit.MediaKit';
import { image } from '@kit.ImageKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { AgentVideoInfo } from '../../model/agent/AgentVideo';

/** 每个媒体实例独占文件描述符；关闭前先释放媒体实例。 */
export class AgentVideoReader {
  /** @throws {Error} 解码/元数据失败真实上抛，不能当作空视频。 */
  async info(path: string): Promise<AgentVideoInfo> {
    const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
    let extractor: media.AVMetadataExtractor | null = null;
    try {
      extractor = await media.createAVMetadataExtractor();
      extractor.fdSrc = { fd: file.fd, offset: 0, length: fs.statSync(file.fd).size };
      const metadata: media.AVMetadata = await extractor.fetchMetadata();
      const result: AgentVideoInfo = { durationSeconds: Number(metadata.duration) / 1000,
        width: Number(metadata.videoWidth), height: Number(metadata.videoHeight) };
      const rotation: number = Number(metadata.videoOrientation ?? '0');
      if (Number.isFinite(rotation) && Math.abs(rotation % 180) === 90) {
        const width: number = result.width; result.width = result.height; result.height = width;
      }
      if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0 ||
        !Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width <= 0 || result.height <= 0) {
        throw new Error('video_metadata_invalid');
      }
      return result;
    } finally {
      if (extractor !== null) { try { await extractor.release(); } catch (error) { } }
      fs.closeSync(file);
    }
  }
  /** @throws {Error} 取帧失败真实上抛；返回最近关键帧，不保证逐帧精确时间。 */
  async frame(path: string, seconds: number, info: AgentVideoInfo): Promise<image.PixelMap> {
    const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
    let generator: media.AVImageGenerator | null = null;
    try {
      generator = await media.createAVImageGenerator();
      generator.fdSrc = { fd: file.fd, offset: 0, length: fs.statSync(file.fd).size };
      const scale: number = Math.min(1, 1600 / Math.max(info.width, info.height));
      return await generator.fetchFrameByTime(Math.round(seconds * 1000000),
        media.AVImageQueryOptions.AV_IMAGE_QUERY_CLOSEST_SYNC,
        { width: Math.max(1, Math.round(info.width * scale)), height: Math.max(1, Math.round(info.height * scale)) });
    } finally {
      if (generator !== null) { try { await generator.release(); } catch (error) { } }
      fs.closeSync(file);
    }
  }
}
