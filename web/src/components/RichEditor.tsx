import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { cleanEmailHtml } from '../../../functions/src/shared/emailHtml.ts'
import { uploadEmailImage } from '../lib/emailImages.ts'

type FillIn = { name: string; label: string }

export function RichEditor({ value, onChange, fillIns, ariaLabel }: {
  value: string
  onChange: (html: string) => void
  fillIns: FillIn[]
  ariaLabel: string
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [fillOpen, setFillOpen] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image,
    ],
    content: value,
    editorProps: {
      attributes: { 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML: (html) => cleanEmailHtml(html),
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })

  // Pull in outside changes only when they differ, so typing never moves the cursor.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive('bold'), italic: !!e?.isActive('italic'),
      bullet: !!e?.isActive('bulletList'), ordered: !!e?.isActive('orderedList'),
      link: !!e?.isActive('link'),
      heading: [1, 2, 3].find((level) => e?.isActive('heading', { level })) ?? 0,
    }),
  })

  if (!editor || !active) return null

  const openLink = () => {
    setUrl(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }
  const applyLink = () => {
    const href = url.trim()
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
  }
  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkOpen(false)
  }
  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const src = await uploadEmailImage(file)
      editor.chain().focus().setImage({ src }).run()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const insertFillIn = (name: string) => {
    editor.chain().focus().insertContent(`{{${name}}}`).run()
    setFillOpen(false)
  }

  return (
    <div className="rich">
      <div className="rich-bar" role="toolbar" aria-label="Formatting">
        <button type="button" aria-label="Bold" aria-pressed={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" aria-label="Italic" aria-pressed={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <select aria-label="Heading" value={active.heading}
          onChange={(e) => {
            const level = Number(e.target.value)
            const c = editor.chain().focus()
            if (level === 0) c.setParagraph().run()
            else c.setHeading({ level: level as 1 | 2 | 3 }).run()
          }}>
          <option value={0}>Paragraph</option>
          <option value={1}>Heading 1</option>
          <option value={2}>Heading 2</option>
          <option value={3}>Heading 3</option>
        </select>
        <button type="button" aria-label="Bulleted list" aria-pressed={active.bullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button type="button" aria-label="Numbered list" aria-pressed={active.ordered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button type="button" aria-label="Link" aria-pressed={active.link} onClick={openLink}>Link</button>
        <button type="button" aria-label="Image" disabled={uploading}
          onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Image'}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => void pickImage(e.target.files?.[0])} />
        {fillIns.length > 0 && (
          <span className="rich-menu">
            <button type="button" aria-haspopup="menu" aria-expanded={fillOpen}
              onClick={() => setFillOpen((o) => !o)}>Insert fill-in</button>
            {fillOpen && (
              <ul role="menu">
                {fillIns.map((f) => (
                  <li key={f.name} role="none">
                    <button type="button" role="menuitem" onClick={() => insertFillIn(f.name)}>{f.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        )}
      </div>
      {linkOpen && (
        <div className="rich-link">
          <input type="url" value={url} placeholder="https://" aria-label="Link address" autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink() }
              if (e.key === 'Escape') setLinkOpen(false)
            }} />
          <button type="button" onClick={applyLink}>Apply</button>
          <button type="button" onClick={removeLink}>Remove</button>
        </div>
      )}
      {error && <p className="rich-error" role="alert">{error}</p>}
      <EditorContent editor={editor} className="rich-body" />
    </div>
  )
}
