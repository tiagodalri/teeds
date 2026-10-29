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
    // O showModal põe o foco no primeiro botão (o "fechar"), que abria com o
    // anel dourado de foco, parecendo selecionado. O foco fica no próprio
    // diálogo; o Tab continua levando ao primeiro botão (29/10/2026).
    ref.current?.focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    return () => {
      ref.current?.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const content = <dialog ref={ref} className="robot-launch-dialog" aria-label={label} aria-modal="true" tabIndex={-1}
    onCancel={e => { e.preventDefault(); if (!busy) onCancel() }}>
    {children}
  </dialog>
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
