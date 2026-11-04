import { CentralRastreio } from './CentralRastreio'
import type { ApiAnuncios, Anuncio, Metricas, PainelDaMeta } from '../../core/teeds/anuncios'
import type { ApiCentral, EventoAoVivo, FichaDaPessoa, LinkDeRastreio, PessoaDaLista, ResumoDaCentral } from '../../core/teeds/central'
import type { SessaoTeeds } from '../../core/teeds/conta'

/** Laboratório: Administração › Central de rastreio com números de exemplo (?tela=central-rastreio). */
const agora = Date.now()
const ha = (min: number) => new Date(agora - min * 60e3).toISOString()
const m = (gasto: number, imp: number, cliques: number, play: number, ret: number[]): Metricas => ({
  gasto, impressoes: imp, alcance: Math.round(imp / 1.3), frequencia: 1.3, cliques: Math.round(cliques * 1.5), cliquesLink: cliques,
  ctrLink: cliques / imp * 100, ctr: cliques * 1.5 / imp * 100, cpcLink: gasto / cliques, cpm: gasto / imp * 1000, lpv: Math.round(cliques * 0.8),
  viewContent: 0, leads: 0, cadastros: Math.round(cliques * 0.12), eventosProprios: 0, engajamento: 0, reacoes: 0, comentarios: 0, compartilhamentos: 0, salvos: 0,
  videoPlay: play, video3s: Math.round(play * ret[0]), thruplay: Math.round(play * ret[2]), p25: Math.round(play * ret[1]), p50: Math.round(play * ret[2]), p75: Math.round(play * ret[3]), p95: Math.round(play * ret[4]), p100: Math.round(play * ret[5]),
})
const cap = (cor: string, t: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${cor}"/><text x="48" y="56" text-anchor="middle" font-family="Arial" font-weight="700" font-size="22" fill="#fff">${t}</text></svg>`)}`
const RET: Record<string, number[]> = { NB1: [0.52, 0.31, 0.19, 0.12, 0.08, 0.07], NB2: [0.38, 0.2, 0.11, 0.07, 0.05, 0.04], NB3: [0.61, 0.4, 0.27, 0.19, 0.14, 0.12], NB4: [0.47, 0.29, 0.18, 0.13, 0.1, 0.09], NB5: [0.55, 0.34, 0.22, 0.15, 0.11, 0.1] }
const CORES: Record<string, string> = { NB1: '#24466e', NB2: '#6b3f8a', NB3: '#2f6b4f', NB4: '#8a5a2b', NB5: '#7a2f45' }
const anuncios: Anuncio[] = Object.keys(RET).flatMap((c, i) => ['Quente', 'Aberto 25+'].map((p, j) => ({
  id: `5254335${i}${j}00000`, nome: `GF | ${c} | ${p}`, status: 'ACTIVE', campanhaId: 'c', conjuntoId: `s${i}${j}`, criadoEm: ha(600),
  criativo: { miniatura: cap(CORES[c], c), imagem: null, titulo: '', texto: '', tipo: 'video' as const, cta: 'SIGN_UP', marcacoes: 'utm_source=meta&utm_medium=pago&utm_content={{ad.id}}' },
  ranking: { qualidade: '' as const, engajamento: '' as const, conversao: '' as const },
  m: m(18 + i * 3 + j * 4, 2400 + i * 600 + j * 900, 40 + i * 9 + j * 6, 1700 + i * 300 + j * 500, RET[c]),
})))
const linha = (chave: string, v: number, c: number) => ({ chave, visitantes: v, formulario: Math.round(v * 0.7), clicou: Math.round(v * 0.45), comecou: Math.round(v * 0.32), convertidos: Math.round(c * 0.8), cadastros: c, questionario: Math.round(c * 0.9), notificacoes: Math.round(c * 0.3), live: 0, liberados: 0 })
const resumo: ResumoDaCentral = {
  total: { ...linha('', 612, 118), eventos: 9431 },
  porCanal: [linha('anuncio-meta', 288, 52), linha('telegram', 121, 31), linha('stories', 96, 19), linha('instagram', 64, 9), linha('whatsapp', 22, 4), linha('direto', 21, 3), { ...linha('sem-origem', 0, 41), formulario: 0, clicou: 0, comecou: 0 }],
  porLink: [linha('telegram-canal-naor-0411', 121, 31), linha('stories-naor-0411-manha', 58, 12), linha('stories-naor-0411-noite', 38, 7)],
  porAnuncio: anuncios.map((a, i) => linha(a.id, 20 + i * 4, (i * 7) % 9)),
  porDia: [{ dia: '2026-11-04', visitantes: 612, cadastros: 118 }],
}
const EVENTOS: Array<[string, string | null, string, string | null, Record<string, unknown> | null]> = [
  ['cadastro', 'Mariana Souza', 'anuncio-meta', anuncios[4].id, null], ['campo', 'Mariana Souza', 'anuncio-meta', anuncios[4].id, { campo: 'telefone' }],
  ['clique', null, 'telegram', null, { alvo: 'Abrir minha conta grátis' }], ['rolou-50', null, 'stories', null, null], ['entrada', null, 'telegram', null, null],
  ['respondeu', 'Carlos Lima', 'telegram', null, { exCliente: true }], ['comunidade', 'Ana Paula Reis', 'stories', null, null],
  ['saiu', null, 'instagram', null, { segundos: 84, rolou: 62 }], ['comecou', null, 'anuncio-meta', anuncios[1].id, null], ['app-entrou', 'Roberto Alves', 'anuncio-meta', anuncios[6].id, null],
]
const feed: EventoAoVivo[] = EVENTOS.map(([evento, nome, canal, conteudo, detalhe], i) => ({
  id: 100 - i, quando: ha(i * 0.7), evento, pagina: evento === 'respondeu' ? '/n/cadastro/questionario/' : '/n/cadastro/', canal, conteudo,
  link: canal === 'telegram' ? 'telegram-canal-naor-0411' : canal === 'stories' ? 'stories-naor-0411-manha' : null,
  detalhe, parceiro: 'n', visitante: `vis${i}abcdEFGH`, dispositivo: 'celular', navegador: canal === 'stories' || canal === 'instagram' ? 'instagram' : canal === 'telegram' ? 'telegram' : 'instagram', visitas: 1 + (i % 2), nome, cadastrado: !!nome,
}))
const pessoas: PessoaDaLista[] = feed.map((e, i) => ({
  visitante: e.visitante, parceiro: 'n', primeiro_canal: e.canal, canal: e.canal, conteudo: e.conteudo, link: e.link, dispositivo: 'celular', navegador: e.navegador,
  visitas: e.visitas, eventos: 6 + i * 3, primeira_em: ha(60 + i * 9), ultima_em: e.quando, nome: e.nome, email: e.nome ? `${e.nome.split(' ')[0].toLowerCase()}@gmail.com` : null, cadastrado: !!e.nome,
  passos: e.nome ? ['entrada', 'formulario', 'comecou', 'cadastro', ...(i % 2 ? ['respondeu', 'comunidade'] : [])] : ['entrada', ...(i % 3 ? ['formulario'] : [])],
}))
const ficha = (v: string): FichaDaPessoa => ({
  visitante: { visitante: v, parceiro: 'n', p_canal: 'telegram', p_origem: null, p_meio: null, p_campanha: null, p_conteudo: null, p_link: 'telegram-canal-naor-0411', p_ref: 't.me',
    u_canal: 'anuncio-meta', u_origem: 'meta', u_meio: 'pago', u_campanha: 'GF | Naor | Cadastro 09/11', u_conteudo: anuncios[4].id, u_link: null, u_ref: null,
    dispositivo: 'celular', navegador: 'instagram', visitas: 2, eventos: 23, primeira_em: ha(1500), ultima_em: ha(2), email_normalizado: 'mariana@gmail.com' },
  lead: { nome: 'Mariana Souza', email: 'mariana@gmail.com', telefone: '(11) 98888-1234', quando: ha(3), questionario: ha(2), exCliente: false, produtos: [], origem: 'meta', conteudo: anuncios[4].id },
  conta: { criadaEm: ha(3), vistoEm: ha(1), acessos: 2, status: 'aguardando', categoria: 'gold', notificacoes: true, minutosNaLive: 0 },
  eventos: [
    ['entrada', 1500, '/n/cadastro/', 'telegram', null], ['rolou-25', 1499, '/n/cadastro/', 'telegram', null], ['clique', 1498, '/n/cadastro/', 'telegram', { alvo: 'Ver como funciona' }], ['saiu', 1497, '/n/cadastro/', 'telegram', { segundos: 74, rolou: 38 }],
    ['entrada', 8, '/n/cadastro/', 'anuncio-meta', null], ['formulario', 7, '/n/cadastro/', 'anuncio-meta', null], ['comecou', 6, '/n/cadastro/', 'anuncio-meta', null], ['campo', 5.5, '/n/cadastro/', 'anuncio-meta', { campo: 'nome' }],
    ['enviou', 4, '/n/cadastro/', 'anuncio-meta', null], ['cadastro', 3.9, '/n/cadastro/', 'anuncio-meta', null], ['questionario', 3.5, '/n/cadastro/questionario/', 'anuncio-meta', null],
    ['respondeu', 2.2, '/n/cadastro/questionario/', 'anuncio-meta', { exCliente: false }], ['obrigado', 2, '/n/cadastro/obrigado/', 'anuncio-meta', null], ['notificacoes', 1.5, '/n/cadastro/obrigado/', 'anuncio-meta', null],
  ].map(([evento, min, pagina, canal, detalhe], i) => ({ id: i + 1, quando: ha(min as number), evento: evento as string, pagina: pagina as string, canal: canal as string, conteudo: canal === 'anuncio-meta' ? anuncios[4].id : null, link: canal === 'telegram' ? 'telegram-canal-naor-0411' : null, detalhe: detalhe as Record<string, unknown> | null })),
  outros: [],
})
let links: LinkDeRastreio[] = [
  { id: '1', codigo: 'telegram-canal-naor-0411', nome: 'Telegram, canal do Naor, 04/11', canal: 'telegram', parceiro: 'n', arquivado: false, criado_em: ha(300), visitantes: 121, cadastros: 31 },
  { id: '2', codigo: 'stories-naor-0411-manha', nome: 'Stories do Naor, 04/11 de manhã', canal: 'stories', parceiro: 'n', arquivado: false, criado_em: ha(280), visitantes: 58, cadastros: 12 },
]
const api: ApiCentral = {
  resumo: async () => resumo, aoVivo: async (_s, _p, depois) => (depois ? [] : feed), pessoas: async () => pessoas, pessoa: async (_s, v) => ficha(v),
  links: async () => links,
  criarLink: async (_s, parceiro, nome, canal, codigo) => { const l = { id: String(Date.now()), codigo, nome, canal, parceiro, arquivado: false, criado_em: new Date().toISOString(), visitantes: 0, cadastros: 0 }; links = [l, ...links]; return l },
  arquivarLink: async (_s, id, arq) => { links = links.map((l) => (l.id === id ? { ...l, arquivado: arq } : l)) },
}
const painel = { anuncios } as unknown as PainelDaMeta
const apiAnuncios = { painel: async () => painel } as unknown as ApiAnuncios
const sessao = { token: 'lab' } as unknown as SessaoTeeds

export default function LabCentral() {
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)', padding: 'clamp(12px, 3vw, 28px)', boxSizing: 'border-box' }}><CentralRastreio sessao={sessao} api={api} apiAnuncios={apiAnuncios} /></div>
}
