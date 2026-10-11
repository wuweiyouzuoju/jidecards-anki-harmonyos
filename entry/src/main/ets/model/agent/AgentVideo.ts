// SPDX-License-Identifier: AGPL-3.0-or-later
export interface AgentVideoInfo { durationSeconds: number; width: number; height: number; }
export interface AgentVideoArguments {
  timestampsSeconds?: number[];
  startSeconds?: number;
  endSeconds?: number;
  frameCount?: number;
}
export const MAX_AGENT_VIDEO_FRAMES: number = 4;

/** 分批取帧保留时间位置；采样画面不代表完整视频或声音已被读取。 */
export function agentVideoFrameTimes(info: AgentVideoInfo, args: AgentVideoArguments): number[] {
  if (!Number.isFinite(info.durationSeconds) || info.durationSeconds <= 0) throw new Error('video_metadata_invalid');
  if (args.timestampsSeconds !== undefined) {
    if (!Array.isArray(args.timestampsSeconds) || args.timestampsSeconds.length < 1 ||
      args.timestampsSeconds.length > MAX_AGENT_VIDEO_FRAMES || args.startSeconds !== undefined ||
      args.endSeconds !== undefined || args.frameCount !== undefined) throw new Error('video_arguments_invalid');
    for (const time of args.timestampsSeconds) {
      if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time >= info.durationSeconds) {
        throw new Error('video_timestamp_out_of_range');
      }
    }
    return args.timestampsSeconds.slice();
  }
  const start: number = args.startSeconds ?? 0;
  const end: number = args.endSeconds ?? info.durationSeconds;
  const count: number = args.frameCount ?? MAX_AGENT_VIDEO_FRAMES;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || end > info.durationSeconds ||
    !Number.isSafeInteger(count) || count < 1 || count > MAX_AGENT_VIDEO_FRAMES) throw new Error('video_arguments_invalid');
  const times: number[] = [];
  for (let index: number = 0; index < count; index++) times.push(start + (end - start) * index / count);
  return times;
}
