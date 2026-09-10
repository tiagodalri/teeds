import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Native top layer: never positioned relative to a robot grid/container. */
export function RobotDialog({ children, onCancel, busy = false, label }: {
  children: ReactNode; onCancel: () => void; busy?: boolean; label: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    ref.current?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      ref.current?.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const content = <dialog ref={ref} className="robot-launch-dialog" aria-label={label} aria-modal="true"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel() }}>
    {children}
  </dialog>
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
