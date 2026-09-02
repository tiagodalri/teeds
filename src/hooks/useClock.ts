import { useSyncExternalStore } from 'react'

// Um único relógio atende toda a interface. Assim, dez operações abertas não
// criam dez timers independentes nem provocam várias repinturas por segundo.
let agora = Date.now()
let timer: ReturnType<typeof setInterval> | null = null
const ouvintes = new Set<() => void>()

function iniciar() {
  if (timer) return
  timer = setInterval(() => {
    agora = Date.now()
    ouvintes.forEach((avisar) => avisar())
  }, 1000)
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar)
  iniciar()
  return () => {
    ouvintes.delete(avisar)
    if (ouvintes.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const ler = () => agora

export function useClock() {
  return useSyncExternalStore(assinar, ler, ler)
}
