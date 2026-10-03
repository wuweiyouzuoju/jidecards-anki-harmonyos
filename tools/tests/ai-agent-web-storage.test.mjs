// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
const stub=`export class BusinessError extends Error{}
export const state={values:new Map(),queryError:0,removeError:0};
const alias=m=>new TextDecoder().decode(m.get('ALIAS'));
export const asset={Tag:{ALIAS:'ALIAS',SECRET:'SECRET',RETURN_TYPE:'RETURN_TYPE',RETURN_LIMIT:'RETURN_LIMIT',ACCESSIBILITY:'ACCESSIBILITY'},
ReturnType:{ALL:1},Accessibility:{DEVICE_FIRST_UNLOCKED:1},
async query(m){if(state.queryError)throw {code:state.queryError};const v=state.values.get(alias(m));return v?[new Map([['SECRET',v]])]:[];},
async add(m){state.values.set(alias(m),m.get('SECRET'));},async update(m,v){state.values.set(alias(m),v.get('SECRET'));},
async remove(m){if(state.removeError)throw {code:state.removeError};state.values.delete(alias(m));}};`;
const url='data:text/javascript;base64,'+Buffer.from(stub).toString('base64');
register('data:text/javascript;base64,'+Buffer.from(`export function resolve(s,c,n){if(s==='@kit.AssetStoreKit'||s==='@kit.BasicServicesKit')return {url:${JSON.stringify(url)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const {state}=await import(url);
const {loadAgentSecret,saveAgentSecret,loadAgentSearchSecret,saveAgentSearchSecret}=await import('../../entry/src/main/ets/backend/agent/AgentSecretStore.ets');
test('search credentials preserve provider aliases and remain independently replaceable and removable',async()=>{
  await saveAgentSecret('deepseek','model-key');await saveAgentSearchSecret('search-key');
  assert.equal(await loadAgentSecret('deepseek'),'model-key');assert.equal(await loadAgentSearchSecret(),'search-key');
  await saveAgentSearchSecret('brave-key','brave');
  assert.deepEqual([...state.values.keys()],['jidecards.ai.provider.deepseek','jidecards.ai.provider.web.doubao','jidecards.ai.provider.web.brave']);
  await saveAgentSearchSecret('replacement');assert.equal(await loadAgentSearchSecret(),'replacement');
  await saveAgentSearchSecret('');assert.equal(await loadAgentSearchSecret(),'');assert.equal(await loadAgentSecret('deepseek'),'model-key');
  assert.equal(await loadAgentSearchSecret('brave'),'brave-key');
});
test('search credential IO failures are observable and a failed removal cannot report success',async()=>{
  await saveAgentSearchSecret('keep');
  state.queryError=24000001;
  await assert.rejects(loadAgentSearchSecret,/agent_secret_unavailable/);
  await assert.rejects(()=>saveAgentSearchSecret('replace'),/agent_secret_unavailable/);
  state.queryError=0;state.removeError=24000001;
  await assert.rejects(()=>saveAgentSearchSecret(''),/agent_secret_unavailable/);
  state.removeError=0;assert.equal(await loadAgentSearchSecret(),'keep');
  state.queryError=24000002;assert.equal(await loadAgentSearchSecret(),'');state.queryError=0;
});
