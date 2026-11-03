import { useState } from 'react'
import { AdminAnuncios } from './AdminAnuncios'
import type { ApiAnuncios, FunilDoBanco, Metricas, PainelDaMeta } from '../../core/teeds/anuncios'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { ApiEstudio, ItemDoHistorico, PublicoSalvo, Rascunho } from '../../core/teeds/estudio'

/** Laboratório: Administração › Anúncios com números de exemplo (?tela=anuncios-admin; &sem-chave=1 mostra o conectar; &chave-bloqueada=1, a chave guardada que a Meta recusa). */
const m = (gasto: number, imp: number, cliques: number, lpv: number, cad: number, v3 = 0, thru = 0): Metricas => ({
  gasto, impressoes: imp, alcance: Math.round(imp / 1.42), frequencia: 1.42, cliques: Math.round(cliques * 1.6), cliquesLink: cliques,
  ctrLink: cliques / imp * 100, ctr: cliques * 1.6 / imp * 100, cpcLink: cliques ? gasto / cliques : 0, cpm: imp ? gasto / imp * 1000 : 0, lpv,
  viewContent: Math.round(lpv * 0.7), leads: cad, cadastros: cad, eventosProprios: Math.round(lpv * 1.8), engajamento: Math.round(imp * 0.031),
  reacoes: Math.round(imp * 0.004), comentarios: Math.round(imp * 0.0006), compartilhamentos: Math.round(imp * 0.0003), salvos: Math.round(imp * 0.0004),
  video3s: v3, videoPlay: Math.round(v3 * 1.9), thruplay: thru, p25: Math.round(v3 * 0.62), p50: Math.round(v3 * 0.41), p75: Math.round(v3 * 0.28), p95: Math.round(v3 * 0.2), p100: Math.round(v3 * 0.17),
})
const somar = (l: Metricas[]): Metricas => {
  const t = m(0, 0, 0, 0, 0)
  for (const x of l) for (const k of Object.keys(t) as Array<keyof Metricas>) t[k] += x[k]
  t.ctrLink = t.cliquesLink / t.impressoes * 100; t.cpcLink = t.gasto / t.cliquesLink; t.cpm = t.gasto / t.impressoes * 1000; t.frequencia = 1.42
  return t
}
const ads = [
  { id: '120210000000000001', nome: 'Vídeo 01 · Naor na mesa · “O mercado mudou”', m: m(412.3, 48210, 1190, 902, 141, 17350, 5210), tipo: 'video' as const, rank: 'acima' as const },
  { id: '120210000000000002', nome: 'Vídeo 02 · Bastidores da I.A. operando', m: m(296.8, 39920, 802, 610, 88, 12780, 3110), tipo: 'video' as const, rank: 'media' as const },
  { id: '120210000000000003', nome: 'Imagem · Convite da live 09/11', m: m(183.1, 30110, 402, 288, 31, 0, 0), tipo: 'imagem' as const, rank: 'abaixo35' as const },
]
const miniatura = (cor: string, texto: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B2546"/><stop offset="1" stop-color="${cor}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="80" y="92" text-anchor="middle" font-family="Arial" font-weight="700" font-size="22" fill="#F3F0E9">${texto}</text></svg>`)}`
const total = somar(ads.map((a) => a.m))

function painel(de: string, ate: string): PainelDaMeta {
  const dias: string[] = []
  for (let d = new Date(`${de}T12:00:00`); d.toISOString().slice(0, 10) <= ate; d.setDate(d.getDate() + 1)) dias.push(d.toISOString().slice(0, 10))
  const peso = dias.map((_, i) => 0.6 + ((i * 37) % 10) / 12)
  const soma = peso.reduce((a, b) => a + b, 0)
  const q = (lista: Array<[string, string, number]>, chaves: [string, string?]) => lista.map(([a, b, f]) => ({ ...m(total.gasto * f, total.impressoes * f, total.cliquesLink * f, total.lpv * f, total.cadastros * f), [chaves[0]]: a, ...(chaves[1] ? { [chaves[1]]: b } : {}) }))
  return {
    conta: { id: '977357031377237', nome: 'CA - NAOR BEZERRA', moeda: 'BRL', status: 1, gastoTotal: 16878.4, saldo: 0, limite: 0, fuso: 'America/Sao_Paulo', motivo: 0 },
    periodo: { de, ate }, total,
    porDia: dias.map((dia, i) => ({ dia, ...m(total.gasto * peso[i] / soma, Math.round(total.impressoes * peso[i] / soma), Math.round(total.cliquesLink * peso[i] / soma), Math.round(total.lpv * peso[i] / soma), Math.round(total.cadastros * peso[i] / soma)) })),
    campanhas: [{ id: 'c1', nome: 'GF | Live 09/11 | Cadastros', status: 'ACTIVE', objetivo: 'OUTCOME_LEADS', orcDia: 300, orcTotal: 0, inicio: '2026-11-02', fim: null, lance: 'LOWEST_COST_WITHOUT_CAP', m: total }],
    conjuntos: [{ id: 's1', nome: 'Brasil · 25–55 · aberto', status: 'ACTIVE', campanhaId: 'c1', orcDia: 0, orcTotal: 0, otimizacao: 'OFFSITE_CONVERSIONS', publico: '25–55 anos · Brasil · público Advantage+', m: total }],
    anuncios: ads.map((a, i) => ({
      id: a.id, nome: a.nome, status: i === 2 ? 'PAUSED' : 'ACTIVE', campanhaId: 'c1', conjuntoId: 's1', criadoEm: '2026-11-02T12:00:00Z',
      criativo: { miniatura: miniatura(['#B8862F', '#3a6fd8', '#7a4fd0'][i], ['V01', 'V02', 'IMG'][i]), imagem: null, titulo: 'Live gratuita 09/11, às 20h', texto: 'A I.A. que opera com você. Inscreva-se e assista à live de lançamento da GlobalFly.', tipo: a.tipo, cta: 'SIGN_UP', marcacoes: i === 2 ? '' : 'utm_source=meta&utm_medium=pago&utm_content={{ad.id}}' },
      ranking: { qualidade: a.rank, engajamento: a.rank, conversao: i === 0 ? 'acima' : 'media' }, m: a.m,
    })),
    quebras: {
      idadeGenero: q([['25-34', 'male', .31], ['35-44', 'male', .24], ['25-34', 'female', .12], ['45-54', 'male', .14], ['35-44', 'female', .09], ['18-24', 'male', .06], ['45-54', 'female', .04]], ['age', 'gender']),
      posicionamento: q([['instagram', 'instagram_reels', .38], ['instagram', 'instagram_stories', .22], ['facebook', 'feed', .18], ['instagram', 'feed', .14], ['facebook', 'facebook_reels', .08]], ['publisher_platform', 'platform_position']),
      aparelho: q([['mobile_app', '', .9], ['mobile_web', '', .06], ['desktop', '', .04]], ['device_platform']),
      regiao: q([['São Paulo', '', .29], ['Minas Gerais', '', .12], ['Rio de Janeiro', '', .1], ['Paraná', '', .08], ['Bahia', '', .07], ['Rio Grande do Sul', '', .06], ['Goiás', '', .05], ['Santa Catarina', '', .04]], ['region']),
    },
    pixel: { id: '1625935188283999', desde: `${de}T03:00:00Z`, porDia: [], eventos: [
      { nome: 'PageView', total: 4210 }, { nome: 'ViewContent', total: 2980 }, { nome: 'ClicouCadastrar', total: 1420 }, { nome: 'ComecouCadastro', total: 690 },
      { nome: 'Lead', total: 268 }, { nome: 'CompleteRegistration', total: 259 }, { nome: 'RespondeuQuestionario', total: 201 }, { nome: 'Contact', total: 166 },
      { nome: 'Schedule', total: 121 }, { nome: 'AtivouNotificacoes', total: 97 }, { nome: 'InitiateCheckout', total: 61 }, { nome: 'BaixouApp', total: 44 },
    ] },
    avisos: [], em: new Date().toISOString(),
  }
}

let vivos = 0
function funil(): FunilDoBanco {
  vivos += 1 + (vivos % 3 === 0 ? 1 : 0)
  const cad = 248 + vivos, que = 196 + Math.floor(vivos * 0.8), not = 101 + Math.floor(vivos / 2)
  const e = { cadastros: cad, questionario: que, contas: cad, notificacoes: not, live: 0, liberados: 0 }
  return {
    total: { ...e, cadastros: cad + 21, questionario: que + 15, contas: cad + 21 }, anuncio: e,
    porAnuncio: [{ id: ads[0].id, cadastros: 138 + vivos, questionario: 112, notificacoes: 61, live: 0, liberados: 0 }, { id: ads[1].id, cadastros: 84, questionario: 66, notificacoes: 32, live: 0, liberados: 0 }],
    porDia: [], porOrigem: [{ origem: 'meta', cadastros: cad }, { origem: 'sem origem', cadastros: 14 }, { origem: 'instagram', cadastros: 7 }],
    servidor: { enviados: cad * 2 - 3, semChave: 0, erros: 0 },
    passos: { visitas: 2410 + vivos * 9, formulario: 1720 + vivos * 6, clicou: 1190 + vivos * 4, comecou: 690 + vivos * 3 },
  }
}

/* o estúdio de mentira: guarda tudo na memória da aba e finge o envio para a Meta (&estudio-sem-chave=1 testa sem a chave) */
const agoraMenos = (min: number) => new Date(Date.now() - min * 60e3).toISOString()
const rascunhosLab: Rascunho[] = [
  { id: '00000000-0000-4000-8000-000000000001', tipo: 'teste', nome: 'Naor na mesa x Bastidores', situacao: 'ligado', erro: null, criadoEm: agoraMenos(2000), atualizadoEm: agoraMenos(1900),
    progresso: { anuncioId: ads[0].id, anuncioB: ads[1].id, conjuntoId: 's1', conjuntoB: 's2', estudoId: '1', avisos: [] },
    dados: { nomeAnuncio: 'Naor na mesa x Bastidores', midia: { tipo: 'video', nome: 'v01.mp4', largura: 1080, altura: 1920, tamanho: 3e7, poster: miniatura('#B8862F', 'V01') }, midiaB: { tipo: 'video', nome: 'v02.mp4', largura: 1080, altura: 1920, tamanho: 3e7, poster: miniatura('#3a6fd8', 'V02') },
      texto: { principal: '', titulo: 'Live gratuita dia 09/11', descricao: '', botao: 'SIGN_UP' }, link: 'https://globalflytrade.com/n/cadastro/', destino: { campanha: 'c1', nomeCampanha: '', conjunto: 'novo', nomeConjunto: '' },
      publico: { modo: 'padrao', idadeMin: 18, idadeMax: 65, genero: 'todos' }, diario: 400, teste: { variavel: 'criativo', dias: 7 } } },
  { id: '00000000-0000-4000-8000-000000000002', tipo: 'novo', nome: 'Convite da live · versão curta', situacao: 'rascunho', erro: null, criadoEm: agoraMenos(90), atualizadoEm: agoraMenos(35), progresso: {},
    dados: { nomeAnuncio: 'Convite da live · versão curta', midia: { tipo: 'imagem', nome: 'convite.jpg', largura: 1080, altura: 1350, tamanho: 8e5, poster: miniatura('#7a4fd0', 'IMG') },
      texto: { principal: 'Dia 09/11 tem live ao vivo com o Naor.', titulo: 'Live gratuita dia 09/11', descricao: '', botao: 'SIGN_UP' }, link: 'https://globalflytrade.com/n/cadastro/', destino: { campanha: 'nova', nomeCampanha: 'Live 09/11 | Cadastros', conjunto: 'novo', nomeConjunto: 'Público do lançamento' },
      publico: { modo: 'padrao', idadeMin: 18, idadeMax: 65, genero: 'todos' }, diario: 300 } },
]
const historicoLab: ItemDoHistorico[] = [
  { id: 3, quem: 'Tiago', acao: 'orcamento', alvoTipo: 'conjunto', alvoId: 's1', alvoNome: 'Brasil · 25–55 · aberto', detalhe: { antes: 250, depois: 300 }, em: agoraMenos(180) },
  { id: 2, quem: 'Tiago', acao: 'ligou', alvoTipo: 'anuncio', alvoId: ads[0].id, alvoNome: 'Naor na mesa x Bastidores', detalhe: { diario: 400 }, em: agoraMenos(1900) },
  { id: 1, quem: 'Tiago', acao: 'criou_teste', alvoTipo: 'anuncio', alvoId: ads[0].id, alvoNome: 'Naor na mesa x Bastidores', detalhe: {}, em: agoraMenos(1950) },
]
const publicosLab: PublicoSalvo[] = [{ id: 'p1', nome: 'Traders SP · 25–45', publico: { modo: 'detalhado', idadeMin: 25, idadeMax: 45, genero: 'todos', locais: [{ tipo: 'estado', nome: 'São Paulo' }], interesses: [{ tipo: 'interesse', nome: 'Day trading' }, { tipo: 'interesse', nome: 'Forex' }] }, tamanho: [2.1e6, 2.4e6], atualizadoEm: agoraMenos(300) }]
function estudioDeMentira(semChave: boolean): ApiEstudio {
  const espera = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(v), ms))
  const anotar = (acao: string, alvoNome: string, detalhe: Record<string, unknown> = {}) => historicoLab.unshift({ id: Date.now(), quem: 'Tiago', acao, alvoTipo: 'anuncio', alvoId: '', alvoNome, detalhe, em: new Date().toISOString() })
  const achar = (id: string) => rascunhosLab.find((r) => r.id === id)!
  return {
    contexto: () => espera({
      ...(semChave ? { semChave: true } : {}), conta: '977357031377237', maxDia: 5000, link: 'https://globalflytrade.com/n/cadastro/',
      pagina: { id: '483727028157678', nome: 'Naor Bezzera', foto: null }, instagram: { id: '17841406873438157', usuario: 'naorbezerra_', foto: null },
      campanhas: [{ id: 'c1', nome: 'GF | Live 09/11 | Cadastros', status: 'ACTIVE', orcDia: 0 }],
      conjuntos: [{ id: 's1', nome: 'Brasil · 25–55 · aberto', status: 'ACTIVE', campanhaId: 'c1', orcDia: 300, publico: 'Público Advantage+' }],
    }),
    rascunhos: () => espera(rascunhosLab.filter((r) => (r.situacao as string) !== 'arquivado').map((r) => ({ ...r }))),
    salvar: (_s, _p, id, tipo, nome, dados) => {
      const limpo = JSON.parse(JSON.stringify(dados, (k, v) => (k === 'local' ? undefined : v)))
      if (id) { const r = achar(id); if (r) Object.assign(r, { nome, dados: limpo, atualizadoEm: new Date().toISOString() }); return espera(id, 250) }
      const novo = `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`
      rascunhosLab.unshift({ id: novo, tipo, nome, dados: limpo, situacao: 'rascunho', progresso: {}, erro: null, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() })
      return espera(novo, 250)
    },
    arquivar: (_s, id) => { const i = rascunhosLab.findIndex((r) => r.id === id); if (i >= 0) rascunhosLab.splice(i, 1); return espera(null) },
    historico: () => espera([...historicoLab]),
    subirImagem: () => espera({ hash: `hash${Date.now()}` }, 900),
    subirVideo: async (_s, _p, _f, andamento) => { for (let i = 1; i <= 10; i++) { await espera(null, 180); andamento(i / 10) } return { videoId: `v${Date.now()}` } },
    estadoVideo: (() => { let n = 0; return () => espera(++n % 3 === 0 ? { estado: 'ready', progresso: 100 } : { estado: 'processing', progresso: (n % 3) * 40 }, 300) })(),
    criar: async (_s, _p, id) => { await espera(null, 3200); const r = achar(id); r.situacao = 'pausado'; r.progresso = { anuncioId: 'novo1', campanhaId: 'c9', campanhaNova: true, conjuntoId: 's9', conjuntoNovo: true, avisos: [] }; anotar(r.tipo === 'teste' ? 'criou_teste' : 'criou', r.nome); return { situacao: 'pausado', progresso: r.progresso } },
    ligar: async (_s, _p, id) => { await espera(null, 900); const r = achar(id); r.situacao = 'ligado'; anotar('ligou', r.nome, { diario: r.dados.diario }); return { situacao: 'ligado', progresso: r.progresso } },
    vencedor: async (_s, _p, id, v) => { const r = achar(id); r.progresso = { ...r.progresso, vencedor: v }; anotar('vencedor', r.nome, { vencedor: v.toUpperCase() }); return espera({ situacao: r.situacao, progresso: r.progresso }) },
    status: (_s, _p, _t, _id, ligar) => { anotar(ligar ? 'ligou' : 'pausou', 'Anúncio do laboratório'); return espera({ ok: true }, 700) },
    orcamento: (_s, _p, _c, diario) => { anotar('orcamento', 'Brasil · 25–55 · aberto', { antes: 300, depois: diario }); return espera({ ok: true }, 700) },
    // a busca e a estimativa de mentira: uma lista fixa que imita o que a Meta devolve
    buscar: (_s, _p, tipo, q) => {
      const n = q.toLowerCase()
      const base: Record<string, Array<Record<string, unknown>>> = {
        interesse: [['Day trading', 'Investimento', 4.1e6], ['Forex', 'Investimento', 2.3e6], ['Mercado de ações', 'Investimento', 9.8e6], ['Bolsa de valores', 'Investimento', 7.2e6], ['Análise técnica', 'Investimento', 1.4e6], ['Criptomoeda', 'Tecnologia', 6.6e6], ['Finanças pessoais', 'Negócios', 12.5e6], ['Empreendedorismo', 'Negócios', 31e6]].map(([nome, caminho, t]) => ({ tipo: 'interesse', nome, id: `6003${String(nome).length}${Math.round(Number(t) / 1e5)}`, caminho, tamanho: [Math.round(Number(t) * 0.9), Number(t)] })),
        comportamento: [['Usuários de dispositivos iOS', 'Comportamentos › Usuários de dispositivos móveis'], ['Administradores de página de empresa', 'Comportamentos › Atividades digitais']].map(([nome, caminho]) => ({ tipo: 'comportamento', nome, id: `6015${String(nome).length}`, caminho })),
        local: [['São Paulo', 'estado'], ['São Paulo', 'cidade'], ['Campinas', 'cidade'], ['Santos', 'cidade'], ['Sorocaba', 'cidade'], ['Ribeirão Preto', 'cidade'], ['Rio de Janeiro', 'cidade'], ['Minas Gerais', 'estado']].map(([nome, t]) => ({ tipo: t, nome, chave: `${nome}-${t}`, detalhe: t === 'cidade' ? 'Cidade' : 'Estado' })),
        aparelho: ['iPhone 17 Pro Max', 'iPhone 16 Pro', 'iPhone 15', 'Galaxy S24 Ultra', 'Galaxy A55'].map((nome) => ({ tipo: 'aparelho', nome, detalhe: /iPhone/.test(nome) ? 'iOS' : 'Android' })),
      }
      return espera((base[tipo] ?? []).filter((x) => String(x.nome).toLowerCase().includes(n)) as never, 300)
    },
    sugerir: () => espera([{ tipo: 'interesse', nome: 'Trader', id: '6003999', caminho: 'Investimento', tamanho: [1.1e6, 1.3e6] }, { tipo: 'interesse', nome: 'Opções (finanças)', id: '6003998', caminho: 'Investimento', tamanho: [6e5, 7e5] }] as never, 400),
    estimar: (_s, _p, pub) => {
      let t = 98e6
      if (pub.locais?.length) t *= Math.min(1, 0.22 * pub.locais.length)
      if (pub.modo !== 'padrao') t *= ((pub.idadeMax - pub.idadeMin) / 47) * (pub.genero === 'todos' ? 1 : 0.5)
      if (pub.modo === 'detalhado' && pub.interesses?.length) t *= Math.min(0.4, 0.06 * pub.interesses.length)
      if (pub.modelos?.length) t *= Math.min(0.3, 0.02 * pub.modelos.length); else if (pub.sistema && pub.sistema !== 'todos') t *= pub.sistema === 'ios' ? 0.22 : 0.78
      if (pub.modo === 'inteligente') t = pub.inteligente?.tipo === 'semelhantes' ? 1.6e6 * (pub.inteligente.percentual || 1) : 18e3
      return espera({ tamanho: [Math.round(t * 0.85), Math.round(t)] as [number, number], avisos: [] }, 600)
    },
    publicos: () => espera([...publicosLab]),
    salvarPublico: (_s, _p, _id, nome, publico, tamanho) => { const id = `p${Date.now()}`; publicosLab.unshift({ id, nome, publico, tamanho, atualizadoEm: new Date().toISOString() }); return espera(id) },
    arquivarPublico: (_s, id) => { const i = publicosLab.findIndex((x) => x.id === id); if (i >= 0) publicosLab.splice(i, 1); return espera(null) },
    escalar: (_s, _p, _c, aumento) => { anotar('escalou', 'Brasil · 25–55 · aberto · escala', { aumento, diario: Math.round(300 * (1 + aumento / 100)) }); return espera({ conjuntoId: 's3', diario: Math.round(300 * (1 + aumento / 100)) }, 900) },
  }
}

export default function LabAnuncios() {
  const q = new URLSearchParams(location.search)
  const semChave = q.has('sem-chave'), bloqueada = q.has('chave-bloqueada')
  const espera = <T,>(v: T, ms = 300) => new Promise<T>((r) => setTimeout(() => r(v), ms))
  const api: ApiAnuncios = {
    painel: (_s, _p, de, ate) => (bloqueada ? espera(null).then(() => { throw new Error('A Meta não deixou nem conferir a chave. Gere uma nova no usuário do sistema e cole de novo.\nResposta da Meta: API access blocked. (código 200)') })
      : espera(semChave ? { semChave: true as const } : painel(de, ate))),
    resumo: () => espera(semChave ? { semChave: true as const } : { total: { ...total, impressoes: total.impressoes + vivos * 40, cliquesLink: total.cliquesLink + vivos }, em: new Date().toISOString() }),
    anuncio: (_s, _p, id, de, ate) => espera({ porDia: painel(de, ate).porDia.map((d) => ({ ...d, gasto: d.gasto / 3 })), idadeGenero: painel(de, ate).quebras.idadeGenero, posicionamento: painel(de, ate).quebras.posicionamento }, 500 + id.length),
    funil: () => espera(funil()),
    salvarChave: () => espera(null),
    copiarChave: () => espera(null),
    horarios: () => espera({
      porHora: Array.from({ length: 24 }, (_, hora) => { const n = Math.round(Math.max(0, Math.sin((hora - 6) / 24 * Math.PI * 2) * 14 + 9 + (hora >= 19 && hora <= 22 ? 12 : 0))); return { hora, cadastros: n + 2, deAnuncio: n } }),
      porSemana: [31, 44, 41, 38, 47, 36, 29].map((n, dia) => ({ dia, cadastros: n + 3, deAnuncio: n })),
    }),
  }
  const sessao = { token: 'lab', usuario: { id: 'lab' } } as unknown as SessaoTeeds
  const [estudio] = useState(() => estudioDeMentira(q.has('estudio-sem-chave')))
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)', padding: 'clamp(12px, 3vw, 28px)', boxSizing: 'border-box' }}><AdminAnuncios sessao={sessao} api={api} apiEstudio={estudio} intervalo={q.has('rapido') ? 2500 : undefined} /></div>
}
