/**
 * A plataforma que o administrador está vendo — uma só, para todas as telas.
 *
 * O foco já existia (`marcaAdmin()` / `definirMarcaAdmin()` em `clientes.ts`),
 * mas como variável de módulo: só a Administração sabia dele, e só porque
 * guardava uma cópia no próprio estado. O Monitoramento e os Insights ficavam
 * de fora, cada um resolvendo a marca do seu jeito — e foi daí que saíram os
 * dois defeitos de 06/10/2026:
 *
 *  - a aprovação mostrava os cadastros da Teeds sob o título "OMNI Admin";
 *  - o monitoramento virava "Sem nome" porque procurava os clientes da Teeds
 *    entre os da OMNI.
 *
 * Com o seletor visível nas três telas, a marca deixa de ser estado invisível:
 * ela está escrita na tela em que você está. E como o valor é o MESMO objeto,
 * trocar num lugar troca em todos — sem uma tela ficar para trás.
 *
 * `useSyncExternalStore` em vez de contexto React: o foco já era global e é
 * lido por funções que não são componentes (`filtroMarca()` monta a URL das
 * consultas). Um contexto obrigaria a reescrever esse caminho inteiro; o
 * evento de janela avisa quem está montado e mantém o resto como está.
 */
import { useSyncExternalStore } from 'react'
import { definirMarcaAdmin, marcaAdmin, REDE } from './clientes'

const EVENTO = 'marca-em-foco'

function assinar(callback: () => void) {
  window.addEventListener(EVENTO, callback)
  return () => window.removeEventListener(EVENTO, callback)
}

/** A marca em foco agora, reagindo a quem trocar em qualquer tela. */
export function useMarcaEmFoco(): [string, (id: string) => void] {
  const valor = useSyncExternalStore(assinar, marcaAdmin, () => marcaAdmin())
  const trocar = (id: string) => {
    // Quem não é master não troca de marca: `definirMarcaAdmin` já garante
    // isso, e aqui a gente lê de volta em vez de confiar no que foi pedido.
    definirMarcaAdmin(id)
    if (marcaAdmin() !== valor) window.dispatchEvent(new Event(EVENTO))
  }
  return [valor, trocar]
}

export { REDE }
