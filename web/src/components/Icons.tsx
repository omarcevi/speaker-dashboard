// One outline icon set (1.5px stroke, 16px grid), drawn for this app. Decorative: callers label the control.
import type { ReactNode } from 'react'

function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconList = () => <Icon><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.5" cy="4" r=".6" fill="currentColor" /><circle cx="2.5" cy="8" r=".6" fill="currentColor" /><circle cx="2.5" cy="12" r=".6" fill="currentColor" /></Icon>
export const IconMap = () => <Icon><circle cx="4" cy="5" r="1.6" /><circle cx="11" cy="4" r="1.6" /><circle cx="6.5" cy="11" r="1.6" /><circle cx="12" cy="11.5" r="1.6" /></Icon>
export const IconBag = () => <Icon><rect x="2" y="5" width="12" height="8.5" rx="2" /><path d="M5.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5M2 9h12" /></Icon>
export const IconTeam = () => <Icon><circle cx="6" cy="5.5" r="2.3" /><path d="M1.8 13.5c.5-2.4 2.1-3.5 4.2-3.5s3.7 1.1 4.2 3.5M10.5 3.4a2.2 2.2 0 0 1 0 4.2M12 10.2c1.1.5 1.8 1.6 2.1 3.3" /></Icon>
export const IconUpload = () => <Icon><path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5" /></Icon>
export const IconOut = () => <Icon><path d="M6 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2M10.5 11 13.5 8l-3-3M13.5 8H6" /></Icon>
export const IconSearch = () => <Icon size={14}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></Icon>
export const IconRefresh = () => <Icon size={14}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" /></Icon>
export const IconLeft = () => <Icon size={14}><path d="M10 3 5 8l5 5" /></Icon>
export const IconRight = () => <Icon size={14}><path d="m6 3 5 5-5 5" /></Icon>
export const IconMail = () => <Icon><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m2.5 4.5 5.5 4 5.5-4" /></Icon>
export const IconPhone = () => <Icon><path d="M4.5 2h2l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1v2a1.5 1.5 0 0 1-1.5 1.5A11.5 11.5 0 0 1 3 3.5 1.5 1.5 0 0 1 4.5 2Z" /></Icon>
export const IconLink = () => <Icon><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></Icon>
export const IconMenu = () => <Icon size={18}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></Icon>
export const IconDownload = () => <Icon size={14}><path d="M8 2.5V10M5 7l3 3 3-3M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5" /></Icon>
export const IconScreen = () => <Icon size={14}><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" /><path d="M8 11v2.5M5 13.5h6" /></Icon>

// The product mark: the four status colours as four dots, with the event's name.
export function Mark() {
  return (
    <>
      <span className="dots" aria-hidden="true">
        <i style={{ background: 'var(--pend)' }} /><i style={{ background: 'var(--no)' }} />
        <i style={{ background: 'var(--maybe)' }} /><i style={{ background: 'var(--ok)' }} />
      </span>
      <span><b>DevFest Istanbul</b><span>Speakers 2026</span></span>
    </>
  )
}
