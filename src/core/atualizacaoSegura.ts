/*
 * Atualização segura (23/11/2026). Uma publicação recarregou a tela de todos
 * no meio de uma chamada em que o Tiago operava junto com os alunos, e eles
 * perderam na operação. Tiago: "tem que aparecer um aviso, há uma nova versão
 * disponível. Só atualizar a tela se a pessoa clicar ou se ela não estiver
 * fazendo nada".
 *
 * Regra: o app NUNCA se recarrega sozinho por causa de versão nova enquanto há
 * operação manual aberta, compra esperando confirmação ou I.A. ligada. Ele
 * mostra o aviso "Nova versão disponível" e só recarrega:
 *  - quando a pessoa toca em "Atualizar"; ou
 *  - quando nada está em andamento E a pessoa está parada há PARADO_MS.
 *
 * O estado mora em `window`, não no módulo: quando uma tela separada baixa a
 * versão nova do app, a segunda cópia precisa enxergar o que a primeira marcou.
 */

const PARADO_MS = 3 * 60_000
const CHECAGEM_MS = 15_000

type Global = {
  __atualizacao?: {
    emUso: Record<string, boolean>
    ultimoToque: number
    pendente: string | null
    motivo: 'versao' | 'tela' | null
    vigia: number | null
    /** Quem recarrega (main.tsx limpa as peças guardadas antes). */
    recarregador: ((versao: string | null, porClique: boolean) => void) | null
  }
}
const g = window as unknown as Global
const estado = (g.__atualizacao ??= { emUso: {}, ultimoToque: Date.now(), pendente: null, motivo: null, vigia: null, recarregador: null })

// a primeira cópia registra os toques; a segunda usa os mesmos números
if (!(window as unknown as { __atualizacaoToques?: boolean }).__atualizacaoToques) {
  (window as unknown as { __atualizacaoToques?: boolean }).__atualizacaoToques = true
  const tocou = () => { estado.ultimoToque = Date.now() }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, tocou, { passive: true, capture: true })
}

/** main.tsx entrega a recarga que limpa as peças guardadas da versão anterior. */
export function definirRecarregador(fn: (versao: string | null, porClique: boolean) => void): void { estado.recarregador = fn }

/** Marca (ou desmarca) algo em andamento: posição manual aberta, I.A. ligada… */
export function marcarEmUso(chave: string, ativo: boolean): void {
  if (ativo) estado.emUso[chave] = true
  else delete estado.emUso[chave]
}

/** Há operação, compra ou I.A. em andamento nesta página. */
export const emOperacao = (): boolean => Object.keys(estado.emUso).length > 0

const parado = () => Date.now() - estado.ultimoToque >= PARADO_MS

function recarregar(versao: string | null, porClique = false): void {
  if (estado.recarregador) { estado.recarregador(versao, porClique); return }
  const u = new URL(location.href)
  u.searchParams.set('v', versao || Date.now().toString(36))
  location.replace(u.toString())
}

/**
 * Pode recarregar agora, sem prejudicar ninguém? Só quando nada está em
 * andamento e a pessoa não mexe na tela há alguns minutos.
 */
export const podeRecarregarSozinho = (): boolean => !emOperacao() && parado()

function mostrarAviso(): void {
  if (document.getElementById('aviso-versao')) { atualizarTexto(); return }
  const aviso = document.createElement('div')
  aviso.id = 'aviso-versao'
  aviso.setAttribute('role', 'status')
  aviso.innerHTML = '<span data-texto></span>'
    + '<button type="button" data-atualizar>Atualizar</button><button type="button" data-depois>Depois</button>'
  aviso.querySelector('[data-atualizar]')!.addEventListener('click', () => recarregar(estado.pendente, true))
  aviso.querySelector('[data-depois]')!.addEventListener('click', () => aviso.remove())
  document.body.appendChild(aviso)
  atualizarTexto()
}

function atualizarTexto(): void {
  const t = document.querySelector('#aviso-versao [data-texto]')
  if (!t) return
  const tela = estado.motivo === 'tela'
  t.innerHTML = tela
    ? '<b>Nova versão disponível.</b> Atualize para abrir esta tela.'
    : '<b>Nova versão disponível.</b> Atualize quando quiser'
      + (emOperacao() ? ': esperamos você terminar o que está em andamento.' : '.')
}

/**
 * Chegou versão nova (ou uma tela separada só abre na versão nova). Avisa e
 * espera o momento certo; nunca recarrega no meio de uma operação.
 */
export function pedirAtualizacao(versao: string | null, motivo: 'versao' | 'tela' = 'versao'): void {
  estado.pendente = versao ?? estado.pendente
  if (motivo === 'tela' || !estado.motivo) estado.motivo = motivo
  // nada em andamento e a pessoa acabou de pedir uma tela que só existe na versão nova: atualiza já
  if (motivo === 'tela' && !emOperacao()) recarregar(estado.pendente)
  mostrarAviso()
  if (estado.vigia !== null) return
  estado.vigia = window.setInterval(() => {
    atualizarTexto()
    if (podeRecarregarSozinho()) recarregar(estado.pendente)
  }, CHECAGEM_MS)
}
