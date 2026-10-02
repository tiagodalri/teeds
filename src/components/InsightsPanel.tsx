import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MODULOS, todasAsAulas } from '../core/teeds/aulas'
import {
  horasLegiveis, idiomaLegivel, lerAcessosPorDia, lerAcessosPorHora, lerAlunos, lerAulas, lerDispositivos, lerLocalizacoes,
  lerOrigens, lerResumo, lerVisitas, lerVisitasPorDia, lugarDoFuso, nomeDaOrigem,
  type AcessoDia, type AcessoHora, type AlunoInsight, type AulaInsight, type Dispositivo, type Localizacao,
  type OrigemVisita, type ResumoInsights, type ResumoVisitas, type VisitaDia,
} from '../core/teeds/insights'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'

/**
 * Insights — o painel de inteligência da plataforma.
 *
 * Quem entrou, quando, de onde, por quanto tempo; quem assistiu cada aula
 * e até onde. Tudo agregado no banco por dia; a tela só desenha.
 */

type Periodo = 7 | 30 | 90
const inteiro = (n: number) => n.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const diaCurto = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const semana = (iso: string) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(`${iso}T12:00:00`).getDay()]
const quando = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function InsightsPanel({ sessao }: { sessao: SessaoTeeds }) {
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [resumo, setResumo] = useState<ResumoInsights | null>(null)
  const [dias, setDias] = useState<AcessoDia[]>([])
  const [horas, setHoras] = useState<AcessoHora[]>([])
  const [aulasDados, setAulasDados] = useState<AulaInsight[]>([])
  const [lugares, setLugares] = useState<Localizacao[]>([])
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([])
  const [alunos, setAlunos] = useState<AlunoInsight[]>([])
  const [visitas, setVisitas] = useState<ResumoVisitas | null>(null)
  const [visitasDia, setVisitasDia] = useState<VisitaDia[]>([])
  const [origens, setOrigens] = useState<OrigemVisita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [lidoEm, setLidoEm] = useState<Date | null>(null)
  const catalogo = useMemo(() => todasAsAulas(), [])

  const carregar = async () => {
    setCarregando(true); setErro(null)
    try {
      const [r, d, h, a, l, di, al, v, vd, og] = await Promise.all([
        lerResumo(sessao, periodo), lerAcessosPorDia(sessao, periodo), lerAcessosPorHora(sessao, periodo),
        lerAulas(sessao, periodo), lerLocalizacoes(sessao), lerDispositivos(sessao, periodo), lerAlunos(sessao, 20),
        lerVisitas(sessao, periodo), lerVisitasPorDia(sessao, periodo), lerOrigens(sessao, periodo),
      ])
      setResumo(r); setDias(d); setHoras(h); setAulasDados(a); setLugares(l); setDispositivos(di); setAlunos(al)
      setVisitas(v); setVisitasDia(vd); setOrigens(og); setLidoEm(new Date())
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [sessao.usuario.id, periodo]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxVisitasDia = Math.max(1, ...visitasDia.map((d) => d.visitas))
  const totalOrigens = origens.reduce((t, o) => t + o.visitas, 0)
  // O funil que o painel não tinha: de cada 100 que abrem o site, quantas
  // deixam o cadastro. É a leitura que diz se o problema é alcance ou tela.
  const conversao = visitas && visitas.visitantes && resumo ? pct(resumo.novos, visitas.visitantes) : 0
  const maxPessoasDia = Math.max(1, ...dias.map((d) => d.pessoas))
  const maxHora = Math.max(1, ...horas.map((h) => h.acessos))
  const picoHora = horas.reduce((m, h) => (h.acessos > m.acessos ? h : m), { hora: 0, acessos: 0 })
  const porAula = new Map(aulasDados.map((a) => [a.aulaId, a]))
  const totalAcessosDisp = dispositivos.reduce((s, d) => s + d.acessos, 0)
  const tempoMedioSessao = resumo && resumo.acessos ? resumo.segundos / resumo.acessos : 0
  const clientesComAcesso = lugares.reduce((s, l) => s + l.pessoas, 0)
  const porPais = useMemo(() => {
    const m = new Map<string, { pessoas: number; ativos: number }>()
    for (const l of lugares) { const p = lugarDoFuso(l.fuso).pais || 'Não informado'; const x = m.get(p) ?? { pessoas: 0, ativos: 0 }; x.pessoas += l.pessoas; x.ativos += l.ativos30d; m.set(p, x) }
    return [...m.entries()].sort((a, b) => b[1].pessoas - a[1].pessoas)
  }, [lugares])

  return (
    <div className="ger insights">
      <header className="ins-topo">
        <div>
          <span className="rot">{MARCA.prosa} · Inteligência</span>
          <h2>Insights</h2>
          <p>Quem entra, quando, de onde, por quanto tempo — e o que assiste. {lidoEm && <small>Lido às {lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</small>}</p>
        </div>
        <div className="ins-periodo" role="tablist" aria-label="Período">
          {([7, 30, 90] as Periodo[]).map((p) => <button key={p} role="tab" aria-selected={periodo === p} className={periodo === p ? 'on' : ''} onClick={() => setPeriodo(p)}>{p} dias</button>)}
          <button className="ins-atualizar" onClick={() => void carregar()} disabled={carregando}>↻ {carregando ? 'Lendo…' : 'Atualizar'}</button>
        </div>
      </header>

      {erro && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}

      <div className="adm-kpis ins-kpis">
        <article className="ok"><span>Visitas ao site</span><strong>{visitas ? inteiro(visitas.visitas) : '—'}</strong><small>{visitas ? `${inteiro(visitas.visitantes)} pessoa${visitas.visitantes === 1 ? '' : 's'} diferente${visitas.visitantes === 1 ? '' : 's'}` : ''}</small></article>
        <article><span>Visitas hoje</span><strong>{visitas ? inteiro(visitas.visitasHoje) : '—'}</strong><small>{visitas ? `${inteiro(visitas.visitantesHoje)} pessoa${visitas.visitantesHoje === 1 ? '' : 's'}` : ''}</small></article>
        <article><span>Viraram cadastro</span><strong>{visitas ? `${conversao}%` : '—'}</strong><small>{resumo ? `${inteiro(resumo.novos)} cadastro${resumo.novos === 1 ? '' : 's'} no período` : ''}</small></article>
        <article className="ok"><span>Pessoas ativas · {periodo} dias</span><strong>{resumo ? inteiro(resumo.ativos) : '—'}</strong><small>{resumo ? `${inteiro(resumo.ativosHoje)} entraram hoje` : ''}</small></article>
        <article><span>Acessos</span><strong>{resumo ? inteiro(resumo.acessos) : '—'}</strong><small>{resumo ? `sessão média de ${horasLegiveis(tempoMedioSessao)}` : ''}</small></article>
        <article><span>Tempo na plataforma</span><strong>{resumo ? horasLegiveis(resumo.segundos) : '—'}</strong><small>somando todo mundo</small></article>
        <article><span>Novos cadastros</span><strong>{resumo ? inteiro(resumo.novos) : '—'}</strong><small>{resumo ? `de ${inteiro(resumo.clientes)} no total` : ''}</small></article>
        <article className="alerta"><span>Assistiram aulas</span><strong>{resumo ? inteiro(resumo.aulasPessoas) : '—'}</strong><small>{resumo ? `${horasLegiveis(resumo.aulasSegundos)} assistidos` : ''}</small></article>
        <article><span>Aulas concluídas</span><strong>{resumo ? inteiro(resumo.aulasConcluidas) : '—'}</strong><small>chegaram a 90% do vídeo</small></article>
        <article><span>Com a Deriv conectada</span><strong>{resumo ? inteiro(resumo.comDeriv) : '—'}</strong><small>{resumo ? `${pct(resumo.comDeriv, resumo.clientes)}% da base` : ''}</small></article>
      </div>

      <div className="ins-grade">
        <section className="admin-card ins-card">
          <header><div><span className="rot">Visitas</span><h3>Quem abriu o site, dia a dia</h3></div><small>{periodo} dias</small></header>
          <div className="ins-barras" style={{ ['--n' as string]: visitasDia.length }}>
            {visitasDia.map((d) => (
              <div key={d.dia} className="ins-barra" title={`${diaCurto(d.dia)} (${semana(d.dia)}): ${d.visitas} visita${d.visitas === 1 ? '' : 's'} de ${d.visitantes} pessoa${d.visitantes === 1 ? '' : 's'}`}>
                <i style={{ height: `${(d.visitas / maxVisitasDia) * 100}%` }} />
                {(visitasDia.length <= 14 || new Date(`${d.dia}T12:00:00`).getDay() === 1) && <span>{diaCurto(d.dia)}</span>}
              </div>
            ))}
          </div>
          <p className="ins-nota">Conta todo mundo que abre {MARCA.prosa === 'Teeds' ? 'teedscompany.com' : 'omnifinanc.com'}, com login ou sem. Uma visita por aba aberta: recarregar a página não conta de novo.</p>
        </section>

        <section className="admin-card ins-card">
          <header><div><span className="rot">Origem</span><h3>De onde essas pessoas vieram</h3></div><small>{periodo} dias</small></header>
          {origens.length > 0 && (
            <div className="ins-paises">
              {origens.slice(0, 6).map((o, i) => (
                <div key={i}><span>{nomeDaOrigem(o.origem)}<b>{pct(o.visitas, totalOrigens)}% · {inteiro(o.visitas)} visita{o.visitas === 1 ? '' : 's'}</b></span><i><em style={{ width: `${pct(o.visitas, totalOrigens)}%` }} /></i></div>
              ))}
            </div>
          )}
          <div className="ins-tabela ins-origens">
            <div className="cab"><span>Origem</span><span>Campanha</span><span>Visitas</span><span>Pessoas</span><span>Última vez</span></div>
            {origens.slice(0, 12).map((o, i) => (
              <div key={i} className="ins-linha">
                <span><b>{nomeDaOrigem(o.origem)}</b>{o.meio && <small>{o.meio}</small>}</span>
                <span>{o.campanha || '—'}</span>
                <span>{inteiro(o.visitas)}</span>
                <span>{inteiro(o.visitantes)}</span>
                <span>{quando(o.ultimaVez)}</span>
              </div>
            ))}
            {!origens.length && <div className="adm-vazio">Nenhuma visita registrada ainda neste período.</div>}
          </div>
          <p className="ins-nota">Para separar uma divulgação das outras, mande o link com a marcação: <code>?utm_source=telegram&amp;utm_campaign=nome-da-acao</code>. Quem chega sem marcação aparece como acesso direto.</p>
        </section>
      </div>

      <div className="ins-grade">
        <section className="admin-card ins-card">
          <header><div><span className="rot">Acessos por dia</span><h3>Pessoas que entraram, dia a dia</h3></div><small>{periodo} dias · fuso do cliente</small></header>
          <div className="ins-barras" style={{ ['--n' as string]: dias.length }}>
            {dias.map((d) => (
              <div key={d.dia} className="ins-barra" title={`${diaCurto(d.dia)} (${semana(d.dia)}): ${d.pessoas} pessoa${d.pessoas === 1 ? '' : 's'}, ${d.acessos} acesso${d.acessos === 1 ? '' : 's'}, ${horasLegiveis(d.segundos)}`}>
                <i style={{ height: `${(d.pessoas / maxPessoasDia) * 100}%` }} />
                {(dias.length <= 14 || new Date(`${d.dia}T12:00:00`).getDay() === 1) && <span>{diaCurto(d.dia)}</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card ins-card">
          <header><div><span className="rot">Horários</span><h3>Em que hora a plataforma é mais usada</h3></div><small>{picoHora.acessos ? `pico às ${String(picoHora.hora).padStart(2, '0')}h` : 'sem dados ainda'}</small></header>
          <div className="ins-barras ins-horas" style={{ ['--n' as string]: 24 }}>
            {horas.map((h) => (
              <div key={h.hora} className={`ins-barra ${h.hora === picoHora.hora && h.acessos ? 'pico' : ''}`} title={`${String(h.hora).padStart(2, '0')}h: ${h.acessos} acesso${h.acessos === 1 ? '' : 's'}`}>
                <i style={{ height: `${(h.acessos / maxHora) * 100}%` }} />
                {h.hora % 6 === 0 && <span>{String(h.hora).padStart(2, '0')}h</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-card full ins-card">
        <header><div><span className="rot">Aulas</span><h3>Quem assistiu o quê, e até onde</h3></div><small>{periodo} dias</small></header>
        <div className="ins-tabela ins-aulas">
          <div className="cab"><span>Aula</span><span>Pessoas</span><span>Aberturas</span><span>Tempo assistido</span><span>Progresso médio</span><span>Concluíram</span></div>
          {MODULOS.map((m) => (
            <div key={m.id} className="ins-grupo">
              <em style={{ ['--aula' as string]: m.cor }}>{m.titulo}</em>
              {catalogo.filter((a) => a.modulo.id === m.id).map((a) => {
                const x = porAula.get(a.id)
                return (
                  <div key={a.id} className={`ins-linha ${x ? '' : 'vazia'}`}>
                    <span className="ins-aula-nome"><i>{String(a.numero).padStart(2, '0')}</i><b>{a.titulo}</b>{a.duracao === 'Vídeo demonstrativo' && <small>sem vídeo próprio</small>}</span>
                    <span>{x ? inteiro(x.pessoas) : '—'}</span>
                    <span>{x ? inteiro(x.aberturas) : '—'}</span>
                    <span>{x ? horasLegiveis(x.segundos) : '—'}</span>
                    <span className="ins-progresso"><i><u style={{ width: `${x ? Math.round(x.posicaoMedia * 100) : 0}%`, background: m.cor }} /></i>{x ? `${Math.round(x.posicaoMedia * 100)}%` : '—'}</span>
                    <span>{x ? `${inteiro(x.concluiram)} · ${pct(x.concluiram, x.pessoas)}%` : '—'}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </section>

      <div className="ins-grade">
        <section className="admin-card ins-card">
          <header><div><span className="rot">Localização</span><h3>De onde os clientes acessam</h3></div><small>aproximada pelo fuso horário</small></header>
          {porPais.length > 0 && (
            <div className="ins-paises">
              {porPais.slice(0, 6).map(([pais, x]) => <div key={pais}><span>{pais}<b>{inteiro(x.pessoas)}</b></span><i><em style={{ width: `${pct(x.pessoas, clientesComAcesso)}%` }} /></i></div>)}
            </div>
          )}
          <div className="ins-tabela ins-lugares">
            <div className="cab"><span>Cidade / região</span><span>Idioma</span><span>Pessoas</span><span>Ativas 30d</span></div>
            {lugares.slice(0, 12).map((l, i) => { const p = lugarDoFuso(l.fuso); return (
              <div key={i} className="ins-linha"><span><b>{p.lugar}</b><small>{p.pais}{l.fuso ? ` · ${l.fuso}` : ''}</small></span><span>{idiomaLegivel(l.idioma)}</span><span>{inteiro(l.pessoas)}</span><span>{inteiro(l.ativos30d)}</span></div>
            ) })}
            {!lugares.length && <div className="adm-vazio">Ainda não há acessos registrados nesta marca.</div>}
          </div>
          <p className="ins-nota">A plataforma não guarda o IP de ninguém: a localização vem do fuso horário e do idioma que o navegador informa. Cidade exata pediria consentimento e política de privacidade.</p>
        </section>

        <section className="admin-card ins-card">
          <header><div><span className="rot">Dispositivos</span><h3>Computador ou celular</h3></div><small>{periodo} dias</small></header>
          <div className="ins-paises">
            {dispositivos.map((d) => <div key={d.dispositivo}><span>{d.dispositivo[0].toUpperCase() + d.dispositivo.slice(1)}<b>{pct(d.acessos, totalAcessosDisp)}% · {inteiro(d.pessoas)} pessoa{d.pessoas === 1 ? '' : 's'}</b></span><i><em style={{ width: `${pct(d.acessos, totalAcessosDisp)}%` }} /></i></div>)}
            {!dispositivos.length && <div className="adm-vazio">Sem acessos no período.</div>}
          </div>
          <header className="ins-sub"><div><span className="rot">Alunos</span><h3>Quem mais estuda</h3></div></header>
          <div className="ins-tabela ins-alunos">
            <div className="cab"><span>Cliente</span><span>Aulas</span><span>Concluídas</span><span>Tempo</span><span>Última vez</span></div>
            {alunos.map((a) => (
              <div key={a.userId} className="ins-linha"><span className="adm-pessoa"><i>{(a.nome || a.email || '?')[0].toUpperCase()}</i><b>{a.nome || 'Sem nome'}<small>{a.email}</small></b></span><span>{inteiro(a.aulasVistas)}</span><span>{inteiro(a.aulasConcluidas)}</span><span>{horasLegiveis(a.segundos)}</span><span>{quando(a.ultimaVez)}</span></div>
            ))}
            {!alunos.length && <div className="adm-vazio">Ninguém abriu uma aula ainda.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
