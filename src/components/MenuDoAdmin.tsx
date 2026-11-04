/**
 * O menu lateral da Administração, em grupos (04/11/2026, Tiago: "estou achando confuso o menu
 * dividido dessa forma"). Eram 23 itens numa fila só, com assuntos misturados e três botões no fim
 * que abriam outra tela sem avisar. Agora:
 *
 *   - sem título, no topo: o que é de todo dia (Visão geral, Suporte, Organização);
 *   - grupos com título: Captação, Lançamento e contato, Clientes, Números, Configurações;
 *   - cada grupo fecha num clique e o aparelho lembra (Configurações nasce fechado);
 *   - entrar numa aba abre o grupo dela (quem chega em Planos por um atalho vê onde está); depois
 *     o grupo fecha normalmente se a pessoa clicar no título;
 *   - o item que abre outra tela (Central ao vivo, Monitoramento, Insights) leva a seta ↗.
 *
 * No celular o menu é a fila de abas que rola de lado (mobile-polish.css): lá os grupos não
 * fecham, e o título vira um rótulo pequeno entre os botões.
 */
import { useEffect, useState, type RefObject } from 'react'
import { Icone, type NomeIcone } from './Icone'
import './menu-do-admin.css'

export interface ItemDoMenu {
  id: string
  nome: string
  icone: NomeIcone
  /** O número ao lado (clientes, pendências). `urgente` pinta de vermelho. */
  selo?: { n: number; urgente?: boolean; dica?: string } | null
  /** Abre outra tela (fora do painel): ganha a seta ↗. */
  sai?: boolean
  onClick: () => void
}
export interface GrupoDoMenu { id: string; titulo: string | null; itens: ItemDoMenu[] }

const GUARDADO = 'adm-menu-fechados'
const FECHADOS_DE_INICIO = ['config']

function lerFechados(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(GUARDADO) ?? 'null')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : FECHADOS_DE_INICIO
  } catch { return FECHADOS_DE_INICIO }
}

export function MenuDoAdmin({ grupos, ativa, navRef }: { grupos: GrupoDoMenu[]; ativa: string; navRef?: RefObject<HTMLElement | null> }) {
  const [fechados, setFechados] = useState<string[]>(lerFechados)
  const alternar = (id: string) => setFechados((l) => {
    const novo = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]
    try { localStorage.setItem(GUARDADO, JSON.stringify(novo)) } catch { /* só não lembra neste aparelho */ }
    return novo
  })
  // entrar numa aba abre o grupo dela
  useEffect(() => {
    const g = grupos.find((x) => x.titulo && x.itens.some((i) => i.id === ativa))
    if (g) setFechados((l) => (l.includes(g.id) ? l.filter((x) => x !== g.id) : l))
  }, [ativa]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <nav ref={navRef as RefObject<HTMLElement>} aria-label="Menu da administração">
      {grupos.filter((g) => g.itens.length).map((g) => {
        const fechado = !!g.titulo && fechados.includes(g.id)
        return (
          <div key={g.id} className={`adm-grupo${g.titulo ? '' : ' adm-grupo-topo'}`}>
            {g.titulo && (
              <button type="button" className="adm-grupo-tit" aria-expanded={!fechado} onClick={() => alternar(g.id)}
                title={fechado ? `Mostrar ${g.titulo}` : `Esconder ${g.titulo}`}>
                <span>{g.titulo}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            )}
            <div className="adm-grupo-itens" data-fechado={fechado || undefined}>
              {g.itens.map((i) => (
                <button key={i.id} type="button" className={ativa === i.id ? 'on' : ''} onClick={i.onClick}
                  title={i.sai ? `${i.nome} (abre em outra tela)` : i.nome} aria-current={ativa === i.id ? 'page' : undefined}>
                  <i><Icone nome={i.icone} /></i>
                  <span>{i.nome}</span>
                  {i.selo && i.selo.n > 0 ? <b className={i.selo.urgente ? 'admin-fila-suporte' : undefined} title={i.selo.dica}>{i.selo.n.toLocaleString('pt-BR')}</b>
                    : i.sai ? <em className="adm-sai" aria-hidden="true">↗</em> : null}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
