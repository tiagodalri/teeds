import { useMemo } from 'react'
import { ChatDaEquipe } from './ChatDaEquipe'
import { Monograma } from '../marca/Monograma'
import '../suporte/suporte.css'
import type { ConversaEq, EquipeApi, MensagemEq, MudancaEq } from '../../core/teeds/equipe'

/**
 * Laboratório do chat da equipe (?tela=equipe): a equipe de mentira em
 * memória, para ver a tela sem banco. O Victor responde sozinho alguns
 * segundos depois de cada mensagem no grupo, e o Naor manda uma direta com a
 * janela fechada (para ver o recado do canto e o selo).
 */
const EU = 'tiago'
const PESSOAS = [
  { id: 'tiago', nome: 'Tiago Dal Ri' },
  { id: 'victor', nome: 'Victor Cordeiro' },
  { id: 'dias', nome: 'Victor Dias de Avila' },
  { id: 'naor', nome: 'Naor Bezerra Santos' },
]
const agora = Date.now()
const iso = (minAtras: number) => new Date(agora - minAtras * 60_000).toISOString()

function criarApi(): EquipeApi {
  const conversas: ConversaEq[] = [
    { id: 'grupo', tipo: 'grupo', ultimaEm: null, ultimaTexto: null, ultimaAutor: null, participantes: PESSOAS.map((p) => ({ userId: p.id, lidaEm: iso(0) })) },
    { id: 'd-victor', tipo: 'direta', ultimaEm: null, ultimaTexto: null, ultimaAutor: null, participantes: [{ userId: EU, lidaEm: iso(0) }, { userId: 'victor', lidaEm: iso(30) }] },
  ]
  const msgs: MensagemEq[] = []
  let n = 0
  const add = (conversaId: string, autor: string, texto: string, minAtras: number, extra: Partial<MensagemEq> = {}) => {
    const m: MensagemEq = { id: `m${++n}`, conversaId, autor, texto, anexo: null, respostaA: null, apagada: false, criadaEm: iso(minAtras), ...extra }
    msgs.push(m)
    const c = conversas.find((x) => x.id === conversaId)!
    c.ultimaEm = m.criadaEm; c.ultimaTexto = texto || 'Imagem'; c.ultimaAutor = autor
    return m
  }
  add('grupo', 'victor', 'Bom dia, equipe! Miqueias chega às 9h para gravar as aulas.', 26 * 60)
  add('grupo', 'naor', 'Show. Já mandei o link /n para a minha lista ontem.', 25 * 60)
  const pergunta = add('grupo', 'dias', 'Os criativos da live de 09/11 ficam prontos quando?', 50)
  add('grupo', EU, 'Até sexta. Estou fechando a apostila e o chat da equipe agora.', 44, { respostaA: pergunta.id })
  add('grupo', 'victor', 'Perfeito 👊', 43)
  add('grupo', 'victor', 'Depois me passa como ficou a divisão das comissões do /n e do /v?', 42)
  add('d-victor', 'victor', 'Tiago, consegue olhar o cadastro de um cliente meu que ficou em análise?', 35)
  add('d-victor', EU, 'Consigo, me manda o e-mail dele.', 31)
  // o Victor leu até a última; o grupo, todos leram menos o Naor
  conversas[0].participantes = conversas[0].participantes.map((p) => (p.userId === 'naor' ? { ...p, lidaEm: iso(45) } : p))
  conversas[1].participantes = conversas[1].participantes.map((p) => (p.userId === 'victor' ? { ...p, lidaEm: iso(30) } : p))
  const naoLidas: Record<string, number> = { grupo: 2 }
  const presenca: Record<string, string | null> = { tiago: iso(0), victor: iso(0.5), dias: iso(190), naor: iso(60 * 26) }

  let ouvinte: ((m: MudancaEq) => void) | null = null
  const avisar = (m: MudancaEq) => ouvinte?.(m)
  const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms))

  const api: EquipeApi = {
    euId: EU,
    async abrir() { await espera(); return { grupo: 'grupo', contatos: await api.contatos(), conversas: await api.conversas(), naoLidas: { ...naoLidas } } },
    async contatos() { return PESSOAS.map((p) => ({ id: p.id, nome: p.nome, vistoEm: presenca[p.id] })) },
    async conversas() { return conversas.map((c) => ({ ...c, participantes: c.participantes.map((p) => ({ ...p })) })) },
    async mensagens(conversaId, antesDe) {
      await espera()
      return msgs.filter((m) => m.conversaId === conversaId && (!antesDe || m.criadaEm < antesDe)).map((m) => ({ ...m }))
    },
    async mandar(conversaId, d) {
      await espera(350)
      const m = add(conversaId, EU, d.texto, 0, { anexo: d.anexo ?? null, respostaA: d.respostaA ?? null })
      m.criadaEm = new Date().toISOString()
      avisar({ tipo: 'mensagem', item: { ...m }, nova: true })
      // alguém lê e responde
      const outro = conversaId === 'grupo' ? 'victor' : conversas.find((c) => c.id === conversaId)?.participantes.find((p) => p.userId !== EU)?.userId
      if (outro) {
        setTimeout(() => {
          const c = conversas.find((x) => x.id === conversaId)!
          for (const p of c.participantes) if (p.userId !== EU) { p.lidaEm = new Date().toISOString(); avisar({ tipo: 'leitura', conversaId, userId: p.userId, lidaEm: p.lidaEm }) }
        }, 1500)
        setTimeout(() => {
          const r = add(conversaId, outro, conversaId === 'grupo' ? 'Fechado! Vou avisar o Naor também.' : 'Beleza, valeu!', 0)
          r.criadaEm = new Date().toISOString()
          avisar({ tipo: 'mensagem', item: { ...r }, nova: true })
        }, 3500)
      }
      return { ...m }
    },
    async direta(outro) {
      await espera()
      const id = `d-${outro}`
      if (!conversas.some((c) => c.id === id)) conversas.push({ id, tipo: 'direta', ultimaEm: null, ultimaTexto: null, ultimaAutor: null, participantes: [{ userId: EU, lidaEm: iso(0) }, { userId: outro, lidaEm: iso(0) }] })
      return id
    },
    async ler(conversaId) { naoLidas[conversaId] = 0 },
    async apagar(id) { const m = msgs.find((x) => x.id === id); if (m) { m.apagada = true; m.texto = ''; m.anexo = null } },
    async estouAqui() { presenca.tiago = new Date().toISOString() },
    async enviarPrint(_conversaId, arquivo) { await espera(600); return URL.createObjectURL(arquivo) },
    async abrirPrint(caminho) { return caminho },
    acompanhar(aoMudar, aoEstado) {
      ouvinte = aoMudar
      aoEstado?.(true)
      // com a janela fechada: o Naor manda uma direta
      const t = setTimeout(() => {
        if (!conversas.some((c) => c.id === 'd-naor')) conversas.push({ id: 'd-naor', tipo: 'direta', ultimaEm: null, ultimaTexto: null, ultimaAutor: null, participantes: [{ userId: EU, lidaEm: iso(0) }, { userId: 'naor', lidaEm: iso(0) }] })
        const m = add('d-naor', 'naor', 'Tiago, os clientes do /n já estão caindo no meu link de afiliado? 🙏', 0)
        m.criadaEm = new Date().toISOString()
        aoMudar({ tipo: 'mensagem', item: { ...m }, nova: true })
      }, 2500)
      return () => { clearTimeout(t); ouvinte = null }
    },
  }
  return api
}

export default function LabChatDaEquipe() {
  const api = useMemo(criarApi, [])
  return (
    <div style={{ minHeight: '100vh', padding: 32, background: 'var(--bg)', color: 'var(--text)' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Chat da equipe</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 520 }}>Laboratório: dados de mentira. Clique no botão dourado no canto. O Naor manda uma mensagem sozinho em 2,5 s; mandando no grupo, o Victor lê e responde.</p>
      {/* o botão do suporte de mentira, para ver o empilhamento do canto */}
      <div className="sp-lancador-area"><button type="button" className="sp-lancador"><span className="sp-lancador-circulo"><Monograma tamanho={28} /></span></button></div>
      <ChatDaEquipe api={api} />
    </div>
  )
}
