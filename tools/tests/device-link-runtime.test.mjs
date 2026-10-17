// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadPlatformModule, loadComponentLogic, NativeDialogHost, nativeDialogHostClass } from './platform-module-harness.mjs';
import { surfaceMotionApi } from './motion-harness.mjs';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import * as pairing from '../../entry/src/main/ets/model/device-link/DevicePairing.ts';
import * as wire from '../../entry/src/main/ets/model/device-link/LanWire.ts';
import * as progress from '../../entry/src/main/ets/model/device-link/ProgressSync.ts';
import * as collection from '../../entry/src/main/ets/model/device-link/CollectionSync.ts';

class SettingsScroller { edges=[]; scrollEdge(edge) { this.edges.push(edge); } }
const ExpansionReveal=loadPlatformModule('utils/ExpansionReveal.ets','ExpansionReveal',{
  Scroller:SettingsScroller,Edge:{Bottom:'bottom'}
});
const settingsClass=(dependencies={})=>loadComponentLogic('components/settings/DeviceLinkSettings.ets','DeviceLinkSettings',{
  Scroller:SettingsScroller,ExpansionReveal,NativeDialogHost,visibleInterfaceItems,...dependencies
});

const util = {
  TextEncoder: class { encodeInto(value) { return new TextEncoder().encode(value); } },
  TextDecoder: { create: () => ({ decodeToString: data => new TextDecoder('utf-8', { fatal: true }).decode(data) }) },
  Base64Helper: class {
    encodeToStringSync(data) { return Buffer.from(data).toString('base64'); }
    decodeSync(data) { return new Uint8Array(Buffer.from(data, 'base64')); }
  }
};
const cryptoFramework = {
  CryptoMode: { ENCRYPT_MODE: 1, DECRYPT_MODE: 2 },
  createRandom: () => ({ generateRandom: async size => ({ data: new Uint8Array(randomBytes(size)) }) }),
  createSymKeyGenerator: () => ({ convertKey: async blob => ({ bytes: blob.data }) }),
  createCipher: () => {
    let cipher, encrypt;
    return {
      async init(mode, key, params) {
        encrypt = mode === 1;
        cipher = encrypt ? createCipheriv('aes-256-gcm', key.bytes, params.iv.data)
          : createDecipheriv('aes-256-gcm', key.bytes, params.iv.data);
        cipher.setAAD(params.aad.data);
        if (!encrypt) cipher.setAuthTag(params.authTag.data);
      },
      async update(blob) { return { data: new Uint8Array(cipher.update(blob.data)) }; },
      async doFinal() {
        cipher.final();
        return encrypt ? { data: new Uint8Array(cipher.getAuthTag()) } : null;
      }
    };
  }
};

function nativeConnection(raw) {
  return {
    on(type, callback) {
      if (type === 'message') raw.on('data', data => callback({ message: Uint8Array.from(data).buffer }));
      else raw.on(type, callback);
    },
    async send({ data }) { await new Promise((resolve, reject) => raw.write(Buffer.from(data), error => error ? reject(error) : resolve())); },
    async close() { raw.destroy(); }
  };
}

function runtime() {
  const stores = new Map();
  const services = new Map();
  const discoveries = new Set();
  const preferences = { async getPreferences(context) {
    if (!stores.has(context.id)) stores.set(context.id, new Map());
    const values = stores.get(context.id);
    return {
      async get(key, fallback) { return values.get(key) ?? fallback; },
      async put(key, value) { values.set(key, value); }, async delete(key) { values.delete(key); }, async flush() {}
    };
  } };
  const socket = {
    constructTCPSocketInstance() {
      const raw = new net.Socket();
      return { ...nativeConnection(raw), async bind() {},
        async connect({ address }) {
          await new Promise((resolve, reject) => {
            raw.once('error', reject);
            raw.connect(address.port, address.address, () => { raw.removeListener('error', reject); resolve(); });
          });
        }
      };
    },
    constructTCPSocketServerInstance() {
      let connected;
      const clients = new Set();
      const server = net.createServer(raw => {
        clients.add(raw); raw.once('close', () => clients.delete(raw)); connected(nativeConnection(raw));
      });
      return {
        on(type, callback) { if (type === 'connect') connected = callback; else server.on(type, callback); },
        async listen() { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); },
        async getLocalAddress() { return { address: '127.0.0.1', family: 1, port: server.address().port }; },
        async close() {
          for (const client of clients) client.destroy();
          await new Promise(resolve => server.close(resolve));
        }
      };
    }
  };
  const mdns = {
    async addLocalService(_context, service) {
      const value = { ...service, host: { address: '127.0.0.1' } }; services.set(service.serviceName, value);
      for (const discovery of discoveries) queueMicrotask(() => discovery.found?.(value));
      return value;
    },
    async removeLocalService(_context, service) {
      services.delete(service.serviceName);
      for (const discovery of discoveries) discovery.lost?.(service);
    },
    async resolveLocalService(_context, service) {
      const resolved = services.get(service.serviceName);
      if (!resolved) throw new Error('offline');
      return resolved;
    },
    createDiscoveryService() {
      const entry = {};
      return { on(type, callback) { entry[type === 'serviceFound' ? 'found' : 'lost'] = callback; },
        startSearchingMDNS() {
          discoveries.add(entry); for (const service of services.values()) queueMicrotask(() => entry.found?.(service));
        },
        stopSearchingMDNS() { discoveries.delete(entry); }
      };
    }
  };
  const dependencies = { ...pairing, ...wire, ...progress, ...collection, util, cryptoFramework, preferences, socket, mdns,
    deviceInfo: { marketName: 'Test device', deviceType: 'phone' } };
  const { LanCrypto, linkRandom } = loadPlatformModule('backend/device-link/LanCrypto.ets', '{ LanCrypto, linkRandom }', dependencies);
  const DevicePairingStore = loadPlatformModule('backend/device-link/DevicePairingStore.ets', 'DevicePairingStore', dependencies);
  const LanChannel = loadPlatformModule('backend/device-link/LanChannel.ets', 'LanChannel', dependencies);
  const { DeviceLinkService } = loadPlatformModule('backend/device-link/DeviceLinkService.ets', '{ DeviceLinkService }',
    { ...dependencies, LanCrypto, linkRandom, DevicePairingStore, LanChannel });
  return { DeviceLinkService, DevicePairingStore, LanCrypto, stores, mdns };
}

test('production pairing performs authenticated TCP exchange and reconnects after both services restart', async () => {
  const { DeviceLinkService, DevicePairingStore } = runtime();
  const aContext = { id: 'a' }, bContext = { id: 'b' };
  let a = new DeviceLinkService(aContext), b = new DeviceLinkService(bContext);
  try {
    await Promise.all([a.start(), b.start()]);
    await a.createInvitation();
    const invitation = a.snapshot().invitation;
    await b.pair(invitation);
    const aState = await new DevicePairingStore(aContext).read();
    const aId = aState.identity.id;
    const bId = (await new DevicePairingStore(bContext).read()).identity.id;
    const invitationKey = JSON.parse(invitation.slice(pairing.PAIRING_PREFIX.length)).key;
    assert.notEqual(aState.devices[0].key, invitationKey, 'the QR secret must not remain a reconnect credential');
    assert.equal(a.snapshot().peers[0].id, bId);
    assert.equal(b.snapshot().peers[0].id, aId);
    assert.equal(a.snapshot().invitation, '');
    assert.equal('key' in b.snapshot().peers[0], false);
    await Promise.all([a.stop(), b.stop()]);
    a = new DeviceLinkService(aContext); b = new DeviceLinkService(bContext);
    await Promise.all([a.start(), b.start()]);
    await b.checkConnection(aId);
    await a.checkConnection(bId);
    assert.equal(b.snapshot().connectedId, aId);
    assert.equal(a.snapshot().connectedId, bId);
    const bStore = new DevicePairingStore(bContext);
    const saved = (await bStore.read()).devices[0];
    await bStore.remember({ ...saved, key: invitationKey });
    await assert.rejects(b.checkConnection(aId), /auth_failed/);
    await bStore.remember(saved);
    await b.forget(aId);
    await assert.rejects(b.connect(aId), /not_paired/);
  } finally { await Promise.all([a.stop(), b.stop()]); }
});

test('production cipher authenticates content, recipient context and fresh IVs before releasing plaintext', async () => {
  const { LanCrypto } = runtime();
  const cipher = await LanCrypto.create('a'.repeat(64));
  const text = new TextEncoder().encode('picture and audio bytes');
  const first = await cipher.seal(text, 'recipient:1', 'b'.repeat(32), false);
  const second = await cipher.seal(text, 'recipient:1', 'b'.repeat(32), false);
  assert.notEqual(first.iv, second.iv);
  assert.deepEqual(await cipher.open(first, 'recipient:1'), text);
  await assert.rejects(cipher.open(first, 'other-recipient'));
  await assert.rejects(cipher.open({ ...first, tag: '0'.repeat(32) }, 'recipient:1'));
});

test('stopping during discovery resolution rejects the late connection and clears online state', async () => {
  const { DeviceLinkService, mdns } = runtime();
  const a = new DeviceLinkService({ id: 'late-a' }), b = new DeviceLinkService({ id: 'late-b' });
  const gate = Promise.withResolvers(), resolving = Promise.withResolvers();
  try {
    await Promise.all([a.start(), b.start()]);
    await a.createInvitation(); await b.pair(a.snapshot().invitation);
    const peerId = a.snapshot().peers[0].id;
    const resolve = mdns.resolveLocalService;
    mdns.resolveLocalService = async (context, service) => {
      const result = await resolve(context, service);
      if (context.id === 'late-a') { resolving.resolve(); await gate.promise; }
      return result;
    };
    const rejected = assert.rejects(a.checkConnection(peerId), /device_link_cancelled/);
    await resolving.promise; await a.stop(); gate.resolve(); await rejected;
    assert.equal(a.snapshot().ready, false);
    assert.equal(a.snapshot().connectedId, '');
    assert.equal(a.snapshot().peers.some(peer => peer.online), false);
  } finally { gate.resolve(); await Promise.all([a.stop(), b.stop()]); }
});

test('the service closes authenticated outgoing channels when its page stops', async () => {
  const { DeviceLinkService } = runtime();
  const a = new DeviceLinkService({ id: 'outgoing-a' }), b = new DeviceLinkService({ id: 'outgoing-b' });
  let connection;
  try {
    await Promise.all([a.start(), b.start()]);
    await a.createInvitation(); await b.pair(a.snapshot().invitation);
    connection = await a.connect(a.snapshot().peers[0].id);
    await a.stop();
    await assert.rejects(connection.send('ping'), /device_link_connect_failed/);
  } finally { await connection?.close(); await Promise.all([a.stop(), b.stop()]); }
});

test('parallel initial reads use one persistent identity instead of creating competing device IDs', async () => {
  const { DevicePairingStore } = runtime();
  const store = new DevicePairingStore({ id: 'a' });
  const results = await Promise.all([store.read(), new DevicePairingStore({ id: 'a' }).read(), store.read()]);
  assert.equal(new Set(results.map(state => state.identity.id)).size, 1);
});

test('actual settings publisher exposes pairing state without QR secrets and removes stale views on exit', () => {
  const appInterface = new AppInterfaceTracker();
  const Settings = settingsClass({ appInterface });
  const page = new Settings();
  page.snapshot = { ready: true, peers: [{ id: 'a'.repeat(32), name: 'Tablet', online: true, allowProgress: true }],
    invitation: 'private-invitation-key', connectedId: 'a'.repeat(32), progressBusy:false,
    progress:[{id:'a'.repeat(32),phase:'done',error:'',addedReviews:1,updatedCards:1}] };
  page.publishInterface();
  assert.deepEqual(appInterface.snapshot()[0].items.map(item=>item.id),['device_link_toggle']);
  page.toggleExpanded();
  const view = appInterface.snapshot()[0];
  assert.equal(view.surface, 'device_link');
  assert.deepEqual(view.optionLabels, ['Tablet']);
  assert.equal(view.values.find(value => value.id === 'paired_count').value, '1');
  assert.equal(view.values.find(value => value.id === 'personal_device_ids').value, JSON.stringify(['a'.repeat(32)]));
  assert.equal(JSON.parse(view.values.find(value => value.id === 'progress_results').value)[0].phase, 'done');
  assert.equal(JSON.stringify(view).includes('private-invitation-key'), false);
  assert.equal(view.items.find(item=>item.id==='a'.repeat(32)+':merge').enabled,true);
  page.snapshot.peers[0].online=false;page.publishInterface();
  assert.equal(appInterface.snapshot()[0].items.find(item=>item.id==='a'.repeat(32)+':merge').enabled,false);
  page.snapshot.progressBusy=true;page.publishInterface();
  assert.equal(appInterface.snapshot()[0].items.find(item=>item.id==='device_progress_cancel').enabled,true);
  assert.equal(appInterface.snapshot()[0].items.find(item=>item.id==='device_link_scan').enabled,false);
  page.aboutToDisappear();
  page.publishInterface();
  assert.deepEqual(appInterface.snapshot(), []);
});

test('unpair confirmation preserves pairing on cancel and ignores repeated or departed callbacks', async () => {
  const dialogs = [], forgotten = [];
  const Settings = settingsClass({
    appInterface: { observe() {}, leave() {} }, visibleInterfaceItems, $r: key => key,
    namedResourceText: (_context, key, ...args) => [key, ...args].join(':')
  });
  const page = new Settings();
  page.getUIContext = () => ({ showAlertDialog: dialog => dialogs.push(dialog) });
  page.service = { forget: async id => forgotten.push(id), stop: async () => {} };
  const peer = { id:'a'.repeat(32), name:'Tablet', online:true, allowProgress:true };
  page.forgetDevice(peer); page.forgetDevice(peer);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].message, /Tablet/);
  dialogs[0].primaryButton.action(); dialogs[0].secondaryButton.action();
  assert.deepEqual(forgotten, []);
  page.forgetDevice(peer);
  dialogs[1].secondaryButton.action(); dialogs[1].secondaryButton.action();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(forgotten, [peer.id]);
  page.forgetDevice(peer); page.aboutToDisappear();
  dialogs[2].secondaryButton.action();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(forgotten, [peer.id]);
});

test('device section reuses the containing scroller, reveals after layout once, and preserves state on collapse',()=>{
  const appInterface=new AppInterfaceTracker(), Settings=settingsClass({appInterface}),page=new Settings();
  page.reveal=new ExpansionReveal(page.scroller);
  page.snapshot.peers=[{id:'a'.repeat(32),name:'Tablet',online:true,allowProgress:true}];
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/DeviceLinkSettings.ets',import.meta.url),'utf8');
  const callback=source.match(/\.onAreaChange\((\(_oldArea: Area, newArea: Area\): void => \{[^]*?\n\s*\})\)/)[1];
  const layout=new Function('return '+stripTypeScriptTypes(callback,{mode:'transform'})).call(page);
  page.toggleExpanded(); assert.equal(page.expanded,true); assert.deepEqual(page.scroller.edges,[]);
  layout({}, {height:0}); assert.deepEqual(page.scroller.edges,[]);
  layout({}, {height:300});layout({}, {height:500}); assert.deepEqual(page.scroller.edges,['bottom']);
  page.snapshot.progressBusy=true;page.toggleExpanded();
  assert.equal(page.expanded,false);assert.equal(page.snapshot.peers[0].allowProgress,true);
  assert.deepEqual(appInterface.snapshot()[0].items.map(item=>item.id),['device_link_toggle','device_progress_cancel']);
  page.toggleExpanded();page.toggleExpanded();layout({}, {height:300});
  assert.deepEqual(page.scroller.edges,['bottom'],'collapse cancels a pending reveal');
  page.toggleExpanded();page.aboutToDisappear();layout({}, {height:300});
  assert.deepEqual(page.scroller.edges,['bottom'],'leaving rejects late layout callbacks');
  const parent=readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets',import.meta.url),'utf8');
  assert.match(parent,/DeviceLinkSettings\(\{[^}]*scroller: this\.内容滚动器/);
  assert.doesNotMatch(source,/QRCode\(/,'QR display belongs to its dialog, so it cannot change list height');
});

test('pairing code uses the shared native window and closes on completion, expiry, back and departure',async()=>{
  const appInterface=new AppInterfaceTracker(), windows=[],timers=[];
  const Settings=settingsClass({appInterface,
    NativeDialogHost:nativeDialogHostClass(surfaceMotionApi()),
    $r:key=>key, namedResourceText:(_context,key)=>key,
    DevicePairingDialog:props=>props,
    CustomDialogController:class {
      constructor(options){this.options=options;this.closed=false;}
      open(){windows.push(this);} close(){this.closed=true;}
    },
    setTimeout:callback=>{timers.push(callback);return timers.length-1;},clearTimeout(){}
  });
  const page=new Settings();page.expanded=true;page.getUIContext=()=>({});
  let serial=0,expired=false;
  page.service={createInvitation:async()=>page.updateSnapshot({...page.snapshot,invitation:'secret-'+(++serial)}),
    snapshot:()=>({...page.snapshot,invitation:expired?'':page.snapshot.invitation}),stop:async()=>{}};
  const show=async()=>{page.showCode();await new Promise(resolve=>setImmediate(resolve));};
  await show();
  assert.equal(windows[0].options.builder.invitation,'secret-1');
  assert.equal(page.codeVisible,true);
  assert.equal(appInterface.snapshot().some(view=>view.surface==='device_pairing_code'),true);
  assert.equal(JSON.stringify(appInterface.snapshot()).includes('secret-'),false);
  windows[0].options.builder.onClose();assert.equal(windows[0].closed,true);
  await show();windows[0].options.builder.onClose();assert.equal(windows[1].closed,false,'old close cannot close replacement');
  let dismissed=0;windows[1].options.onWillDismiss({dismiss(){dismissed++;}});
  assert.equal(dismissed,1);assert.equal(page.codeVisible,false);
  await show();page.updateSnapshot({...page.snapshot,invitation:''});assert.equal(windows[2].closed,true,'pairing completion closes code');
  await show();expired=true;timers.at(-1)();assert.equal(windows[3].closed,true,'expiry closes code');
  await show();page.aboutToDisappear();assert.equal(windows[4].closed,true);assert.deepEqual(appInterface.snapshot(),[]);
  windows[4].options.builder.onClose();assert.deepEqual(appInterface.snapshot(),[]);
});

function memoryProgress(records, rejectHash = false) {
  const state = { records:[...records], active:false, merges:0, files:0, payload:'复习记录📘'.repeat(25000) };
  return { state, factory:() => {
    const files = new Map(); let serial = 0;
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    return {
      async acquire() { if(state.active) throw new Error('device_progress_busy'); state.active=true; },
      async release() { state.files-=files.size; files.clear(); state.active=false; },
      async exportFile() {
        const token = String(++serial), data = Buffer.from(JSON.stringify({records:state.records,payload:state.payload}));
        files.set(token,{data,offset:0}); state.files++;
        return {token,bytes:data.length,hash:hash(data)};
      },
      async receiveFile() { const token=String(++serial); files.set(token,{data:Buffer.alloc(0),offset:0}); state.files++; return token; },
      async read(token,length) { const file=files.get(token), data=file.data.subarray(file.offset,file.offset+length);file.offset+=data.length;return new Uint8Array(data); },
      async write(token,data) { const file=files.get(token);file.data=Buffer.concat([file.data,Buffer.from(data)]); },
      async verify(token,file) { const data=files.get(token).data;if(rejectHash || data.length!==file.bytes || hash(data)!==file.hash) throw new Error('device_progress_invalid'); },
      async merge(token) {
        const remote=JSON.parse(files.get(token).data); assert.equal(remote.payload,state.payload);
        const before=state.records.length;state.records=[...new Set([...state.records,...remote.records])].sort(); state.merges++;
        return {addedReviews:state.records.length-before,updatedCards:0};
      }
    };
  }};
}

function memoryCollection(records) {
  const state={records:[...records],active:false,applies:[],confirmations:0,failHash:false,files:0};
  const factory=()=>{
    const files=new Map();let serial=0;
    const hash=data=>createHash('sha256').update(data).digest('hex');
    const file=value=>{const token=String(++serial),data=Buffer.from(JSON.stringify(value));files.set(token,{data,offset:0});state.files++;return {token,bytes:data.length,hash:hash(data)};};
    return {
      async acquire(){assert.equal(state.active,false);state.active=true;},
      async release(){state.files-=files.size;files.clear();state.active=false;},
      async capture(){return file({records:state.records,padding:'媒体📘'.repeat(20000)});},
      async confirm(local){assert.ok(files.has(local));state.confirmations++;},
      async plan(remote,local,mode){assert.ok(files.has(remote)&&files.has(local));assert.ok(['merge','pull'].includes(mode));return file({wanted:[]});},
      async pack(wanted,local){assert.ok(files.has(wanted)&&files.has(local));return file({files:[]});},
      async apply(remote,payload,mode){
        assert.ok(files.has(payload));state.applies.push(mode);
        const incoming=JSON.parse(files.get(remote).data).records,before=state.records.length;
        if(mode==='replace')state.records=incoming;
        else if(mode!=='media')state.records=[...new Set([...state.records,...incoming])].sort();
        return {updatedObjects:0,addedReviews:Math.max(0,state.records.length-before),updatedMedia:0,deletedMedia:0};
      },
      async receiveFile(){return file({}).token;},
      async read(token,length){const f=files.get(token),data=f.data.subarray(f.offset,f.offset+length);f.offset+=data.length;return new Uint8Array(data);},
      async write(token,data){const f=files.get(token);if(f.offset===0){f.data=Buffer.alloc(0);f.offset=-1;}f.data=Buffer.concat([f.data,Buffer.from(data)]);},
      async verify(token,descriptor){const data=files.get(token).data;if(state.failHash||data.length!==descriptor.bytes||hash(data)!==descriptor.hash)throw new Error('device_collection_invalid');}
    };
  };
  return {state,factory};
}

test('collection sync uses independent bilateral permission, chunked authenticated TCP, merge and receiver-only replacement',async()=>{
  const {DeviceLinkService}=runtime(),left=memoryCollection(['a']),right=memoryCollection(['b']);
  const a=new DeviceLinkService({id:'collection-a'},null,left.factory),b=new DeviceLinkService({id:'collection-b'},null,right.factory);
  try{
    await a.start();await b.start();await a.createInvitation();await b.pair(a.snapshot().invitation);
    const aid=b.snapshot().peers[0].id,bid=a.snapshot().peers[0].id;
    await a.allowProgress(bid,true);await b.allowProgress(aid,true);
    await assert.rejects(a.syncCollection(bid),/not_allowed/);
    await a.allowCollection(bid,true);await assert.rejects(a.syncCollection(bid),/not_allowed/);
    await b.allowCollection(aid,true);await a.allowProgress(bid,false);
    assert.equal(a.snapshot().peers[0].allowCollection,true,'changing progress permission retains collection permission');
    await a.syncCollection(bid);
    assert.deepEqual(left.state.records,['a','b']);assert.deepEqual(right.state.records,['a','b']);
    assert.deepEqual(left.state.applies,['final']);assert.deepEqual(right.state.applies,['merge']);
    assert.equal(right.state.confirmations,1,'media baseline is acknowledged only after the receiving endpoint commits');
    left.state.records=['discard'];right.state.records=['keep'];
    await a.syncCollection(bid,'pull');
    assert.deepEqual(left.state.records,['keep']);assert.deepEqual(right.state.records,['keep']);
    assert.equal(right.state.applies.at(-1),'media');assert.equal(left.state.applies.at(-1),'replace');
    right.state.failHash=true;const count=right.state.applies.length;
    await assert.rejects(a.syncCollection(bid),/invalid/);assert.equal(right.state.applies.length,count);
    assert.equal(left.state.active||right.state.active,false);assert.equal(left.state.files+right.state.files,0);
    right.state.failHash=false;await a.syncCollection(bid);
    assert.equal(a.snapshot().collection[0].phase,'done');
    const connection=await a.connect(bid);
    await connection.send(collection.COLLECTION_REQUEST);assert.equal(JSON.parse(await connection.read()).kind,'ready');
    await connection.send(JSON.stringify({kind:'mode',mode:'push'}));
    assert.equal(JSON.parse(await connection.read()).error,'device_collection_invalid');
    await connection.close();
    const large=await a.connect(bid);
    await large.send(collection.COLLECTION_REQUEST);await large.read();await large.send(JSON.stringify({kind:'mode',mode:'merge'}));
    await large.send(JSON.stringify({kind:'file',bytes:collection.COLLECTION_METADATA_MAX_BYTES+1,hash:'a'.repeat(64)}));
    assert.equal(JSON.parse(await large.read()).error,'device_collection_too_large');await large.close();
    b.collectionFactory=null;
    await assert.rejects(a.syncCollection(bid),/device_collection_unsupported/);
    assert.equal(left.state.files,0,'unsupported peers are rejected before collection export');
  }finally{await a.stop();await b.stop();}
});

test('collection replacement requires local confirmation and ignores cancelled, repeated and departed dialog callbacks',async()=>{
  const appInterface=new AppInterfaceTracker(),dialogs=[],calls=[];
  const Settings=settingsClass({appInterface,$r:key=>key,namedResourceText:(_ui,key,...args)=>key+args.join(' ')});
  const page=new Settings();page.expanded=true;
  page.getUIContext=()=>({showAlertDialog:options=>dialogs.push(options)});
  page.service={syncCollection:async(id,mode)=>calls.push({id,mode}),stop:async()=>{}};
  const peer={id:'b'.repeat(32),name:'Other',online:true,allowProgress:false,allowCollection:true};
  page.snapshot={...page.snapshot,peers:[peer],collection:[{id:peer.id,phase:'failed',error:'device_collection_full_required'}]};
  assert.equal(page.needsFull(peer.id),true);
  page.pullCollection(peer);assert.equal(page.confirmingPull,true);
  dialogs[0].primaryButton.action();dialogs[0].secondaryButton.action();assert.deepEqual(calls,[]);
  page.pullCollection(peer);dialogs[1].secondaryButton.action();dialogs[1].secondaryButton.action();
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,[{id:peer.id,mode:'pull'}]);
  page.pullCollection(peer);page.aboutToDisappear();dialogs[2].secondaryButton.action();
  assert.equal(calls.length,1);
});

test('collection cancellation during payload verification keeps the lease and prevents a new apply on either endpoint', async () => {
  for (const receiver of [true, false]) {
    const {DeviceLinkService}=runtime(),left=memoryCollection(['a']),right=memoryCollection(['b']);
    const verifying=Promise.withResolvers(),resume=Promise.withResolvers(),settled=Promise.withResolvers();
    const data=receiver?right:left;
    const factory=()=>{
      const store=data.factory(),verify=store.verify;
      let received=0;
      store.verify=async(...args)=>{
        // Each endpoint receives metadata/requests first; its second file is the payload preceding apply.
        if(++received===2){verifying.resolve();await resume.promise;}
        return verify(...args);
      };
      return store;
    };
    const a=new DeviceLinkService({id:'collection-cancel-a'},null,receiver?left.factory:factory);
    const b=new DeviceLinkService({id:'collection-cancel-b'},null,receiver?factory:right.factory);
    const cancelled=receiver?b:a;
    cancelled.subscribe(snapshot=>{if(snapshot.collection.some(item=>item.phase==='failed')&&!snapshot.progressBusy)settled.resolve();});
    try{
      await a.start();await b.start();await a.createInvitation();await b.pair(a.snapshot().invitation);
      await a.allowCollection(a.snapshot().peers[0].id,true);await b.allowCollection(b.snapshot().peers[0].id,true);
      const rejected=assert.rejects(a.syncCollection(a.snapshot().peers[0].id));
      await verifying.promise;await cancelled.cancelProgress();
      assert.equal(data.state.active,true,'verification retains the collection lease until IO settles');
      resume.resolve();await rejected;await settled.promise;
      assert.equal(data.state.applies.length,0);assert.equal(data.state.confirmations,0);
      assert.equal(data.state.active,false);assert.equal(data.state.files,0);
    }finally{resume.resolve();await a.stop();await b.stop();}
  }
});

test('paired TCP progress needs personal authorization, merges binary chunks, retries and converges across three devices',async()=>{
  const {DeviceLinkService}=runtime();
  const data=[memoryProgress(['a']),memoryProgress(['b']),memoryProgress(['c'])];
  const services=data.map((item,index)=>new DeviceLinkService({id:'progress-'+index},item.factory));
  const [a,b,c]=services;
  try {
    await Promise.all(services.map(service=>service.start()));
    await a.createInvitation();await b.pair(a.snapshot().invitation);
    await a.createInvitation();await c.pair(a.snapshot().invitation);
    const bId=a.snapshot().peers[0].id,cId=a.snapshot().peers[1].id,aId=b.snapshot().peers[0].id;
    await a.allowProgress(bId,true);
    await assert.rejects(a.mergeProgress(bId),/not_allowed/);
    assert.deepEqual(data.map(item=>item.state.records),[['a'],['b'],['c']]);
    await b.allowProgress(aId,true);await a.allowProgress(cId,true);await c.allowProgress(aId,true);
    await a.mergeAllProgress();
    assert.deepEqual(data.map(item=>item.state.records),[['a','b','c'],['a','b','c'],['a','b','c']]);
    assert.equal(a.snapshot().progress.every(item=>item.phase==='done'),true);
    await a.mergeProgress(bId);
    assert.equal(a.snapshot().progress.find(item=>item.id===bId).addedReviews,0);
    await a.allowProgress(bId,false);await assert.rejects(a.mergeProgress(bId),/not_allowed/);
    assert.equal(data.every(item=>item.state.files===0 && !item.state.active),true);
  } finally {await Promise.all(services.map(service=>service.stop()));}
});

test('failed file integrity validation never calls the receiving merge and releases both tasks',async()=>{
  const {DeviceLinkService}=runtime();const left=memoryProgress(['a']),right=memoryProgress(['b'],true);
  const a=new DeviceLinkService({id:'bad-a'},left.factory),b=new DeviceLinkService({id:'bad-b'},right.factory);
  try {
    await Promise.all([a.start(),b.start()]);await a.createInvitation();await b.pair(a.snapshot().invitation);
    await a.allowProgress(a.snapshot().peers[0].id,true);await b.allowProgress(b.snapshot().peers[0].id,true);
    await assert.rejects(a.mergeProgress(a.snapshot().peers[0].id),/device_progress_invalid/);
    assert.equal(right.state.merges,0);assert.deepEqual(right.state.records,['b']);
    assert.equal(left.state.files+right.state.files,0);assert.equal(left.state.active||right.state.active,false);
  } finally {await Promise.all([a.stop(),b.stop()]);}
});

test('cancelling the last bulk peer reports cancellation and releases the collection without a write', async () => {
  const {DeviceLinkService}=runtime(), left=memoryProgress(['a']), right=memoryProgress(['b']);
  let notifyExport, finishExport;
  const exporting=new Promise(resolve=>{notifyExport=resolve;});
  const resume=new Promise(resolve=>{finishExport=resolve;});
  const factory=()=>{
    const store=left.factory(), original=store.exportFile;
    store.exportFile=async()=>{notifyExport();await resume;return original();};
    return store;
  };
  const a=new DeviceLinkService({id:'cancel-a'},factory), b=new DeviceLinkService({id:'cancel-b'},right.factory);
  try {
    await Promise.all([a.start(),b.start()]);await a.createInvitation();await b.pair(a.snapshot().invitation);
    await a.allowProgress(a.snapshot().peers[0].id,true);await b.allowProgress(b.snapshot().peers[0].id,true);
    const task=a.mergeAllProgress();
    const rejected=assert.rejects(task,/device_progress_cancelled/);
    await exporting;await a.cancelProgress();finishExport();await rejected;
    assert.equal(a.snapshot().progressBusy,false);
    assert.equal(a.snapshot().progress[0].error,'device_progress_cancelled');
    assert.deepEqual(left.state.records,['a']);assert.deepEqual(right.state.records,['b']);
    assert.equal(left.state.files,0);assert.equal(left.state.active,false);
  } finally {finishExport();await Promise.all([a.stop(),b.stop()]);}
});

test('receiver cancellation waits for an accepted merge and reports the receiving task as cancelled', async () => {
  const { DeviceLinkService } = runtime();
  const left = memoryProgress(['a']), right = memoryProgress(['b']);
  const merging = Promise.withResolvers(), finishMerge = Promise.withResolvers();
  const factory = () => {
    const store = right.factory(), merge = store.merge;
    store.merge = async token => { merging.resolve(); await finishMerge.promise; return merge(token); };
    return store;
  };
  const a = new DeviceLinkService({ id: 'receiver-a' }, left.factory);
  const b = new DeviceLinkService({ id: 'receiver-b' }, factory);
  const settled = Promise.withResolvers();
  b.subscribe(snapshot => { if (snapshot.progress.some(item => item.phase === 'failed') && !snapshot.progressBusy) settled.resolve(snapshot); });
  try {
    await Promise.all([a.start(), b.start()]); await a.createInvitation(); await b.pair(a.snapshot().invitation);
    await a.allowProgress(a.snapshot().peers[0].id, true); await b.allowProgress(b.snapshot().peers[0].id, true);
    const rejected = assert.rejects(a.mergeProgress(a.snapshot().peers[0].id));
    await merging.promise; await b.cancelProgress();
    assert.equal(right.state.active, true, 'the accepted write keeps its collection lease');
    assert.equal(b.snapshot().progressBusy, true);
    finishMerge.resolve(); await rejected;
    const result = await settled.promise;
    assert.equal(result.progress[0].error, 'device_progress_cancelled');
    assert.deepEqual(right.state.records, ['a', 'b'], 'cancelling the network does not roll back an accepted transaction');
    assert.equal(right.state.active, false); assert.equal(right.state.files, 0);
  } finally { finishMerge.resolve(); await Promise.all([a.stop(), b.stop()]); }
});

test('cancelling during file verification must not start a new Core merge on either endpoint', async () => {
  for (const receiver of [true, false]) {
    const { DeviceLinkService } = runtime();
    const left = memoryProgress(['a']), right = memoryProgress(['b']);
    const verifying = Promise.withResolvers(), finishVerify = Promise.withResolvers(), settled = Promise.withResolvers();
    const data = receiver ? right : left;
    const factory = () => {
      const store = data.factory(), verify = store.verify;
      store.verify = async (...args) => { verifying.resolve(); await finishVerify.promise; return verify(...args); };
      return store;
    };
    const a = new DeviceLinkService({ id: 'verify-a' }, receiver ? left.factory : factory);
    const b = new DeviceLinkService({ id: 'verify-b' }, receiver ? factory : right.factory);
    const cancelled = receiver ? b : a;
    cancelled.subscribe(snapshot => { if (snapshot.progress.some(item => item.phase === 'failed') && !snapshot.progressBusy) settled.resolve(); });
    try {
      await Promise.all([a.start(), b.start()]); await a.createInvitation(); await b.pair(a.snapshot().invitation);
      await a.allowProgress(a.snapshot().peers[0].id, true); await b.allowProgress(b.snapshot().peers[0].id, true);
      const rejected = assert.rejects(a.mergeProgress(a.snapshot().peers[0].id));
      await verifying.promise; await cancelled.cancelProgress(); finishVerify.resolve();
      await rejected; await settled.promise;
      assert.equal(data.state.merges, 0, 'verification completion after cancellation cannot accept a new write');
      assert.deepEqual(data.state.records, receiver ? ['b'] : ['a']);
      assert.equal(data.state.active, false); assert.equal(data.state.files, 0);
    } finally { finishVerify.resolve(); await Promise.all([a.stop(), b.stop()]); }
  }
});
