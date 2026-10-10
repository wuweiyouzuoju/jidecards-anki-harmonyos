// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
export function assertNoteEditorUnchanged(before: EditableNote, current: EditableNote): void {
  if (before.id !== current.id || before.guid !== current.guid || before.notetypeId !== current.notetypeId ||
    before.mtimeSecs !== current.mtimeSecs || before.usn !== current.usn ||
    JSON.stringify(before.fields) !== JSON.stringify(current.fields) || JSON.stringify(before.tags) !== JSON.stringify(current.tags))
    throw new Error('Note changed while editing');
}
