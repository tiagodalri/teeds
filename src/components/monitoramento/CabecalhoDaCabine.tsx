/**
 * O cabeçalho da cabine espelho (Monitoramento › Mosaico › cliente). 10/11/2026, Tiago: "sem layout sem
 * design sem nada, infos jogadas". À esquerda quem é (voltar, iniciais, nome e a ficha da conta); à direita
 * o estado (ao vivo ou replay, somente visualização, fechar), numa linha só, no padrão das Sessões
 * encerradas (40 px, cantos de 10 px, 20 px de borda). Laboratório: ?tela=cabine-topo.
 */
import type { RefObject } from 'react'
import { mascararConta, mascararEmail, type Integridade, type Saude } from '../../core/teeds/espelho'
import { MARCA } from '../../marca'
import { IconeFechar } from '../IconeFechar'
import './cabine-topo.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

export const ROTULO_SAUDE: Record<Saude, string> = { 'ao-vivo': 'Ao vivo', atencao: 'Atenção', desatualizado: 'Desatualizado', encerrada: 'Encerrada' }
const ROTULO_INTEGRIDADE: Record<Integridade, string> = { completo: 'Histórico completo', carregando: 'Carregando histórico…', lacunas: 'Histórico com lacunas', indisponivel: 'Histórico indisponível', 'em-andamento': 'Sessão em andamento' }
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const segundos = (s: number) => s.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** As iniciais do nome (ou do e-mail mascarado) para o selo redondo. */
export const iniciaisDe = (nome?: string | null) =>
  (nome ?? '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'

export function CabecalhoDaCabine({ refVoltar, aoFechar, rotuloVoltar = 'Mosaico', nome, selo, email, contaId, demo, moeda, saldo, dois, modo, saude, idade, rtt, desvio, passo, integridade }: {
  refVoltar?: RefObject<HTMLButtonElement>
  aoFechar: () => void
  /** O texto do botão de voltar (a cabine da manual volta para "Operações manuais"). */
  rotuloVoltar?: string
  nome: string
  /** O parceiro do cliente (Naor /n, Victor /v, Direto), como na lista das Sessões encerradas. */
  selo?: { texto: string; codigo: string } | null
  email?: string | null
  contaId: string
  demo: boolean
  moeda: string
  /** Saldo da conta Deriv (o espelho traz desde 10/11/2026). Sem número, o bloco não aparece. */
  saldo?: number | null
  /** Ao vivo (10/11/2026): saldo real e saldo demo juntos; a conta em uso fica em destaque. */
  dois?: { real: number | null; demo: number | null }
  modo: 'ao-vivo' | 'replay'
  saude: Saude
  idade: number | null
  rtt: number | null
  desvio: number | null
  passo?: { indice: number; total: number; horaOriginal: number; lacuna: number }
  integridade?: Integridade
}) {
  return (
    <header className="cbt">
      <button ref={refVoltar} className="cbt-voltar" onClick={aoFechar}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {rotuloVoltar}
      </button>
      <div className="cbt-quem">
        <span className="cbt-avatar" aria-hidden="true">{iniciaisDe(nome)}</span>
        <div className="cbt-nome">
          <div className="cbt-titulo">
            <h2 title={nome}>{nome}</h2>
            {selo && <SeloDoParceiro codigo={selo.codigo} nome={selo.texto} tamanho="m" />}
          </div>
          <ul className="cbt-meta">
            <li className={`cbt-conta ${demo ? 'demo' : 'real'}`}>{demo ? 'Conta demo' : 'Conta real'}</li>
            {email && <li>{mascararEmail(email)}</li>}
            <li>Conta {mascararConta(contaId)}</li>
            <li>{moeda}</li>
            <li>{MARCA.prosa}</li>
          </ul>
        </div>
      </div>
      {dois && (dois.real !== null || dois.demo !== null) ? (
        <div className="cbt-saldos">
          {(['real', 'demo'] as const).map((t) => (
            <div key={t} className={`cbt-saldo ${t} ${(t === 'demo') === demo ? 'em-uso' : 'outro'}`}
              title={(t === 'demo') === demo ? 'Conta em que a I.A. está operando: saldo ao vivo da Deriv' : 'Último saldo que o app do cliente leu desta conta'}>
              <small>{t === 'real' ? 'Saldo real' : 'Saldo demo'}</small>
              <b>{dois[t] !== null ? <>{dois[t]!.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span>{moeda}</span></> : '—'}</b>
            </div>
          ))}
        </div>
      ) : typeof saldo === 'number' && (
        <div className={`cbt-saldo ${demo ? 'demo' : 'real'}`} title="Saldo da conta na Deriv">
          <small>{modo === 'replay' ? 'Saldo neste momento' : 'Saldo da conta'}</small>
          <b>{saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span>{moeda}</span></b>
        </div>
      )}
      <div className="cbt-estado">
        {modo === 'replay'
          ? <span className="cbt-status replay"><i aria-hidden="true" /><b>Replay</b>
              {passo && <small>{hora(passo.horaOriginal)}</small>}
              {passo && <small>Evento {passo.indice + 1}/{passo.total}</small>}
              {passo?.lacuna ? <small>Lacuna de {passo.lacuna}</small> : null}
              {integridade && <small>{ROTULO_INTEGRIDADE[integridade]}</small>}
            </span>
          : <span className={`cbt-status ${saude}`} role="status"><i aria-hidden="true" /><b>{ROTULO_SAUDE[saude]}</b>
              {idade != null && saude !== 'encerrada' && <small className="cbt-num">Atualizado há {segundos(idade)} s</small>}
              {rtt != null && <small className="cbt-num">Canal ~{rtt} ms</small>}
              {desvio != null && Math.abs(desvio) >= 2 && <small>Relógio do servidor ≈ {desvio > 0 ? '−' : '+'}{segundos(Math.abs(desvio))} s</small>}
            </span>}
        <span className="cbt-leitura" title="Você só acompanha: nada aqui mexe na cabine do cliente">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
          Somente visualização
        </span>
        <button className="cbt-fechar" onClick={aoFechar} aria-label="Fechar a cabine espelho"><IconeFechar /></button>
      </div>
    </header>
  )
}
