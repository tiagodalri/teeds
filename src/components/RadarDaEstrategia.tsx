import { useEffect, useRef, useState } from 'react'
import { NomeDoRobo } from './NomeDoRobo'
import './radar-estrategia.css'

/**
 * O radar da estratégia (21/10/2026, pedido do Tiago): com o robô esperando
 * os loss virtuais, o cliente achava que ele estava parado. Agora a espera
 * é visível e explicada:
 *
 *  - um estado grande que muda de cor: Analisando o mercado → Quase lá →
 *    Entrada liberada (e "Recomeçando a contagem" quando a sequência zera);
 *  - as casas, uma por loss virtual, que se enchem com os dígitos de verdade;
 *  - uma frase sem jargão: "entra depois de 5 dígitos seguidos entre 0 e 6.
 *    Já foram 3, faltam 2";
 *  - o sinal de vida: quantos dígitos o robô já leu desde a última entrada.
 *
 * Tom da casa: o robô espera o SINAL DA ESTRATÉGIA; nunca "prevê" nem
 * "acerta". Não pede nada ao servidor: lê o mesmo estado da cabine.
 */

interface Props {
  nome: string
  valor: number
  alvo: number
  digitos: number[]
  ganhaCom: (d: number) => boolean
  ticksAnalisados: number
  /** Compra enviada ou contrato aberto. */
  operando: boolean
  /** A sequência ainda aberta: a próxima entrada sai sem nova análise. */
  emSequencia?: boolean
}

/** "entre 0 e 6", "entre 3 e 9", ou a lista quando não é uma faixa. */
function faixaQuePerde(ganhaCom: (d: number) => boolean): string {
  const l = Array.from({ length: 10 }, (_, d) => d).filter((d) => !ganhaCom(d))
  if (!l.length) return ''
  const contigua = l.every((d, i) => i === 0 || d === l[i - 1] + 1)
  return contigua ? `entre ${l[0]} e ${l[l.length - 1]}` : `em ${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`
}

export function RadarDaEstrategia({ nome, valor, alvo, digitos, ganhaCom, ticksAnalisados, operando, emSequencia = false }: Props) {
  const anterior = useRef(valor)
  const [zerou, setZerou] = useState<{ digito: number; chave: number } | null>(null)

  // a sequência quebrou: as casas esvaziam e a frase explica o porquê
  useEffect(() => {
    const antes = anterior.current
    anterior.current = valor
    if (!operando && antes > 0 && valor === 0) {
      const d = digitos[digitos.length - 1]
      if (d !== undefined) setZerou({ digito: d, chave: Date.now() })
    }
  }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!zerou) return; const t = window.setTimeout(() => setZerou(null), 2600); return () => window.clearTimeout(t) }, [zerou])

  const n = Math.min(valor, alvo)
  const faltam = Math.max(0, alvo - n)
  const faixa = faixaQuePerde(ganhaCom)
  const estado = operando || n >= alvo ? 'liberada' : emSequencia ? 'sequencia' : zerou && n === 0 ? 'zerou' : faltam === 1 ? 'quase' : 'analisando'
  // os dígitos que estão nas casas: os últimos n da fita (a sequência em curso)
  const nasCasas = n > 0 ? digitos.slice(-n) : []

  const titulo = {
    liberada: operando ? 'Entrada em andamento' : 'Entrada liberada',
    sequencia: 'Sequência em andamento',
    zerou: 'Recomeçando a contagem',
    quase: 'Quase lá',
    analisando: 'Analisando o mercado',
  }[estado]

  const frase = estado === 'liberada'
    ? <>Sinal da estratégia confirmado: {alvo} dígitos seguidos {faixa}. {operando ? 'A operação está aberta.' : 'Entrando agora.'}</>
    : estado === 'sequencia'
      ? <>A sequência está aberta: a próxima entrada sai sem esperar uma nova análise.</>
      : estado === 'zerou'
        ? <>Saiu {zerou!.digito}: a sequência quebrou. O robô recomeça a contagem do zero.</>
        : <>O <NomeDoRobo nome={nome} /> entra depois de <b>{alvo} dígitos seguidos {faixa}</b>. {n === 0 ? 'Esperando o primeiro.' : <>Já {n === 1 ? 'foi 1' : `foram ${n}`}, {faltam === 1 ? 'falta 1' : `faltam ${faltam}`}.</>}</>

  return (
    <div className={`radar ${estado}`} role="status" aria-live="polite" aria-label={`${titulo}: ${n} de ${alvo}`}>
      <div className="radar-disco" aria-hidden="true">
        <i className="radar-varredura" />
        <i className="radar-anel" />
        <b className="radar-conta">{estado === 'liberada' ? <svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg> : <>{n}<small>/{alvo}</small></>}</b>
      </div>

      <div className="radar-texto">
        <span className="radar-estado"><i aria-hidden="true" />{titulo}</span>
        <p>{frase}</p>
        <div className="radar-casas" style={{ ['--casas' as string]: alvo }} aria-hidden="true">
          {Array.from({ length: alvo }, (_, i) => {
            const d = nasCasas[i]
            const cheia = d !== undefined
            return (
              <span key={zerou ? `z${zerou.chave}-${i}` : i} className={`radar-casa ${cheia ? 'cheia' : ''} ${cheia && i === n - 1 ? 'nova' : ''}`}>
                {cheia ? d : ''}
              </span>
            )
          })}
        </div>
        <small className="radar-vida"><i aria-hidden="true" />{operando ? 'Operação aberta na Deriv' : `Analisando agora · ${ticksAnalisados.toLocaleString('pt-BR')} ${ticksAnalisados === 1 ? 'dígito lido' : 'dígitos lidos'} desde a última entrada`}</small>
      </div>
    </div>
  )
}
