import { useEffect, useState } from 'react'
import { Monograma } from '../marca/Monograma'
import { SERVIDOR } from '../../core/teeds/config'
import './cena-login.css'

/**
 * A cena da tela de entrada (21/10/2026, pedido do Victor: "todo branco está
 * vago; algo com o nome: nuvens, global, voo; escuro, sem roubar a cena").
 *
 * O brandbook pede evitar avião literal (pág. 20) e priorizar perspectiva
 * global, luz direcional e movimento controlado. Então o voo aparece sem o
 * avião: acima das nuvens na hora azul, com o fio de ouro no horizonte
 * ("nuvens"), ou o rastro de um jato cruzando o céu na diagonal do
 * monograma ("rastro"). Tudo escurecido no Azul GF; a imagem desliza bem
 * devagar. O formulário continua o protagonista, em marfim sólido.
 */

export type VarianteDaCena = 'nuvens' | 'rastro'

const FOTOS: Record<VarianteDaCena, { credito: string }> = {
  nuvens: { credito: 'Foto: leehasacamera · CC BY 2.0' },
  rastro: { credito: 'Foto: Shtirlitz74 · CC BY 4.0' },
}
type Cotacao = { id: string; nome: string; preco: number; variacao: number; moeda: string }
const QUERO = ['dolar', 'ibovespa', 'sp500', 'bitcoin']
const preco = (c: Cotacao) => {
  const n = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  if (c.moeda === 'pts') return n(c.preco, 0)
  if (c.id === 'bitcoin') return `${c.moeda} ${n(c.preco, 0)}`
  return `${c.moeda} ${n(c.preco, c.moeda === 'R$' ? 3 : 2)}`
}

export function CenaDoLogin({ variante }: { variante: VarianteDaCena }) {
  const base = import.meta.env.BASE_URL
  const [mercado, setMercado] = useState<Cotacao[]>([])

  // o mercado ao vivo, discreto no rodapé da cena (a mesma fonte da aba Notícias; só no computador)
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1000px)').matches) return
    let vivo = true
    fetch(`${SERVIDOR.url}/publico/mercado`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.cotacoes) setMercado(QUERO.map((id) => (d.cotacoes as Cotacao[]).find((c) => c.id === id)).filter((c): c is Cotacao => !!c)) })
      .catch(() => undefined)
    return () => { vivo = false }
  }, [])

  return (
    <aside className={`entrada-cena ${variante}`}>
      <picture className="entrada-cena-foto" aria-hidden="true">
        <source media="(max-width: 999px)" srcSet={`${base}login-globalfly/${variante}-celular.webp`} />
        <img src={`${base}login-globalfly/${variante}.webp`} alt="" {...{ fetchpriority: 'high' }} decoding="async" />
      </picture>
      <div className="entrada-cena-veu" aria-hidden="true" />
      {variante === 'nuvens' && <i className="entrada-cena-eixo" aria-hidden="true" />}

      <div className="entrada-cena-texto">
        <Monograma tamanho={58} rotulo="GlobalFly Trade" />
        <h2>Precisão para navegar mercados em movimento.</h2>
        <p>Tecnologia, método e visão global.</p>
      </div>

      {mercado.length > 0 && (
        <ul className="entrada-cena-mercado" aria-label="Mercado agora">
          {mercado.map((c) => (
            <li key={c.id}>
              <span>{c.nome}</span>
              <b>{preco(c)}</b>
              <em className={c.variacao >= 0 ? 'sobe' : 'cai'}>{c.variacao >= 0 ? '+' : '−'}{Math.abs(c.variacao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</em>
            </li>
          ))}
        </ul>
      )}
      <small className="entrada-cena-credito">{FOTOS[variante].credito}</small>
    </aside>
  )
}
