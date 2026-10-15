// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterSettingsEntries } from '../../entry/src/main/ets/model/SettingsNavigation.ts';
import { DEVICE_LINK_VERSION, invitationText, pairingInvitation, parsePairingInvitation,
  parsePairingState, rememberDevice, forgetDevice, discoveryDevice } from '../../entry/src/main/ets/model/device-link/DevicePairing.ts';
import { LanFrameReader, lanFrame, verifyLinkProof, verifyLinkReply } from '../../entry/src/main/ets/model/device-link/LanWire.ts';

const own = { id: 'a'.repeat(32), name: 'Phone' };
const peer = { id: 'b'.repeat(32), name: 'Tablet', key: 'c'.repeat(64), pairedAt: 1 };
const state = { version: DEVICE_LINK_VERSION, identity: own, devices: [] };

test('device pairing is discoverable in the existing settings search in both display modes', () => {
  const strings = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url), 'utf8'))
    .string.map(item => [item.name, item.value]));
  for (const simple of [true, false]) {
    assert.equal(filterSettingsEntries('设备直连', simple, false, key => strings.get(key) ?? key)[0].id, 'sync');
    assert.equal(filterSettingsEntries('配对', simple, false, key => strings.get(key) ?? key)[0].id, 'sync');
  }
});

test('pairing survives restart and address changes without retaining an address as trust', () => {
  const saved = parsePairingState(JSON.stringify(rememberDevice(state, peer)));
  assert.equal(saved.devices[0].key, peer.key);
  const first = discoveryDevice('jide-' + peer.id, '192.168.1.2', 1234);
  const later = discoveryDevice('jide-' + peer.id + ' (2)', '192.168.1.82', 5678);
  assert.equal(first.id, later.id);
  assert.notEqual(first.address, later.address);
  assert.deepEqual(forgetDevice(saved, peer.id).devices, []);
  assert.throws(() => parsePairingState('{broken'));
  assert.throws(() => parsePairingState(JSON.stringify({ ...saved, devices: [peer, peer] })));
});

test('QR invitations expire, are scoped to another device and validate version and key', () => {
  const invitation = pairingInvitation(peer, peer.key, 1000);
  assert.equal(parsePairingInvitation(invitationText(invitation), own.id, 1001).id, peer.id);
  assert.throws(() => parsePairingInvitation(invitationText(invitation), peer.id, 1001));
  assert.throws(() => parsePairingInvitation(invitationText(invitation), own.id, invitation.expiresAt));
  assert.throws(() => parsePairingInvitation(invitationText({ ...invitation, version: 2 }), own.id, 1001));
  assert.throws(() => parsePairingInvitation(invitationText({ ...invitation, key: 'weak' }), own.id, 1001));
  assert.equal(discoveryDevice('foreign-service', '192.168.1.2', 1234), null);
});

test('TCP framing accepts fragmented and coalesced frames and rejects malicious lengths', () => {
  const payloads = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  const encoded = payloads.map(lanFrame);
  const joined = new Uint8Array(encoded.reduce((sum, item) => sum + item.length, 0));
  let position = 0;
  for (const item of encoded) { joined.set(item, position); position += item.length; }
  const reader = new LanFrameReader();
  const frames = [];
  for (let offset = 0; offset < joined.length; offset++) frames.push(...reader.push(joined.subarray(offset, offset + 1)));
  assert.deepEqual(frames, payloads);
  assert.equal(reader.hasPending(), false);
  assert.deepEqual(new LanFrameReader().push(joined), payloads);
  assert.throws(() => new LanFrameReader().push(new Uint8Array([255, 255, 255, 255])));
  assert.throws(() => new LanFrameReader().push(new Uint8Array(4)));
});

test('fresh connection proofs reject replay, wrong recipient and false peer identity', () => {
  const proof = { id: peer.id, name: peer.name, recipient: own.id, challenge: 'fresh', nonce: 'd'.repeat(32), pairing: false };
  verifyLinkProof(proof, own.id, 'fresh');
  assert.throws(() => verifyLinkProof(proof, own.id, 'new-challenge'));
  assert.throws(() => verifyLinkProof(proof, peer.id, 'fresh'));
  const reply = { id: peer.id, recipient: own.id, challenge: 'fresh', nonce: proof.nonce };
  verifyLinkReply(reply, peer.id, own.id, 'fresh', proof.nonce);
  assert.throws(() => verifyLinkReply(reply, peer.id, own.id, 'new', proof.nonce));
  assert.throws(() => verifyLinkReply({ ...reply, id: own.id }, peer.id, own.id, 'fresh', proof.nonce));
});
