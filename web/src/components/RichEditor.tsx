import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { IMAGE_TYPES, uploadEmailImage } from '../lib/emailImages.ts'
import { syncEditorContent } from '../lib/editorSync.ts'

type FillIn = { name: string; label: string }

export function RichEditor({ value, onChange, onText, fillIns, ariaLabel }: {
  value: string
  onChange: (html: string) => void
  /** The plain text of each edit, a blank line between blocks. */
  onText?: (text: string) => void
  fillIns: FillIn[]
  ariaLabel: string
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [fillOpen, setFillOpen] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const linkBtnRef = useRef<HTMLButtonElement>(null)
  const fillBtnRef = useRef<HTMLButtonElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }, code: false, codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image,
    ],
    content: value,
    // Create the editor in an effect, not during render. A render-time editor is destroyed by TipTap's 1 ms
    // "not mounted yet" timer whenever the commit takes longer than that (StrictMode, a slow page), and the effects
    // of that commit still see it: getHTML() then reads the destroyed editor's null schema and throws.
    immediatelyRender: false,
    // Pasted HTML is not cleaned here: the schema already keeps only what the editor supports, and the email is
    // cleaned when it is rendered for sending. Cleaning here would drop the styles Google Docs uses for bold/normal.
    editorProps: {
      attributes: { 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
      onText?.(e.getText({ blockSeparator: '\n\n' }))
    },
  })

  // Pull in outside changes only when they differ, so typing never moves the cursor.
  useEffect(() => { syncEditorContent(editor, value) }, [value, editor])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive('bold'), italic: !!e?.isActive('italic'),
      bullet: !!e?.isActive('bulletList'), ordered: !!e?.isActive('orderedList'),
      link: !!e?.isActive('link'),
      heading: [1, 2, 3].find((level) => e?.isActive('heading', { level })) ?? 0,
    }),
  })

  useEffect(() => {
    if (!fillOpen) return
    const onDown = (e: MouseEvent) => {
      if (!fillRef.current?.contains(e.target as Node)) setFillOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [fillOpen])

  // Until the editor exists (the first render), the loading box LazyRichEditor shows stays in place.
  if (!editor || !active) return <div className="rich rich-loading" aria-busy="true" aria-label={ariaLabel} />

  const openLink = () => {
    setUrl(editor.getAttributes('link').href ?? '')
    setLinkError('')
    setLinkOpen(true)
  }
  const applyLink = () => {
    let href = url.trim()
    if (!href) { setLinkOpen(false); return }
    if (!/^(https?:\/\/|mailto:)/i.test(href) && !/^[a-z][a-z0-9+.-]*:/i.test(href)) href = `https://${href}`
    if (!/^(https?:\/\/|mailto:)/i.test(href)) {
      setLinkError('Use an http(s) or mailto: address')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
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
      if (!editor.isDestroyed) editor.chain().focus().setImage({ src }).run()
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
  const closeLink = () => {
    setLinkOpen(false)
    linkBtnRef.current?.focus()
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
        <button ref={linkBtnRef} type="button" aria-label="Link" aria-expanded={linkOpen}
          className={active.link ? 'on' : undefined} onClick={openLink}>Link</button>
        <button type="button" aria-label="Image" disabled={uploading}
          onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Image'}</button>
        <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} hidden
          onChange={(e) => void pickImage(e.target.files?.[0])} />
        {fillIns.length > 0 && (
          <span className="rich-menu" ref={fillRef}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && fillOpen) { setFillOpen(false); fillBtnRef.current?.focus() }
            }}>
            <button ref={fillBtnRef} type="button" aria-expanded={fillOpen}
              onClick={() => setFillOpen((o) => !o)}>Insert fill-in</button>
            {fillOpen && (
              <ul>
                {fillIns.map((f) => (
                  <li key={f.name}>
                    <button type="button" onClick={() => insertFillIn(f.name)}>{f.label}</button>
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
            onChange={(e) => { setUrl(e.target.value); setLinkError('') }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink() }
              if (e.key === 'Escape') closeLink()
            }} />
          <button type="button" onClick={applyLink}>Apply</button>
          <button type="button" onClick={removeLink}>Remove</button>
          {linkError && <span className="rich-error" role="alert">{linkError}</span>}
        </div>
      )}
      {error && <p className="rich-error" role="alert">{error}</p>}
      <EditorContent editor={editor} className="rich-body" />
    </div>
  )
}
