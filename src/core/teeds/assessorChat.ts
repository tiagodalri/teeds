import { SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { whatsappDeExemplo, whatsappDoBanco, type ContatoWpp, type MensagemWpp, type WhatsAppApi } from './whatsapp'

/*
  O chat do Assessor GF no ADM (25/11/2026, Tiago: "preciso do chat mesmo… se eu quiser responder alguém
  manualmente… daquele jeito que você fez na outra aba de WhatsApp").

  É a MESMA central da aba WhatsApp (CentralWhatsApp), com esta fonte de dados: as conversas chegam pelo servidor
  (que recebe da Z-API) e as respostas da equipe saem pelo número do Assessor. O que é só da API oficial da Meta
  (janela de 24 h, modelos aprovados, começar conversa) não existe aqui: no Assessor o cliente chama primeiro.
  Respostas prontas e a equipe são as mesmas da aba WhatsApp.
*/

const PERFIL_DO_ASSESSOR = {
  assessor: true, semJanela: true, semModelos: true, semNovaConversa: true,
  titulo: 'Assessor GF',
  aviso: 'As mensagens chegam pelo WhatsApp do Assessor e ficam guardadas na plataforma. Só a administração geral vê esta conversa.',
  boasVindas: 'Aqui aparecem as conversas dos clientes com o Assessor GF, ao vivo. Abra uma para ler o que a I.A. respondeu. Para responder você mesmo, toque em Assumir: o Assessor fica quieto naquela conversa até você devolver.',
} as const

async function pedir<T>(sessao: SessaoTeeds, caminho: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}/api/admin/assessor/${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
    })
  } catch {
    throw new Error(`Não consegui falar com o servidor da ${MARCA.prosa}. Tente de novo em instantes.`)
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
  return corpo as T
}
const postar = <T>(sessao: SessaoTeeds, caminho: string, corpo: Record<string, unknown>) => pedir<T>(sessao, caminho, { method: 'POST', body: JSON.stringify(corpo) })

const paraBase64 = (f: File) => new Promise<string>((ok, nao) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''))
  r.onerror = () => nao(new Error('Não consegui ler o arquivo.'))
  r.readAsDataURL(f)
})

export function assessorDoServidor(sessao: SessaoTeeds): WhatsAppApi {
  const banco = whatsappDoBanco(sessao, 'globalfly')
  const links = new Map<string, Promise<string>>()
  const api: WhatsAppApi = {
    euId: sessao.usuario.id,
    exemplo: false,
    perfil: PERFIL_DO_ASSESSOR,
    async estado() {
      const z = await fetch(`${SERVIDOR.url}/api/admin/zapi`, { headers: { Authorization: `Bearer ${sessao.token}` } }).then((r) => r.json()).catch(() => ({} as any))
      return {
        podeVer: true, podeConectar: null, dono: null, conectado: !!z?.conectado, webhook: null,
        conta: { marca: 'globalfly', parceiro: null, numero: z?.numero ? `+${z.numero}` : null, nomeVerificado: 'Assessor GF', qualidade: null, limite: null, situacao: z?.conectado ? 'conectado' : z?.configurado ? 'erro' : 'desconectado', erro: z?.erro ?? null, ultimoAvisoEm: null, conectadoEm: null, phoneNumberId: null, wabaId: null, appId: null },
      }
    },
    conectar: () => Promise.reject(new Error('A conexão do Assessor fica na aba Conexão.')),
    desconectar: () => Promise.reject(new Error('A conexão do Assessor fica na aba Conexão.')),
    atualizar: async () => ({ modelos: 0 }),
    async contatos() { return (await pedir<{ conversas: ContatoWpp[] }>(sessao, 'conversas')).conversas },
    async mensagens(id, antesDe) { return (await pedir<{ mensagens: MensagemWpp[] }>(sessao, `mensagens?numero=${encodeURIComponent(id)}${antesDe ? `&antes=${encodeURIComponent(antesDe)}` : ''}`)).mensagens },
    async enviarTexto(id, texto, citando) { await postar(sessao, 'enviar', { numero: id, texto, citando: citando ?? null }) },
    async enviarArquivo(id, arquivo, legenda) {
      if (arquivo.size > 1_400_000) throw new Error('Pelo Assessor dá para mandar arquivo de até 1,4 MB. Mande um menor.')
      await postar(sessao, 'arquivo', { numero: id, nome: arquivo.name, mime: arquivo.type, dados: await paraBase64(arquivo), legenda: legenda ?? '' })
    },
    enviarModelo: () => Promise.reject(new Error('O Assessor não usa modelos aprovados.')),
    async nota(id, texto) { return (await postar<{ mensagem: MensagemWpp }>(sessao, 'nota', { numero: id, texto })).mensagem },
    async ler(id) { await postar(sessao, 'ler', { numero: id }) },
    async mudarContato(id, campos) { await postar(sessao, 'conversa', { numero: id, campos }) },
    async reagir(id, wamid, emoji) { await postar(sessao, 'reagir', { numero: id, wamid, emoji }) },
    novo: () => Promise.reject(new Error('No Assessor o cliente chama primeiro.')),
    respostas: () => banco.respostas(),
    salvarResposta: (r) => banco.salvarResposta(r),
    apagarResposta: (id) => banco.apagarResposta(id),
    modelos: async () => [],
    async ficha(id) { return pedir(sessao, `ficha?numero=${encodeURIComponent(id)}`) },
    async arquivos(id) { return pedir(sessao, `arquivos?numero=${encodeURIComponent(id)}`) },
    buscarPessoas: async () => [],
    async buscarMensagens(q) { return (await pedir<{ achados: any[] }>(sessao, `buscar?q=${encodeURIComponent(q)}`)).achados },
    async favoritar(id, sim) { await postar(sessao, 'favoritar', { id, sim }) },
    async todasMensagens(id) { return (await pedir<{ mensagens: MensagemWpp[] }>(sessao, `todas?numero=${encodeURIComponent(id)}`)).mensagens },
    equipe: () => banco.equipe(),
    parceiros: () => banco.parceiros(),
    abrirArquivo(m) {
      const caminho = m.caminho
      if (!caminho) return Promise.reject(new Error('arquivo'))
      let p = links.get(caminho)
      if (!p) {
        p = pedir<{ url: string }>(sessao, `arquivo?caminho=${encodeURIComponent(caminho)}`).then((d) => d.url)
        p.catch(() => links.delete(caminho))
        links.set(caminho, p)
        setTimeout(() => links.delete(caminho), 50 * 60_000) // o link assinado vale 1 h
      }
      return p
    },
    acompanhar(aoMudar, aoEstado) {
      // o servidor guarda tudo; a tela pergunta o que mudou a cada 3 s (mais devagar com a aba escondida)
      let desde = new Date().toISOString()
      let vivo = true
      let falhas = 0
      let t: ReturnType<typeof setTimeout> | null = null
      const vistas = new Set<string>()
      const passo = async () => {
        if (!vivo) return
        try {
          const d = await pedir<{ agora: string; contatos: ContatoWpp[]; mensagens: MensagemWpp[] }>(sessao, `mudancas?desde=${encodeURIComponent(desde)}`)
          desde = d.agora
          for (const c of d.contatos) aoMudar({ tipo: 'contato', item: c })
          for (const m of d.mensagens) { aoMudar({ tipo: 'mensagem', item: m, nova: !vistas.has(m.id) }); vistas.add(m.id) }
          if (vistas.size > 4000) vistas.clear()
          falhas = 0; aoEstado?.(true)
        } catch { falhas++; if (falhas >= 2) aoEstado?.(false) }
        if (vivo) t = setTimeout(passo, document.hidden ? 15_000 : 3_000)
      }
      t = setTimeout(passo, 800)
      return () => { vivo = false; if (t) clearTimeout(t) }
    },
  }
  return api
}

/** Para o laboratório: as conversas de exemplo da central, com o jeito do Assessor (pausar, I.A. assinando). */
export function assessorDeExemplo(euId = 'eu'): WhatsAppApi {
  const base = whatsappDeExemplo({ conectado: true, podeVer: true }, euId)
  const pausas = new Map<string, boolean>()
  return {
    ...base,
    exemplo: false,
    perfil: PERFIL_DO_ASSESSOR,
    async contatos() {
      const l = await base.contatos()
      return l.map((c, i) => ({ ...c, iaPausada: pausas.get(c.id) ?? i === 1 }))
    },
    async mensagens(id, antes) {
      const l = await base.mensagens(id, antes)
      // na conversa que a equipe não assumiu, quem respondeu foi o Assessor
      const comEquipe = (await this.contatos()).find((c) => c.id === id)?.iaPausada
      return l.map((m) => (m.direcao === 'saida' && !comEquipe ? { ...m, autor: 'assessor' } : m))
    },
    async mudarContato(id, campos) {
      if (typeof campos.iaPausada === 'boolean') pausas.set(id, campos.iaPausada)
      await base.mudarContato(id, campos)
    },
  }
}
