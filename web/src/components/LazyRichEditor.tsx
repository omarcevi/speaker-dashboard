import { lazy, Suspense, type ComponentProps } from 'react'

// TipTap is large and only admins editing an email need it, so it loads on first use.
const RichEditor = lazy(() => import('./RichEditor.tsx').then((m) => ({ default: m.RichEditor })))

/** RichEditor, loaded on demand; a quiet box of the editor's size stands in while it loads. */
export default function LazyRichEditor(props: ComponentProps<typeof RichEditor>) {
  return (
    <Suspense fallback={<div className="rich rich-loading" aria-busy="true" aria-label={props.ariaLabel} />}>
      <RichEditor {...props} />
    </Suspense>
  )
}
