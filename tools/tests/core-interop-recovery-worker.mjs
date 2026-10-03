// SPDX-License-Identifier: AGPL-3.0-or-later
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { recoveryAdapter } from '../core-interop-recovery.mjs';

if (!process.send || process.argv.length !== 3) throw Error('Internal recovery subprocess requires IPC');
const root=process.argv[2];
if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('jidecards-interop-recovery-')) throw Error('Worker requires its fresh temporary directory');
if (await fs.readFile(path.join(root,'.recovery-owned'),'utf8') !== 'synthetic-only\n') throw Error('Worker ownership marker missing');
await recoveryAdapter().prepareReplacementRecovery(root,null);
await fs.writeFile(path.join(root,'collection.anki2'),'interrupted imported database');
for (const suffix of ['-wal','-shm','-journal']) await fs.writeFile(path.join(root,'collection.anki2'+suffix),'stale transaction');
await fs.writeFile(path.join(root,'collection.media','partial-new-file'),'partial media');
process.send('prepared-and-damaged');
// Parent kills the process at an explicit durable checkpoint, without graceful recovery.
setInterval(() => {},1000);
