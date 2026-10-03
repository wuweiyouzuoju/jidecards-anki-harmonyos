// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ImportFile {
  uri: string;
  name: string;
}

/** Provider URIs may encode the filename; inspect the last path segment, never a query suffix. */
export function importFileName(uri: string): string {
  const path = uri.split('?')[0].split('#')[0];
  const name = path.substring(path.lastIndexOf('/') + 1);
  try { return decodeURIComponent(name); } catch (_error) { return name; }
}

export function importFileKind(name: string): 'importDeck' | 'importText' | 'unsupported' {
  const suffix = name.substring(name.lastIndexOf('.')).toLowerCase();
  if (suffix === '.apkg') return 'importDeck';
  if (suffix === '.csv' || suffix === '.tsv' || suffix === '.txt') return 'importText';
  return 'unsupported';
}
