import type { Editor } from '@tiptap/react'

/**
 * Puts `value` into the editor when it differs from what the editor holds, so typing never moves the cursor. A
 * missing or destroyed editor is left alone: a destroyed one has no schema, and reading its HTML throws.
 */
export function syncEditorContent(editor: Editor | null, value: string): void {
  if (!editor || editor.isDestroyed) return
  if (value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false })
}
