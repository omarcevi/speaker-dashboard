import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, vi } from 'vitest'
import { syncEditorContent } from './editorSync.ts'

const fake = (html: string, isDestroyed = false) => {
  const setContent = vi.fn()
  return { editor: { isDestroyed, getHTML: () => html, commands: { setContent } } as unknown as Editor, setContent }
}

describe('syncEditorContent', () => {
  it('leaves a destroyed editor alone (reading its HTML would throw)', () => {
    // JSON content: parsing an HTML string needs a DOM, which these tests run without.
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }
    const editor = new Editor({ extensions: [StarterKit], content: doc })
    editor.destroy()
    // The crash this guards against: a destroyed editor's schema is null.
    expect(() => editor.getHTML()).toThrow(/cached/)
    expect(() => syncEditorContent(editor, '<p>New</p>')).not.toThrow()
  })

  it('does nothing without an editor', () => {
    expect(() => syncEditorContent(null, '<p>New</p>')).not.toThrow()
  })

  it('sets new content without an update event', () => {
    const { editor, setContent } = fake('<p>Old</p>')
    syncEditorContent(editor, '<p>New</p>')
    expect(setContent).toHaveBeenCalledWith('<p>New</p>', { emitUpdate: false })
  })

  it('keeps the content (and the cursor) when nothing changed', () => {
    const { editor, setContent } = fake('<p>Same</p>')
    syncEditorContent(editor, '<p>Same</p>')
    expect(setContent).not.toHaveBeenCalled()
  })
})
