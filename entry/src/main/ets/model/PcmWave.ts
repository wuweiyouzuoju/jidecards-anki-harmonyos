// SPDX-License-Identifier: AGPL-3.0-or-later

export function pcm16Wav(pcm: Uint8Array, sampleRate: number, channels: number): ArrayBuffer {
  const frameSize = channels * 2;
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 192000 ||
    !Number.isInteger(channels) || channels < 1 || channels > 2 ||
    pcm.length === 0 || pcm.length % frameSize !== 0) throw new Error('Invalid PCM format');
  const wav = new ArrayBuffer(44 + pcm.length);
  const header = new DataView(wav);
  header.setUint32(0, 0x52494646); // RIFF
  header.setUint32(4, 36 + pcm.length, true);
  header.setUint32(8, 0x57415645); // WAVE
  header.setUint32(12, 0x666d7420); // fmt
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * frameSize, true);
  header.setUint16(32, frameSize, true);
  header.setUint16(34, 16, true);
  header.setUint32(36, 0x64617461); // data
  header.setUint32(40, pcm.length, true);
  new Uint8Array(wav, 44).set(pcm);
  return wav;
}
