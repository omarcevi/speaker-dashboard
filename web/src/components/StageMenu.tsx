import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import type { Stage } from '../../../functions/src/model.ts'
import type { CellKind } from '../lib/stages.ts'

interface Props {
  /** The cell button the menu opened from: placed under it, and focus goes back to it on Escape, Tab or an action. */
  anchor: HTMLElement
  first: string
  stage: Stage
  kind: CellKind
  /** The stage's template still exists (Send and Mark need it). */
  hasTemplate: boolean
  onSend: () => void
  onMark: () => void
  onException: (which: 'skipped' | 'added', on: boolean) => void
  onClose: () => void
}

interface Item { label: string; act: () => void; disabled?: boolean }

/** The actions for one admin cell with no email yet (or a skipped / not-for-this-speaker cell). */
export default function StageMenu({ anchor, first, stage, kind, hasTemplate, onSend, onMark, onException, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const items: Item[] = []
  if (kind === 'skipped') items.push({ label: 'Undo skip', act: () => onException('skipped', false) })
  else if (kind === 'notFor') items.push({ label: `Add ${stage.name} for ${first}`, act: () => onException('added', true) })
  else if (kind === 'missing' || kind === 'due' || kind === 'blank') {
    items.push({ label: `Send ${stage.name}`, act: onSend, disabled: !hasTemplate })
    items.push({ label: 'Mark as already sent', act: onMark, disabled: !hasTemplate })
    items.push(stage.appliesTo === 'added'
      ? { label: `Remove ${stage.name} for ${first}`, act: () => onException('added', false) }
      : { label: 'Skip for this speaker', act: () => onException('skipped', true) })
  }

  // Under the cell, flipped above it near the bottom of the window, kept inside it sideways (as in the mockup).
  useLayoutEffect(() => {
    const place = () => {
      const p = ref.current
      if (!p) return
      const r = anchor.getBoundingClientRect()
      const w = p.offsetWidth
      const h = p.offsetHeight
      p.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`
      p.style.top = `${r.bottom + h + 12 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`
    }
    place()
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true) }
  }, [anchor])

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  // A click outside closes it; a click on its own cell is left to the cell, which toggles it.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose()
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [anchor, onClose])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose(); anchor.focus(); return }
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => { e.preventDefault(); buttons[(i + buttons.length) % buttons.length].focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(buttons.length - 1)
  }

  // The cell changed under the menu (an email went out meanwhile, say): nothing left to do here.
  if (items.length === 0) return null
  return (
    <div className="pop" role="menu" aria-label={`${first} · ${stage.name}`} ref={ref} onKeyDown={onKeyDown}>
      <div className="pop-h" aria-hidden="true">{first} · {stage.name}</div>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" disabled={it.disabled} title={it.disabled ? 'Template deleted' : undefined}
          onClick={() => { onClose(); anchor.focus(); it.act() }}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
