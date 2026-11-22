// SPDX-License-Identifier: AGPL-3.0-or-later
import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { AGENT_VOICE_BYTES, agentVoiceWav } from '../../model/agent/DeepSeekMedia';

export class AgentVoiceCapture {
  private active: audio.AudioCapturer | null = null;
  private generation: number = 0;
  private pcm: Uint8Array = new Uint8Array(0);
  private length: number = 0;

  /** @throws {Error} Permission denial and microphone initialization failure reach the composer. */
  async start(context: common.UIAbilityContext): Promise<boolean> {
    const generation = ++this.generation;
    const permission = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(context, ['ohos.permission.MICROPHONE']);
    if (generation !== this.generation) return false;
    if (permission.authResults[0] !== 0) throw new Error('agent_voice_permission');
    const options: audio.AudioCapturerOptions = {
      streamInfo: { samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000, channels: audio.AudioChannel.CHANNEL_1,
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE, encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW },
      capturerInfo: { source: audio.SourceType.SOURCE_TYPE_MIC, capturerFlags: 0 }
    };
    const capturer = await audio.createAudioCapturer(options);
    try {
      if (generation !== this.generation) return false;
      this.pcm = new Uint8Array(AGENT_VOICE_BYTES);
      this.length = 0;
      capturer.on('readData', (buffer: ArrayBuffer): void => {
        if (generation !== this.generation) return;
        const accepted = Math.min(buffer.byteLength, this.pcm.length - this.length);
        this.pcm.set(new Uint8Array(buffer, 0, accepted), this.length);
        this.length += accepted;
      });
      await capturer.start();
      if (generation !== this.generation) return false;
      this.active = capturer;
      return true;
    } finally {
      if (this.active !== capturer) await capturer.release();
    }
  }

  /** @throws {Error} Stopping finalizes the PCM data before making the WAV. */
  async finish(): Promise<ArrayBuffer> {
    const capturer = this.active;
    if (capturer === null) throw new Error('agent_voice_empty');
    this.active = null;
    ++this.generation;
    const pcm = this.pcm.subarray(0, this.length - this.length % 2);
    this.pcm = new Uint8Array(0);
    try {
      await capturer.stop();
      return agentVoiceWav(pcm);
    } finally {
      await capturer.release();
    }
  }

  async cancel(): Promise<void> {
    ++this.generation;
    const capturer = this.active;
    this.active = null;
    this.pcm = new Uint8Array(0);
    if (capturer !== null) await capturer.release();
  }
}
