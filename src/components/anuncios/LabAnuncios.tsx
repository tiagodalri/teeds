import { AdminAnuncios } from './AdminAnuncios'
import type { ApiAnuncios, FunilDoBanco, Metricas, PainelDaMeta } from '../../core/teeds/anuncios'
import type { SessaoTeeds } from '../../core/teeds/conta'

/** Laboratório: Administração › Anúncios com números de exemplo (?tela=anuncios-admin; &sem-chave=1 mostra o conectar). */
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
  }
}

export default function LabAnuncios() {
  const q = new URLSearchParams(location.search)
  const semChave = q.has('sem-chave')
  const espera = <T,>(v: T, ms = 300) => new Promise<T>((r) => setTimeout(() => r(v), ms))
  const api: ApiAnuncios = {
    painel: (_s, _p, de, ate) => espera(semChave ? { semChave: true as const } : painel(de, ate)),
    resumo: () => espera(semChave ? { semChave: true as const } : { total: { ...total, impressoes: total.impressoes + vivos * 40, cliquesLink: total.cliquesLink + vivos }, em: new Date().toISOString() }),
    anuncio: (_s, _p, id, de, ate) => espera({ porDia: painel(de, ate).porDia.map((d) => ({ ...d, gasto: d.gasto / 3 })), idadeGenero: painel(de, ate).quebras.idadeGenero, posicionamento: painel(de, ate).quebras.posicionamento }, 500 + id.length),
    funil: () => espera(funil()),
    salvarChave: () => espera(null),
  }
  const sessao = { token: 'lab', usuario: { id: 'lab' } } as unknown as SessaoTeeds
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)', padding: 'clamp(12px, 3vw, 28px)', boxSizing: 'border-box' }}><AdminAnuncios sessao={sessao} api={api} intervalo={q.has('rapido') ? 2500 : undefined} /></div>
}
