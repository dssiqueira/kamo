// Menu button (WAI-ARIA menu button pattern): an icon button that opens a short list of
// actions. Enter, Space or ArrowDown open it on the first item, ArrowUp on the last; arrows,
// Home and End move between items; Esc closes it and puts focus back on the button; Tab or a
// click outside close it.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { FOCUS_RING } from './controls.tsx'

export interface MenuItem {
  /** Stable key. */
  id: string
  /** Already translated. */
  label: string
  icon?: ReactNode
  tone?: 'default' | 'danger'
  onSelect(): void
}

export interface MenuButtonProps {
  /** Accessible name and tooltip of the button (already translated). */
  label: string
  /** Shorter tooltip; defaults to `label`. */
  title?: string
  icon: ReactNode
  items: readonly MenuItem[]
  /** The button, so the caller can put focus back on it after an item's own popover. */
  buttonRef?: RefObject<HTMLButtonElement | null>
}

/** DESIGN.md: floating element, thin border, soft shadow (menus). */
const MENU =
  'absolute end-0 top-full z-20 mt-xs flex min-w-[200px] flex-col rounded-lg border border-border bg-surface p-xs shadow-[0_8px_24px_rgba(0,0,0,0.1)]'

export function MenuButton({ label, title, icon, items, buttonRef }: MenuButtonProps) {
  const [open, setOpen] = useState<null | 'first' | 'last'>(null)
  const ownButton = useRef<HTMLButtonElement>(null)
  const button = buttonRef ?? ownButton
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = (focusButton: boolean) => {
    setOpen(null)
    if (focusButton) button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const entries = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    entries?.[open === 'first' ? 0 : entries.length - 1]?.focus()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (menu.current?.contains(target) || button.current?.contains(target)) return
      setOpen(null)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, button])

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(event.key === 'ArrowDown' ? 'first' : 'last')
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = entries.indexOf(document.activeElement as HTMLElement)
    const focusAt = (next: number) => entries[(next + entries.length) % entries.length]?.focus()
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index < 0 ? -1 : index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(-1)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close(true)
        break
      case 'Tab':
        // Focus moves on to the next control as usual; the menu just goes away.
        setOpen(null)
        break
    }
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        {...(open ? { 'aria-controls': menuId } : {})}
        onClick={() => setOpen((current) => (current ? null : 'first'))}
        onKeyDown={onButtonKeyDown}
        className={`flex size-[32px] items-center justify-center rounded-md text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface-raised hover:text-on-surface ${
          open ? 'bg-surface-raised text-on-surface' : ''
        } ${FOCUS_RING}`}
      >
        {icon}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={MENU}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                // Focus goes back to the button first, so an item that opens its own popover
                // (rename field, checklist, confirmation) can take it from there.
                close(true)
                item.onSelect()
              }}
              className={`flex items-center gap-sm rounded-md px-sm py-xs text-start text-body transition-colors duration-[120ms] hover:bg-surface-raised focus:bg-surface-raised focus:outline-none ${
                item.tone === 'danger' ? 'text-error' : 'text-on-surface'
              }`}
            >
              {item.icon && (
                <span
                  className={item.tone === 'danger' ? 'text-error' : 'text-on-surface-muted'}
                  aria-hidden
                >
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
