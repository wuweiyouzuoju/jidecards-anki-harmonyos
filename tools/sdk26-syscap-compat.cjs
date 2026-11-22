// SPDX-License-Identifier: AGPL-3.0-or-later
// DevEco 26.0.0.105 compares ranged @syscap text against unqualified device
// capabilities. Normalize active, universally supported tags before comparison.
// Unknown capabilities and the SDK's separate device/API checks still run.
const Module = require('node:module');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const sdk = process.env.DEVECO_SDK_HOME;
if (sdk) {
  const metadata = JSON.parse(readFileSync(resolve(sdk, 'default/sdk-pkg.json'), 'utf8'));
  if (metadata.data.version === '26.0.0.105') {
    const checker = resolve(sdk, 'default/openharmony/ets/build-tools/ets-loader/lib/fast_build/system_api/api_check_utils.js');
    const original = Module._extensions['.js'];
    Module._extensions['.js'] = function (module, filename) {
      if (filename !== checker) return original(module, filename);
      const source = readFileSync(filename, 'utf8');
      const entry = 'function checkSyscapAbility(t,i,n,r){';
      if (source.split(entry).length !== 2) throw new Error('Unexpected DevEco syscap checker implementation');
      module._compile(source.replace(entry, entry + `
        const deviceCapabilities = _main.projectConfig.syscapIntersectionSet;
        const tags = t.filter(tag => tag?.tagName.escapedText === 'syscap');
        const ranges = tags.map(tag => typeof tag.comment === 'string' &&
          /^((?:SystemCapability\\.)[\\w.]+) \\[since (\\d+)(?: - (\\d+))?\\]$/.exec(tag.comment));
        if (tags.length && ranges.every(Boolean)) {
          const active = ranges.filter(range => Number(range[2]) <= 26 && (!range[3] || Number(range[3]) >= 26));
          if (active.length === 1 && deviceCapabilities?.has(active[0][1])) {
            const selected = tags[ranges.indexOf(active[0])];
            t = t.filter(tag => !tags.includes(tag) || tag === selected)
              .map(tag => tag === selected ? Object.assign(Object.create(tag), { comment: active[0][1] }) : tag);
          }
        }
      `), filename);
    };
  }
}
