/**
 * A linha do tempo de um aluno (Psicologia do aluno): cada aula, depósito, saque, bloco de operação, acesso
 * e conversa, em ordem, com o intervalo entre uma coisa e outra. Quando o intervalo conta uma história
 * (depositou 3 min depois da aula, religou 40 s depois de perder), ele vira um destaque entre os dois fatos.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { lerLinhaDoTempo, type AlunoDaPsicologia, type EventoDoAluno, type LinhaDoTempoDoAluno } from '../../../core/teeds/psicologia'
import { SeloDoParceiro } from '../../parceiros/SeloDoParceiro'
import { IconeFechar } from '../../IconeFechar'
import { PERFIS, inteiro, pc, plural, tempoCurto, usd } from './sacadas'

const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const chaveDoDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
const num = (v: unknown) => Number(v ?? 0)
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

type Cor = 'psi-c-aula' | 'psi-c-entra' | 'psi-c-sai' | 'psi-c-ganho' | 'psi-c-perda' | 'psi-c-neutro'
interface Fato { e: EventoDoAluno; ini: number; fim: number; cor: Cor; titulo: ReactNode; detalhe?: ReactNode; perdeu: boolean; ganhou: boolean; meta: boolean }

function lerFato(e: EventoDoAluno): Fato {
  const d = e.d, ini = Date.parse(e.em)
  const base = { e, ini, fim: ini, perdeu: false, ganhou: false, meta: false }
  switch (e.tipo) {
    case 'cadastro': return { ...base, cor: 'psi-c-neutro', titulo: 'Criou a conta na plataforma' }
    case 'termos': return { ...base, cor: 'psi-c-neutro', titulo: 'Aceitou os termos de uso' }
    case 'conta': return { ...base, cor: 'psi-c-neutro', titulo: d.real ? 'Conectou a conta real da corretora' : 'Conectou a conta de treino' }
    case 'aula': return { ...base, fim: ini + num(d.segundos) * 1000, cor: 'psi-c-aula', titulo: <>Abriu a aula <b>«{String(d.aula)}»</b></>,
      detalhe: `${d.concluida ? 'Concluiu' : `Parou em ${inteiro(num(d.ate))}%`} · ${tempoCurto(num(d.segundos) / 60)} assistidos${num(d.aberturas) > 1 ? ` · abriu ${inteiro(num(d.aberturas))} vezes` : ''}` }
    case 'aula_de_novo': return { ...base, cor: 'psi-c-aula', titulo: <>Voltou à aula <b>«{String(d.aula)}»</b></>, detalhe: `Já abriu ${inteiro(num(d.aberturas))} vezes` }
    case 'deposito': return { ...base, cor: 'psi-c-entra', titulo: <>Depositou <b>{usd(num(d.valor), 2)}</b></>, detalhe: d.saldo != null ? `Saldo depois: ${usd(num(d.saldo), 2)}` : undefined }
    case 'saque': return { ...base, cor: 'psi-c-sai', titulo: <>Sacou <b>{usd(num(d.valor), 2)}</b></>, detalhe: d.saldo != null ? `Saldo depois: ${usd(num(d.saldo), 2)}` : undefined }
    case 'ia': {
      const res = num(d.resultado), treino = !!d.demo, n = num(d.sessoes)
      const como = d.motivo === 'meta' ? 'terminou na meta' : d.motivo === 'stop' ? 'terminou no limite de perda' : d.motivo === 'zerou' ? 'parou porque o saldo acabou' : 'parou na mão'
      return { ...base, fim: Date.parse(String(d.ate)), cor: treino ? 'psi-c-neutro' : res < 0 ? 'psi-c-perda' : 'psi-c-ganho', perdeu: !treino && res < 0, ganhou: !treino && res > 0, meta: !treino && d.motivo === 'meta',
        titulo: <>{treino ? 'Treinou' : 'Operou'} com {String(d.ias)}: <b className={res < 0 ? 'psi-neg' : res > 0 ? 'psi-pos' : ''}>{usd(res, 2)}</b></>,
        detalhe: `${n > 1 ? `${inteiro(n)} sessões seguidas` : '1 sessão'} · ${plural(num(d.operacoes), 'operação', 'operações')} · ${como}${num(d.stops) > 1 ? ` · ${inteiro(num(d.stops))} limites de perda` : ''}${num(d.entrada_max) > num(d.entrada_min) ? ` · entrada de ${usd(num(d.entrada_min), 2)} até ${usd(num(d.entrada_max), 2)}` : ''}` }
    }
    case 'manual': {
      const res = num(d.resultado), treino = !!d.demo
      return { ...base, fim: Date.parse(String(d.ate)), cor: treino ? 'psi-c-neutro' : res < 0 ? 'psi-c-perda' : 'psi-c-ganho', perdeu: !treino && res < 0, ganhou: !treino && res > 0,
        titulo: <>{treino ? 'Treinou na manual' : 'Operou na manual'}: <b className={res < 0 ? 'psi-neg' : res > 0 ? 'psi-pos' : ''}>{usd(res, 2)}</b></>,
        detalhe: `${plural(num(d.operacoes), 'operação', 'operações')}, ${pc(num(d.ganhas), num(d.operacoes))} de acerto${num(d.entrada_max) > num(d.entrada_min) ? ` · entrada de ${usd(num(d.entrada_min), 2)} até ${usd(num(d.entrada_max), 2)}` : ''}` }
    }
    case 'suporte': return { ...base, cor: 'psi-c-neutro', titulo: 'Chamou o suporte', detalhe: d.assunto ? String(d.assunto) : undefined }
    case 'aviso_saldo': return { ...base, cor: 'psi-c-neutro', titulo: 'Viu o aviso de conta sem saldo', detalhe: `${plural(num(d.vezes), 'vez', 'vezes')} no dia${num(d.depositar) > 0 ? ' · tocou em Depositar' : ''}` }
    case 'aviso_clicado': return { ...base, cor: 'psi-c-neutro', titulo: <>Tocou no aviso do celular <b>«{String(d.titulo)}»</b></> }
    default: return { ...base, cor: 'psi-c-neutro', titulo: `Entrou na plataforma${d.aparelho ? ` pelo ${String(d.aparelho)}` : ''}`,
      detalhe: `${num(d.visitas) > 1 ? `${inteiro(num(d.visitas))} visitas · ` : ''}${tempoCurto(Math.min(num(d.segundos), 86_400) / 60)} no dia` }
  }
}

/** O intervalo entre dois fatos, quando ele conta uma história. */
function ponte(a: Fato, b: Fato): { texto: string; tom: 'ouro' | 'alerta' | 'bom' } | null {
  const min = Math.max(0, (b.ini - a.fim) / 60_000), opera = b.e.tipo === 'ia' || b.e.tipo === 'manual', treino = !!b.e.d.demo
  if (b.ini < a.ini) return null
  const t = tempoCurto(min)
  if ((a.e.tipo === 'aula' || a.e.tipo === 'aula_de_novo') && b.e.tipo === 'deposito' && min <= 60) return { texto: `Depositou ${t} depois da aula`, tom: 'ouro' }
  if (a.perdeu && b.e.tipo === 'deposito' && min <= 60) return { texto: `Depositou ${t} depois de perder`, tom: 'alerta' }
  if (a.perdeu && opera && !treino && min <= 5) return { texto: `Voltou a operar ${t} depois de perder`, tom: 'alerta' }
  if (a.meta && opera && !treino && min <= 10) return { texto: `Bateu a meta e voltou ${t} depois`, tom: 'ouro' }
  if (a.perdeu && (b.e.tipo === 'aula' || b.e.tipo === 'aula_de_novo') && min <= 360) return { texto: `Foi para a aula ${t} depois de perder`, tom: 'bom' }
  if (a.e.tipo === 'deposito' && opera && !treino && min <= 5) return { texto: `Operou ${t} depois de depositar`, tom: 'ouro' }
  if (a.e.tipo === 'saque' && b.e.tipo === 'deposito' && min <= 2880) return { texto: `Depositou de novo ${t} depois de sacar`, tom: 'ouro' }
  if (a.ganhou && b.e.tipo === 'saque' && min <= 1440) return { texto: `Sacou ${t} depois de ganhar`, tom: 'bom' }
  if (a.e.tipo === 'suporte' && b.e.tipo === 'deposito' && min <= 1440) return { texto: `Depositou ${t} depois de falar com o suporte`, tom: 'ouro' }
  if ((a.e.tipo === 'aula' || a.e.tipo === 'aula_de_novo') && opera && min <= 30) return { texto: `${treino ? 'Treinou' : 'Operou'} ${t} depois da aula`, tom: 'bom' }
  return null
}

export function LinhaDoTempo({ sessao, marca, userId, resumo, fechar }: { sessao: SessaoTeeds; marca: string; userId: string; resumo: AlunoDaPsicologia | null; fechar: () => void }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const [dados, setDados] = useState<LinhaDoTempoDoAluno | null>(null)
  const [erro, setErro] = useState(false)
  const [soDestaques, setSoDestaques] = useState(false)
  useEffect(() => {
    let vivo = true
    setDados(null); setErro(false)
    lerLinhaDoTempo(sessaoRef.current, marca, userId).then((d) => { if (vivo) setDados(d) }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [marca, userId])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar])

  const { dias, pontes, origens } = useMemo(() => {
    // o acesso do dia só entra quando não houve mais nada naquele dia (senão é ruído)
    const todos = (dados?.eventos ?? []).map(lerFato).sort((a, b) => a.ini - b.ini)
    const diaDe = (f: Fato) => chaveDoDia.format(new Date(f.ini))
    const comFato = new Set(todos.filter((f) => f.e.tipo !== 'acesso').map(diaDe))
    const fatos = todos.filter((f) => f.e.tipo !== 'acesso' || !comFato.has(diaDe(f)))
    // a ponte liga o fato ao último fato "de verdade" antes dele (acesso, termos e avisos não contam)
    const SEM_PONTE = ['acesso', 'termos', 'conta', 'aviso_saldo', 'aviso_clicado', 'cadastro']
    let anterior: Fato | null = null
    const linhas = fatos.map((f) => {
      const p = anterior && !SEM_PONTE.includes(f.e.tipo) ? ponte(anterior, f) : null
      const de: Fato | null = p ? anterior : null
      if (!SEM_PONTE.includes(f.e.tipo)) anterior = f
      return { f, ponte: p, de }
    })
    const porDia = new Map<string, typeof linhas>()
    for (const l of linhas) porDia.set(diaDe(l.f), [...(porDia.get(diaDe(l.f)) ?? []), l])
    return { dias: [...porDia.entries()].reverse(), pontes: linhas.filter((l) => l.ponte).length, origens: new Set(linhas.map((l) => l.de).filter(Boolean)) }
  }, [dados])

  const a = dados?.aluno
  const info = resumo ? (PERFIS[resumo.perfil] ?? PERFIS.operando) : null
  const nome = a?.nome ?? resumo?.nome ?? 'Aluno'
  const leitura: string[] = []
  if (resumo) {
    if (resumo.perdas >= 3) leitura.push(`Religou a I.A. em menos de 2 minutos em ${inteiro(resumo.revanches)} de ${inteiro(resumo.perdas)} perdas (${pc(resumo.revanches, resumo.perdas)}).`)
    if (resumo.metas >= 2) leitura.push(`Bateu a meta ${inteiro(resumo.metas)} vezes e continuou operando em ${inteiro(resumo.passou_meta)} delas.`)
    if (resumo.man_apos_perda >= 5) leitura.push(`Na manual, aumentou a entrada depois de perder em ${inteiro(resumo.man_dobras)} de ${inteiro(resumo.man_apos_perda)} vezes.`)
    if (resumo.zerou > 0) leitura.push(`Zerou o saldo no meio de uma sessão ${inteiro(resumo.zerou)} ${resumo.zerou === 1 ? 'vez' : 'vezes'}.`)
    if (resumo.madrugada >= 20) leitura.push(`${inteiro(resumo.madrugada)} operações de madrugada (${pc(resumo.madrugada, resumo.ops)} do total).`)
    if (resumo.dep_n > 0 && resumo.ops === 0) leitura.push('Depositou e ainda não fez nenhuma operação em conta real.')
    if (resumo.viu_ger) leitura.push('Concluiu a aula de gerenciamento ou a de meta diária.')
    else if (resumo.ops > 0) leitura.push('Ainda não concluiu a aula de gerenciamento.')
  }

  return (
    <div className="adm-modal-fundo psi-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget && e.clientX < e.currentTarget.clientWidth) fechar() }}>
      <section className="psi-ficha" role="dialog" aria-modal="true" aria-label={`Linha do tempo de ${nome}`} >
        <header>
          <span className="psi-av grande" aria-hidden="true">{(a?.foto_url ?? resumo?.foto_url) ? <img src={(a?.foto_url ?? resumo?.foto_url)!} alt="" /> : iniciais(nome)}</span>
          <div>
            <h3>{nome}{(a?.parceiro ?? resumo?.parceiro) ? <SeloDoParceiro codigo={(a?.parceiro ?? resumo?.parceiro)!} /> : null}</h3>
            <small>{resumo ? <span className={`psi-tag ${info!.tom}`}>{info!.nome}</span> : null}{a?.cidade ? `${a.cidade}${a.regiao ? `, ${a.regiao}` : ''}` : ''}</small>
          </div>
          <button type="button" className="psi-fechar" onClick={fechar} aria-label="Fechar"><IconeFechar /></button>
        </header>
        {resumo && (
          <div className="psi-ficha-nums">
            <span><small>Aulas concluídas</small><b>{inteiro(resumo.concl)}</b></span>
            <span><small>Depositou</small><b>{resumo.dep_n ? `${usd(resumo.dep_total)} em ${inteiro(resumo.dep_n)}` : '–'}</b></span>
            <span><small>Sacou</small><b>{resumo.saq_n ? usd(resumo.saq_total) : '–'}</b></span>
            <span><small>Markup gerado</small><b>{resumo.markup ? usd(resumo.markup, 2) : '–'}</b></span>
            <span><small>Resultado dele</small><b className={resumo.resultado < 0 ? 'psi-neg' : resumo.resultado > 0 ? 'psi-pos' : ''}>{resumo.ops ? usd(resumo.resultado, 2) : '–'}</b></span>
            <span><small>Saldo hoje</small><b>{usd(resumo.saldo, 2)}</b></span>
          </div>
        )}
        {resumo && <p className="psi-ficha-perfil"><b>{info!.nome}.</b> {info!.frase} <em>{info!.fazer}</em></p>}
        {leitura.length > 0 && <ul className="psi-leitura">{leitura.map((l) => <li key={l}>{l}</li>)}</ul>}
        <div className="psi-ficha-barra">
          <h4>Linha do tempo <small>{dados ? `${inteiro(pontes)} momento${pontes === 1 ? '' : 's'} em destaque` : ''}</small></h4>
          {pontes > 0 && <button type="button" aria-pressed={soDestaques} onClick={() => setSoDestaques((v) => !v)}>{soDestaques ? 'Ver tudo' : 'Só os destaques'}</button>}
        </div>
        {erro ? <p className="psi-erro" role="alert">Não foi possível abrir a linha do tempo agora. Feche e tente de novo.</p>
          : !dados ? <p className="psi-vazio">Montando a linha do tempo…</p>
          : !dias.length ? <p className="psi-vazio">Nenhum registro deste aluno ainda.</p>
          : (
            <div className="psi-tempo">
              {dias.map(([dia, linhas]) => {
                const visiveis = soDestaques ? linhas.filter((l) => l.ponte || origens.has(l.f)) : linhas
                if (!visiveis.length) return null
                return (
                  <div className="psi-dia" key={dia}>
                    <h5>{maiuscula(fmtDia.format(new Date(linhas[0].f.ini)))}</h5>
                    <ol>
                      {visiveis.map((l, i) => (
                        <li key={`${l.f.e.tipo}${l.f.ini}${i}`} className={l.f.cor}>
                          {l.ponte && <span className={`psi-ponte ${l.ponte.tom}`}>{l.ponte.texto}</span>}
                          <time>{fmtHora.format(new Date(l.f.ini))}</time>
                          <i aria-hidden="true" />
                          <span><b>{l.f.titulo}</b>{l.f.detalhe ? <small>{l.f.detalhe}</small> : null}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              })}
            </div>
          )}
      </section>
    </div>
  )
}
