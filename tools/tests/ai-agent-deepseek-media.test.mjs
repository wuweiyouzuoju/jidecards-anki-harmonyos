// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../../entry/src/main/ets/model/agent/DeepSeekMedia.ts';
import { AgentDocumentAccess } from '../../entry/src/main/ets/model/agent/AgentDocuments.ts';
import { agentInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

test('DeepSeek media sends valid multipart PCM and page JPEG; partial OCR remains marked', async () => {
  const calls=[];let destroyed=0;
  const wav=model.agentVoiceWav(Uint8Array.from([1,2,3,4]));
  const reader=new DataView(wav);
  assert.equal(reader.getUint32(24,true),16000);
  assert.equal(reader.getUint16(34,true),16);
  assert.equal(reader.getUint16(22,true),1);
  assert.deepEqual(Array.from(new Uint8Array(wav,44)),[1,2,3,4]);
  const Service=loadPlatformModule('backend/agent/DeepSeekMediaService.ets','DeepSeekMediaService',{
    ...model,http:{RequestMethod:{POST:'POST'},HttpDataType:{ARRAY_BUFFER:'bytes',STRING:'string'},createHttp:()=>({
      destroy(){destroyed++;},async request(url,opts){calls.push({url,opts});return {responseCode:200,result:
        url.endsWith('/asr')?'{"text":" transcribed "}':url.endsWith('/tts')?wav:
          '\n{"page_count":1,"pages":[{"index":0,"text":"<｜ref｜>Title<｜/ref｜><｜box｜>[[0,0,9,9]]<｜/box｜>","finish_reason":"length"}]}'};}
    })}
  });
  const service=new Service();
  assert.equal(await service.transcribe('key',wav),'transcribed');
  assert.deepEqual(await service.recognize('key',new ArrayBuffer(9)),{text:'Title',truncated:true});
  assert.equal(await service.speak('key','**Read me**'),wav);
  assert.equal(calls[0].opts.multiFormDataList[0].remoteFileName,'speech.wav');
  assert.deepEqual(calls[1].opts.multiFormDataList.map(p=>p.name),['purpose','file']);
  assert.deepEqual(JSON.parse(calls[2].opts.extraData),{text:'**Read me**',format:'wav',filter_markdown:true});
  assert.ok(calls.every(({opts})=>opts.header.Authorization==='Bearer key'));
  assert.equal(destroyed,3);
  assert.throws(()=>model.deepSeekOcrPage('{"error":{"code":"timeout"}}'),/deepseek_ocr_failed/);
});

test('cloud OCR uses the normal authorized document scope and local OCR stays the default', async () => {
  const modes=[];
  const access=new AgentDocumentAccess({
    list:()=>[{id:'pdf',name:'scan.pdf',pageCount:2}],saveNotes(){},
    async read(conversation,id,page,mode){modes.push([conversation,id,page,mode]);return {
      documentId:id,page,text:'source text',notes:'',method:mode,warning:''
    };}
  });
  access.bind('conversation',false);
  const args='{"documentId":"pdf","page":2}';
  await assert.rejects(access.execute('ocr_document_page',args),/document_not_in_session/);
  access.submit(['pdf']);
  await access.execute('ocr_document_page',args);
  assert.equal(model.deepSeekOcrRequested('请用 DeepSeek OCR识别附件'),true);
  assert.equal(model.deepSeekOcrRequested('不要使用 DeepSeek OCR'),false);
  access.setDeepSeekOcr(true);
  const result=await access.execute('ocr_document_page',args);
  assert.equal(JSON.parse(result.outputJson).method,'deepseek_ocr');
  assert.deepEqual(modes,[['conversation','pdf',2,'ocr'],['conversation','pdf',2,'deepseek_ocr']]);
});

test('voice capture checks permission and releases the microphone on finish or cancellation', async () => {
  let granted=false, opened=0, released=0, read;
  const capturer={on(name,callback){assert.equal(name,'readData');read=callback;},
    async start(){read(Uint8Array.from([4,3,2,1]).buffer);},async stop(){},async release(){released++;}};
  const Capture=loadPlatformModule('backend/agent/AgentVoiceCapture.ets','AgentVoiceCapture',{
    ...model,abilityAccessCtrl:{createAtManager:()=>({async requestPermissionsFromUser(_context,permissions){
      assert.deepEqual(permissions,['ohos.permission.MICROPHONE']);return {authResults:[granted?0:-1]};
    }})},audio:{AudioSamplingRate:{SAMPLE_RATE_16000:16000},AudioChannel:{CHANNEL_1:1},
      AudioSampleFormat:{SAMPLE_FORMAT_S16LE:1},AudioEncodingType:{ENCODING_TYPE_RAW:0},SourceType:{SOURCE_TYPE_MIC:0},
      async createAudioCapturer(){opened++;return capturer;}}
  });
  const capture=new Capture();
  await assert.rejects(capture.start({}),/agent_voice_permission/);assert.equal(opened,0);
  granted=true;
  assert.equal(await capture.start({}),true);
  const recording=await capture.finish();assert.equal(released,1);
  assert.deepEqual(Array.from(new Uint8Array(recording,44)),[4,3,2,1]);
  assert.equal(await capture.start({}),true);
  await capture.cancel();assert.equal(released,2);
  read(Uint8Array.from([8,9]).buffer);
  await assert.rejects(capture.finish(),/agent_voice_empty/);
});

test('DeepSeek transcription preserves the HTTP reason without exposing provider response content', async () => {
  const Service = loadPlatformModule('backend/agent/DeepSeekMediaService.ets', 'DeepSeekMediaService', {
    ...model,
    http: { RequestMethod: {POST: 'POST'}, HttpDataType: {STRING: 'string'}, createHttp: () => ({
      destroy() {},
      async request() { return {responseCode: 401, result: 'private server details'}; }
    }) }
  });
  await assert.rejects(new Service().transcribe('invalid-key', new ArrayBuffer(48)), error => {
    assert.equal(error.message, 'deepseek_media_http_401');
    assert.equal(model.agentVoiceFailure(error.message), 'credential');
    return true;
  });
  assert.equal(model.agentVoiceFailure('agent_voice_empty'), 'empty');
  assert.equal(model.agentVoiceFailure('deepseek_media_http_402'), 'balance');
  assert.equal(model.agentVoiceFailure('deepseek_media_http_503'), 'busy');
  assert.equal(model.agentVoiceFailure('deepseek_media_http_504'), 'timeout');
});

test('the composer exposes voice only for the selected DeepSeek configuration with an available saved key', async () => {
  const settings = { selectedProvider: 'deepseek', deepseekModel: 'deepseek-flash',
    openaiModel: 'gpt-test', customBaseUrl: 'https://example.test', customModel: 'custom' };
  let selected = 'deepseek';
  let secret = '';
  let readFailure = false;
  const reads = [];
  const defaults = () => ({ ...settings });
  const { isAgentProviderConfigured } = loadPlatformModule('backend/agent/AgentSettingsStore.ets',
    '{isAgentProviderConfigured}', {});
  const Page = loadComponentLogic('pages/AI制卡页.ets', 'AI制卡页', {
    defaultAgentSettings: defaults,
    DEEPSEEK_PROVIDER: { baseUrl: 'https://api.deepseek.com' },
    OPENAI_PROVIDER: { baseUrl: 'https://api.openai.com' },
    isAgentProviderConfigured,
    loadAgentSettings: async strict => {
      assert.equal(strict, true);
      if (readFailure) throw new Error('agent_settings_unavailable');
      return { ...settings, selectedProvider: selected };
    },
    loadAgentSecret: async provider => { reads.push(provider); return secret; }
  });
  const page = Object.assign(Object.create(Page.prototype), { pageDisposed: false, voiceState: '', speechMessageId: -1 });
  for (const [provider, key, visible] of [
    ['deepseek', '', false], ['deepseek', '  ', false], ['deepseek', 'test-deepseek-key', true],
    ['custom', 'test-custom-key', false], ['openai', 'test-openai-key', false], ['deepseek', 'test-deepseek-key', true]
  ]) {
    selected = provider; secret = key;
    await page.loadProviderConfiguration();
    assert.equal(page.deepSeekMediaReady, visible);
    const controls = agentInterfaceControls({history:false, voiceAvailable:page.deepSeekMediaReady});
    assert.equal(controls.some(control => control.id === 'voice'), visible);
  }
  readFailure = true;
  await page.loadProviderConfiguration();
  assert.equal(page.deepSeekMediaReady, false);
  assert.equal(page.AI配置.apiKey, '');
  assert.equal(reads.length, 6, 'failed settings reads must not fall back to an old DeepSeek credential');
});

test('DeepSeek speech excludes external tool receipts and local summaries, including after history restore', async () => {
  const {createAgentMessage, agentReplySpeechText, projectAgentHistory, restoreAgentMessages} =
    await import('../../entry/src/main/ets/model/agent/AgentConversationView.ts');
  const receipt = createAgentMessage(1, 'ai', '外部 Agent · list_decks', false);
  const {createStartedAgentToolTrace} = await import('../../entry/src/main/ets/model/agent/AgentToolDiagnostics.ts');
  const trace = id => createStartedAgentToolTrace({id, name:'list_decks', argumentsJson:'{}'}, 0, 1);
  receipt.工具过程.push(trace('external-123-1'));
  const summary = createAgentMessage(2, 'ai', '已生成 5 张卡片', false);
  summary.providerText = '';
  const reply = createAgentMessage(3, 'ai', '找到了 5 个牌组', false);
  reply.工具过程.push(trace('model-1'));
  const messages = [receipt, summary, reply];
  assert.deepEqual(messages.map(agentReplySpeechText), ['', '', '找到了 5 个牌组']);
  let id = 0;
  const restored = restoreAgentMessages(projectAgentHistory(messages, ''), () => ++id, '旧工具记录', false);
  assert.deepEqual(restored.map(agentReplySpeechText), ['', '', '找到了 5 个牌组']);
  reply.streaming = true;
  assert.equal(agentReplySpeechText(reply), '');
});
