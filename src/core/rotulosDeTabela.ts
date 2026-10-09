/**
 * Copia os nomes das colunas para cada célula, para a tabela virar cartão no celular.
 *
 * As tabelas da Administração (resultados, depósitos, leads, acessos, robôs)
 * são grades de `div`: um cabeçalho `.cab` com os nomes das colunas e linhas
 * de células. No computador o cabeçalho está em cima de tudo; no celular cada
 * linha vira um cartão, o cabeçalho some, e cada célula precisa dizer o que é.
 *
 * Aqui só se ESCREVE um atributo (`data-rotulo`); quem desenha é o CSS de
 * celular (`mobile-polish.css`). No computador o atributo existe e ninguém o
 * lê, então nada muda.
 *
 * Roda só dentro da Administração (quem chama é o AdminPanel), nunca nas telas
 * de cliente: a cabine ao vivo muda o DOM várias vezes por segundo e não pode
 * pagar por um observador que não serve a ela.
 */
export const TABELAS_EM_CARTAO = '.rc-tabela, .leads-tabela, .admin-robo-table'

/** Põe em cada célula o nome da sua coluna. Idempotente: só escreve o que mudou. */
export function rotularTabela(tabela: Element): void {
  const cab = [...tabela.children].find((c) => c.classList.contains('cab'))
  if (!cab) return
  const rotulos = [...cab.children].map((c) => (c.textContent ?? '').replace(/[↑↓▲▼⇅]/g, '').trim())
  for (const linha of tabela.children) {
    if (linha === cab) continue
    ;[...linha.children].forEach((celula, i) => {
      const r = rotulos[i]
      if (r && celula.getAttribute('data-rotulo') !== r) celula.setAttribute('data-rotulo', r)
    })
  }
}

/**
 * Observa um pedaço da tela e rotula toda tabela que aparecer ou mudar nele.
 * Só olha filhos entrando e saindo (não atributos), então escrever o rótulo
 * não dispara de novo. As mudanças de um mesmo quadro são juntadas.
 */
export function observarTabelas(raiz: Element): () => void {
  let pendente = 0
  const rodar = () => { pendente = 0; raiz.querySelectorAll(TABELAS_EM_CARTAO).forEach(rotularTabela) }
  rodar()
  const obs = new MutationObserver(() => { if (!pendente) pendente = requestAnimationFrame(rodar) })
  obs.observe(raiz, { childList: true, subtree: true })
  return () => { obs.disconnect(); if (pendente) cancelAnimationFrame(pendente) }
}
