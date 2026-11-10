import { useEffect, useState } from 'react'
import type { PerfilDeStories, Story } from '../../core/teeds/stories'
import { AdminStories } from './AdminStories'
import { proximaLive, type Camada } from '../../core/teeds/camadas'

/**
 * Laboratório dos Stories (08/11/2026), com dados de EXEMPLO:
 *  - ?tela=inicio&stories=1[&equipe=1][&aovivo=1]: as bolinhas na Início (EXEMPLO_DE_STORIES);
 *  - ?tela=stories-admin[&tema=escuro]: a aba da Administração com um banco de mentira
 *    (painel, métricas, alcance, envio do arquivo com progresso).
 */
const B = import.meta.env.BASE_URL
const img = (n: string) => `${B}aulas-globalfly/${n}-mobile.webp`
const agora = Date.now()
const ha = (min: number) => new Date(agora - min * 60_000).toISOString()

const st = (id: string, f: Partial<Story>): Story => ({
  id, codigo: id, tipo: 'imagem', midia: '', capa: null, duracao: 6, enquadramento: {}, chip: null, titulo: null, subtitulo: null,
  quando: ha(60), destaque: false, compartilhar: true, responder: true, visto: false, reacao: null, botao: null, camadas: [], votos: null, meuVoto: null, ...f,
})

export const EXEMPLO_DE_STORIES: PerfilDeStories[] = [
  { id: 'gf', nome: 'GlobalFly', foto: '/globalfly-monograma-claro.png', oficial: true, ordem: 0, parceiro: null, itens: [
    st('a0', { midia: img('operando-na-pratica'), quando: ha(20), duracao: 10, publico: { todos: true }, pessoas: 1284, votos: null, meuVoto: null, camadas: [
      { id: 'c1', tipo: 'local', texto: 'São Paulo, SP', estilo: 'branco', x: 30, y: 14, escala: 1, rotacao: -4 },
      { id: 'c2', tipo: 'texto', texto: 'Hoje tem live\ncom as 5 I.A.', fonte: 'forte', cor: '#FFFFFF', fundo: 'nenhum', alinhar: 'center', x: 50, y: 30, escala: 1.15, rotacao: 0 },
      { id: 'c3', tipo: 'contagem', titulo: 'Live de hoje', ate: proximaLive(), estilo: 'azul', x: 50, y: 50, escala: 1, rotacao: 0 },
      { id: 'c4', tipo: 'enquete', pergunta: 'Já ligou sua I.A. hoje?', opcoes: ['Sim', 'Ainda não'], x: 50, y: 71, escala: 0.9, rotacao: 0 },
      { id: 'c5', tipo: 'link', url: 'https://globalflytrade.com', texto: 'Entrar na live', acao: 'aovivo', estilo: 'ouro', x: 50, y: 86, escala: 1, rotacao: 0 },
      { id: 'c6', tipo: 'emoji', emoji: '✈️', x: 80, y: 22, escala: 0.8, rotacao: 12 },
    ] as Camada[] }),
    st('a1', { midia: img('boas-vindas'), chip: 'Comece aqui', titulo: 'Bem-vindo a bordo', subtitulo: 'A aula 1 mostra a plataforma em 8 minutos.', botao: { tipo: 'aula', texto: 'Ver aula', destino: null }, quando: ha(120), publico: { todos: true }, pessoas: 942 }),
    st('a2', { midia: img('primeiro-deposito'), chip: 'Passo a passo', titulo: 'Primeiro depósito em 2 minutos', subtitulo: 'Direto no caixa da Deriv, pelo celular.', botao: { tipo: 'deposito', texto: null, destino: null }, quando: ha(300), publico: { subplanos: ['gold'] } }),
  ] },
  { id: 'v', nome: 'Victor', foto: '/parceiros/v.webp', oficial: true, ordem: 10, parceiro: 'v', itens: [
    st('b1', { midia: img('operando-na-pratica'), chip: 'Domingo · 20h30', titulo: 'Live de lançamento hoje', subtitulo: 'Entre 5 minutos antes. O link aparece aqui.', botao: { tipo: 'aovivo', texto: 'Me lembrar', destino: null }, quando: ha(45), publico: { parceiros: ['v'] } }),
  ] },
  { id: 'n', nome: 'Naor', foto: '/parceiros/n.webp', oficial: true, ordem: 20, parceiro: 'n', itens: [
    st('c1', { midia: img('gestao-na-pratica'), chip: 'Gerenciamento', titulo: 'Meta e limite antes de ligar a I.A.', quando: ha(180) }),
    st('c2', { midia: img('o-que-sao-as-ias'), chip: 'Aula nova', titulo: 'O que são as I.A. da GlobalFly', subtitulo: 'As 5 estratégias, uma por uma.', quando: ha(480), botao: { tipo: 'aula', texto: null, destino: null } }),
  ] },
  { id: 'p', nome: 'Phenom', foto: `/aulas-globalfly/robo-phenom-mobile.webp`, oficial: false, ordem: 30, parceiro: null, itens: [
    st('d1', { midia: img('robo-phenom'), chip: 'I.A. da frota', titulo: 'Conheça a Phenom', visto: true, quando: ha(600), botao: { tipo: 'ia', texto: null, destino: null } }),
  ] },
  { id: 'r', nome: 'Raptor', foto: `/aulas-globalfly/robo-raptor-mobile.webp`, oficial: false, ordem: 40, parceiro: null, itens: [
    st('e1', { midia: img('robo-raptor'), titulo: 'Raptor: rápida e direta', visto: true, quando: ha(900) }),
  ] },
  { id: 'f', nome: 'Falcon', foto: `/aulas-globalfly/robo-falcon-mobile.webp`, oficial: false, ordem: 50, parceiro: null, itens: [
    st('f1', { midia: img('robo-falcon'), titulo: 'Falcon: a porta baixa', visto: true, quando: ha(1100) }),
  ] },
]

/* --------------------------------------------- o banco de mentira do painel */
const PERFIS = [
  { id: 'gf', nome: 'GlobalFly', foto_url: '/globalfly-monograma-claro.png', parceiro: null, oficial: true, ordem: 0, ativo: true },
  { id: 'v', nome: 'Victor', foto_url: '/parceiros/v.webp', parceiro: 'v', oficial: true, ordem: 10, ativo: true },
  { id: 'n', nome: 'Naor', foto_url: '/parceiros/n.webp', parceiro: 'n', oficial: true, ordem: 20, ativo: true },
]
const linha = (id: string, perfil: number, midia: string, titulo: string, f: Record<string, unknown>, pessoas: number, completos: number) => ({
  story: { id, codigo: id, perfil_id: PERFIS[perfil].id, tipo: 'imagem', midia_url: img(midia), midia_caminho: null, capa_url: null, duracao: 6, enquadramento: {},
    chip: null, titulo, subtitulo: null, botao_tipo: 'aula', botao_texto: null, botao_destino: null, publico: { todos: true }, inicia_em: ha(120),
    expira_em: new Date(agora + 20 * 3600_000).toISOString(), destaque: false, compartilhar: true, responder: true, status: 'publicado', avisado_em: null,
    criado_por: 'lab', criado_por_nome: 'Tiago', criado_em: ha(120), ...f },
  perfil: { id: PERFIS[perfil].id, nome: PERFIS[perfil].nome, foto: PERFIS[perfil].foto_url, oficial: true, parceiro: PERFIS[perfil].parceiro },
  vistas: Math.round(pessoas * 1.3), pessoas, completos,
})
const PAINEL = [
  linha('s1', 0, 'primeiro-deposito', 'Primeiro depósito em 2 minutos', { chip: 'Passo a passo', avisado_em: ha(110) }, 962, 587),
  linha('s2', 1, 'operando-na-pratica', 'Live de lançamento hoje', { inicia_em: ha(50), publico: { parceiros: ['v'] }, criado_por_nome: 'Victor' }, 1284, 950),
  linha('s3', 2, 'gestao-na-pratica', 'Meta e limite antes de ligar a I.A.', { inicia_em: ha(200), publico: { parceiros: ['n'] }, criado_por_nome: 'Naor' }, 388, 202),
  linha('s4', 0, 'boas-vindas', 'Bem-vindo a bordo', { destaque: true, expira_em: null, inicia_em: ha(9000) }, 2911, 1980),
  linha('s5', 0, 'robo-phenom', 'Conheça a Phenom', { inicia_em: new Date(agora + 26 * 3600_000).toISOString(), publico: { subplanos: ['black', 'prestige'] } }, 0, 0),
  linha('s6', 0, 'robo-raptor', 'Raptor: rápida e direta', { status: 'arquivado', inicia_em: ha(4000) }, 540, 300),
]
function metricas(id: string) {
  const l = PAINEL.find((x) => x.story.id === id) ?? PAINEL[0]
  const p = l.pessoas, fim = l.completos
  const ret = Array.from({ length: 7 }, (_, s) => Math.round(s === 0 ? p : s === 1 ? p * 0.93 : s === 2 ? p * 0.8 : p - (p - fim) * (0.55 + s * 0.075)))
  ret[6] = fim
  const nomes = ['Ana Paula Ribeiro', 'Marcos Vieira', 'Juliana Souza', 'Rafael Martins', 'Carla Fernandes', 'Diego Alves', 'Patrícia Lima', 'Bruno Costa']
  return {
    vistas: l.vistas, pessoas: p, completos: fim, publico: 2140, cliques: Math.round(p * 0.16), pessoas_clique: Math.round(p * 0.13),
    compartilhamentos: Math.round(p * 0.04), visitas_link: Math.round(p * 0.09), cadastros_link: Math.round(p * 0.012), respostas: 4,
    curtidas: Math.round(p * 0.11),
    reacoes: { '🔥': Math.round(p * 0.04), '👏': Math.round(p * 0.02), '❤️': Math.round(p * 0.03), '😮': 6 },
    navegacao: { avancou: Math.round(p * 0.21), voltou: Math.round(p * 0.04), saiu: Math.round(p * 0.11), pulou: Math.round(p * 0.07), pausou: Math.round(p * 0.05) },
    retencao: ret, por_subplano: { gold: Math.round(p * 0.74), black: Math.round(p * 0.2), prestige: Math.round(p * 0.06) },
    por_parceiro: { v: Math.round(p * 0.61), n: Math.round(p * 0.37), direto: Math.round(p * 0.02) },
    por_hora: Array.from({ length: 10 }, (_, i) => ({ hora: new Date(agora - (9 - i) * 3600_000).toISOString(), n: Math.round(p * [0.3, 0.18, 0.12, 0.09, 0.07, 0.06, 0.05, 0.05, 0.04, 0.04][i]) })),
    quem: nomes.map((nome, i) => ({ user_id: `u${i}`, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`, parceiro: i % 3 ? 'v' : 'n', subplano: i === 3 ? 'prestige' : i % 4 === 1 ? 'black' : 'gold',
      segundos: [6, 6, 3.4, 6, 1.8, 6, 5.2, 6][i], completo: [1, 1, 0, 1, 0, 1, 0, 1][i] === 1, vezes: [2, 1, 1, 3, 1, 1, 1, 2][i], reacao: ['🔥', null, null, '👏', null, '❤️', null, null][i],
      foto: i === 1 ? `${B}parceiros/v.webp` : i === 3 ? `${B}parceiros/n.webp` : null,
      curtiu: [1, 1, 0, 1, 0, 0, 1, 0][i] === 1, curtiu_em: ha(3 + i * 7), respondeu: i === 2 || i === 3,
      primeira: ha(4 + i * 7 + (i === 3 ? 60 * 26 : 0)), quando: ha(4 + i * 7 + (i > 5 ? 60 * 30 : 0)), clicou: [1, 0, 0, 1, 0, 1, 0, 0][i] === 1, compartilhou: i === 3 })),
    ultimas_respostas: [{ nome: 'Juliana Souza', texto: 'Consegui depositar pelo Pix, obrigada!', quando: ha(12) }, { nome: 'Rafael Martins', texto: 'Vai ter gravação da live?', quando: ha(40) }],
  }
}

function ligarBancoDeMentira() {
  const original = window.fetch.bind(window)
  window.fetch = async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const corpo = opcoes?.body ? JSON.parse(String(opcoes.body)) : {}
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
    await new Promise((ok) => setTimeout(ok, 250))
    if (url.includes('/rpc/teeds_stories_painel')) return json(PAINEL)
    if (url.includes('/rpc/teeds_story_metricas')) return json(metricas(corpo.p_story))
    if (url.includes('/rpc/teeds_stories_alcance')) return json(corpo.p_publico?.so_admins ? 6 : corpo.p_publico?.todos ? 2140 : 310 + (corpo.p_publico?.subplanos?.length ?? 0) * 220)
    if (url.includes('/rpc/teeds_story_salvar')) { const s = { ...PAINEL[0].story, ...corpo.p, id: `n${Date.now()}`, criado_por_nome: 'Tiago' }; PAINEL.unshift({ ...PAINEL[0], story: s, pessoas: 0, vistas: 0, completos: 0 }); return json(s) }
    if (url.includes('/rpc/teeds_story_remover')) return json(null)
    if (url.includes('/rpc/teeds_story_perfil_salvar')) return json(corpo.p)
    if (url.includes('/rpc/teeds_sou_admin_geral')) return json(true)
    if (url.includes('/rest/v1/parceiros')) return json([{ codigo: 'n', nome: 'Naor Bueno' }, { codigo: 'v', nome: 'Victor Cordeiro' }])
    if (url.includes('/rest/v1/stories_perfis')) return json(PERFIS)
    if (url.includes('/rest/v1/clientes')) return json([{ user_id: 'u1', nome: 'Ana Paula Ribeiro', foto_url: null }, { user_id: 'u2', nome: 'Anderson Lima', foto_url: null }, { user_id: 'u3', nome: 'Mariana Costa', foto_url: '/parceiros/n.webp' }])
    if (url.includes('/functions/v1/notificacoes')) return json({ enviados: 214 })
    return original(entrada, opcoes)
  }
  // o envio ao Storage: a barra anda e responde 200
  const abrir = XMLHttpRequest.prototype.open
  const enviar = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { _lab?: boolean }, metodo: string, url: string | URL, ...resto: unknown[]) {
    this._lab = String(url).includes('/storage/v1/object/stories')
    return (abrir as (...a: unknown[]) => void).call(this, metodo, url, ...resto)
  } as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { _lab?: boolean }, corpo?: Document | XMLHttpRequestBodyInit | null) {
    if (!this._lab) return enviar.call(this, corpo)
    let p = 0
    const t = setInterval(() => {
      p = Math.min(1, p + 0.05)
      const prog = this.upload.onprogress as ((e: unknown) => void) | null
      prog?.({ lengthComputable: true, loaded: p, total: 1 })
      if (p >= 1) { clearInterval(t); Object.defineProperty(this, 'status', { value: 200 }); (this.onload as ((e: unknown) => void) | null)?.(new ProgressEvent('load')) }
    }, 160)
  }
}

export function ligarLab() { ligarBancoDeMentira() }

export default function LabStories() {
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tema'); if (t) document.documentElement.dataset.tema = t
    ligarBancoDeMentira(); setPronto(true)
  }, [])
  if (!pronto) return null
  return (
    <div className="app" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px clamp(16px, 3vw, 32px) 64px' }}>
        <header style={{ marginBottom: 16 }}><span className="rot">GlobalFly Trade Admin</span><h1 style={{ margin: '4px 0' }}>Stories</h1><p style={{ margin: 0, color: 'var(--muted)' }}>Vídeos verticais nas bolinhas do topo da Início.</p></header>
        <AdminStories sessao={{ token: 'lab', usuario: { id: 'lab' } } as never} papel={{ admin: true, geral: true, parceiro: null, nomeDoParceiro: null, total: true, ve: [] }} />
      </main>
    </div>
  )
}
