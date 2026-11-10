/**
 * "Em conta real agora" no topo do Monitoramento ao vivo (10/11/2026, Tiago: "ta mostrando [na Visão
 * geral] que tem 1 pessoa operando na real, mas quando clico pra ir pro monitoramento não vejo ninguém
 * operando na real. Garanta que a informação está certa e atualizada em tempo real").
 *
 * O número vem da MESMA leitura do card da Visão geral (teeds_painel_visao_geral, bloco `agora`): mesmas
 * regras, mesma equipe fora, mesmo parceiro do topo. Assim os dois painéis nunca dizem coisas diferentes.
 * Relê a cada 15 s com a tela à vista e, além disso, logo depois de qualquer mudança em conta real que o
 * Monitoramento recebe ao vivo (I.A. que liga ou para, operação manual que abre ou fecha): `sinal` muda e a
 * leitura vem em ~1 s, sem esperar o relógio.
 *
 * Sem permissão para essa leitura (o banco só a libera para a administração plena), cai no que o próprio
 * Monitoramento vê ao vivo, sem a banca.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import { MARCA } from '../../marca'
import './em-conta-real-agora.css'

interface Agora { operando_real: number; banca_operando_real: number; ias_real: number; manuais_real: number }

async function lerAgora(sessao: SessaoTeeds, marca: string, parceiro: string): Promise<Agora> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_painel_visao_geral`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error(`painel ${r.status}`)
  const d = await r.json()
  return d.agora as Agora
}

const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')

export function EmContaRealAgora({ sessao, marcas, parceiro, sinal, local, soReal, onVerQuem, onVerTodas }: {
  sessao: SessaoTeeds
  marcas: string[]
  parceiro: string
  /** Muda quando chega, ao vivo, alguma mudança em conta real: relê na hora. */
  sinal: string
  /** O que o próprio Monitoramento vê (para quando a leitura do banco não é permitida). */
  local: { pessoas: number; ias: number; manuais: number }
  /** O filtro "Só real" está ligado. */
  soReal: boolean
  onVerQuem: () => void
  onVerTodas: () => void
}) {
  const [agora, setAgora] = useState<Agora | null>(null)
  const [semLeitura, setSemLeitura] = useState(false)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const ler = useRef<() => void>(() => undefined)

  useEffect(() => {
    let vivo = true
    let t = 0
    ler.current = () => {
      window.clearTimeout(t)
      void Promise.all(marcas.map((m) => lerAgora(sessaoRef.current, m, parceiro)))
        .then((l) => {
          if (!vivo) return
          // Na Rede soma as plataformas (uma pessoa só existe numa marca).
          setAgora(l.reduce((s, a) => ({
            operando_real: s.operando_real + Number(a.operando_real || 0),
            banca_operando_real: s.banca_operando_real + Number(a.banca_operando_real || 0),
            ias_real: s.ias_real + Number(a.ias_real || 0),
            manuais_real: s.manuais_real + Number(a.manuais_real || 0),
          }), { operando_real: 0, banca_operando_real: 0, ias_real: 0, manuais_real: 0 }))
          setSemLeitura(false)
        })
        .catch(() => { if (vivo) setSemLeitura(true) })
        .finally(() => { if (vivo) t = window.setTimeout(() => ler.current(), document.visibilityState === 'hidden' ? 120_000 : 15_000) })
    }
    ler.current()
    const voltou = () => { if (document.visibilityState === 'visible') ler.current() }
    document.addEventListener('visibilitychange', voltou)
    return () => { vivo = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', voltou) }
  }, [marcas.join(','), parceiro]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mudança em conta real chegou ao vivo: relê em 1 s (o tempo de o registro assentar no banco).
  const primeiro = useRef(true)
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return }
    const t = window.setTimeout(() => ler.current(), 1000)
    return () => window.clearTimeout(t)
  }, [sinal])

  const n = semLeitura || !agora ? local : { pessoas: agora.operando_real, ias: agora.ias_real, manuais: agora.manuais_real }
  if (!semLeitura && !agora) return null
  const pessoas = n.pessoas
  const ia = MARCA.vocabularioIA ? 'I.A.' : n.ias === 1 ? 'robô' : 'robôs'

  return (
    <div className={`mra${pessoas > 0 ? ' com-real' : ''}`} role="status" aria-live="polite">
      <i className="mra-ponto" aria-hidden="true" />
      {pessoas > 0 ? (
        <p>
          <b>{int(pessoas)} {pessoas === 1 ? 'pessoa operando' : 'pessoas operando'} em conta real agora</b>
          {agora && !semLeitura && <>, somando <em>{dinheiro(agora.banca_operando_real, 'USD')}</em> de banca</>}
          <small>{int(n.ias)} {ia} em real · {int(n.manuais)} {n.manuais === 1 ? 'manual' : 'manuais'}{semLeitura ? '' : ' · Sem contar a equipe'}</small>
        </p>
      ) : (
        <p><b>Ninguém operando em conta real neste minuto</b><small>{semLeitura ? 'Pelo que o Monitoramento vê ao vivo' : 'Sem contar a equipe'}</small></p>
      )}
      {soReal
        ? <button type="button" onClick={onVerTodas}>Mostrar demo também</button>
        : pessoas > 0 && <button type="button" className="mra-ver" onClick={onVerQuem}>Ver quem ›</button>}
    </div>
  )
}
