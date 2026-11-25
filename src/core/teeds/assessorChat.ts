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
  assessor: true, semJanela: true, semModelos: true,
  titulo: 'Assessor GF',
  aviso: 'As mensagens chegam pelo WhatsApp do Assessor e ficam guardadas na plataforma. Só a administração geral vê esta conversa.',
  boasVindas: 'Aqui aparecem as conversas dos clientes com o Assessor GF, ao vivo. Abra uma para ler o que a I.A. respondeu. Para responder você mesmo, toque em Assumir: o Assessor fica quieto naquela conversa até você devolver. Para falar primeiro com um cliente, toque em Nova conversa.',
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

/** Sobe o arquivo direto para o bucket pelo endereço assinado e pede ao servidor para mandar pelo Assessor. */
async function subirEEnviar(sessao: SessaoTeeds, numero: string, arquivo: File, extra: Record<string, unknown>): Promise<void> {
  if (arquivo.size > 16_000_000) throw new Error('O WhatsApp aceita arquivos de até 16 MB por aqui. Mande um menor.')
  const mime = arquivo.type || 'application/octet-stream'
  const { url, caminho } = await postar<{ url: string; caminho: string }>(sessao, 'subir', { numero, nome: arquivo.name, mime, tamanho: arquivo.size })
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'true' }, body: arquivo }).catch(() => null)
  if (!r?.ok) throw new Error('Não consegui subir o arquivo. Confira a internet e tente de novo.')
  await postar(sessao, 'arquivo', { numero, caminho, nome: arquivo.name, mime, tamanho: arquivo.size, ...extra })
}

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
        podeVer: true, podeConectar: null, dono: null, conectado: !!z?.conectado, webhook: null, assessorPausadoGeral: !!z?.pausadoGeral,
        conta: { marca: 'globalfly', parceiro: null, numero: z?.numero ? `+${z.numero}` : null, nomeVerificado: 'Assessor GF', qualidade: null, limite: null, situacao: z?.conectado ? 'conectado' : z?.configurado ? 'erro' : 'desconectado', erro: z?.erro ?? null, ultimoAvisoEm: null, conectadoEm: null, phoneNumberId: null, wabaId: null, appId: null },
      }
    },
    conectar: () => Promise.reject(new Error('A conexão do Assessor fica na aba Conexão.')),
    desconectar: () => Promise.reject(new Error('A conexão do Assessor fica na aba Conexão.')),
    atualizar: async () => ({ modelos: 0 }),
    async contatos() { return (await pedir<{ conversas: ContatoWpp[] }>(sessao, 'conversas')).conversas },
    async mensagens(id, antesDe) { return (await pedir<{ mensagens: MensagemWpp[] }>(sessao, `mensagens?numero=${encodeURIComponent(id)}${antesDe ? `&antes=${encodeURIComponent(antesDe)}` : ''}`)).mensagens },
    async enviarTexto(id, texto, citando) { await postar(sessao, 'enviar', { numero: id, texto, citando: citando ?? null }) },
    // 25/11/2026: o arquivo sobe direto para o armazenamento (até 16 MB) e a Z-API busca de lá: sem o teto de 2 MB do servidor
    async enviarArquivo(id, arquivo, legenda, citando) { await subirEEnviar(sessao, id, arquivo, { legenda: legenda ?? '', citando: citando ?? null }) },
    async enviarFigurinha(id, arquivo) { await subirEEnviar(sessao, id, arquivo, { figurinha: true }) },
    async enviarLocalizacao(id, d) { await postar(sessao, 'localizacao', { numero: id, ...d }) },
    async enviarContato(id, d) { await postar(sessao, 'contato', { numero: id, ...d }) },
    enviarModelo: () => Promise.reject(new Error('O Assessor não usa modelos aprovados.')),
    async nota(id, texto) { return (await postar<{ mensagem: MensagemWpp }>(sessao, 'nota', { numero: id, texto })).mensagem },
    async ler(id) { await postar(sessao, 'ler', { numero: id }) },
    async mudarContato(id, campos) { await postar(sessao, 'conversa', { numero: id, campos }) },
    async reagir(id, wamid, emoji) { await postar(sessao, 'reagir', { numero: id, wamid, emoji }) },
    async novo(numero, nome) { return (await postar<{ numero: string }>(sessao, 'nova', { numero, nome })).numero },
    respostas: () => banco.respostas(),
    salvarResposta: (r) => banco.salvarResposta(r),
    apagarResposta: (id) => banco.apagarResposta(id),
    modelos: async () => [],
    async ficha(id) { return pedir(sessao, `ficha?numero=${encodeURIComponent(id)}`) },
    async arquivos(id) { return pedir(sessao, `arquivos?numero=${encodeURIComponent(id)}`) },
    async buscarPessoas(q) { return (await pedir<{ pessoas: any[] }>(sessao, `pessoas?q=${encodeURIComponent(q)}`)).pessoas },
    async buscarMensagens(q) { return (await pedir<{ achados: any[] }>(sessao, `buscar?q=${encodeURIComponent(q)}`)).achados },
    async favoritar(id, sim) { await postar(sessao, 'favoritar', { id, sim }) },
    async sugerirResposta(id) { return (await postar<{ texto: string }>(sessao, 'sugerir', { numero: id })).texto },
    async pausarGeral(sim) { await postar(sessao, 'geral', { pausado: sim }) },
    async encaminhar(id, m, destinos) { return (await postar<{ enviados: number }>(sessao, 'encaminhar', { numero: id, id: m.id, destinos })).enviados },
    async apagar(id, m) { await postar(sessao, 'apagar', { numero: id, id: m.id }) },
    async editar(id, m, texto) { await postar(sessao, 'editar', { numero: id, id: m.id, texto }) },
    async postarStatus(d) {
      if (d.arquivo && d.arquivo.size > 1_400_000) throw new Error('Pelo Assessor dá para mandar arquivo de até 1,4 MB. Mande um menor.')
      await postar(sessao, 'status', { tipo: d.tipo, texto: d.texto, ...(d.arquivo ? { dados: await paraBase64(d.arquivo), mime: d.arquivo.type } : {}) })
    },
    async bloquear(id, sim) { await postar(sessao, 'bloquear', { numero: id, sim }) },
    async fotoDoContato(id) { return (await pedir<{ url: string | null }>(sessao, `foto?numero=${encodeURIComponent(id)}`).catch(() => ({ url: null }))).url },
    async fichaCompleta(id) { return pedir(sessao, `ficha-completa?numero=${encodeURIComponent(id)}`) },
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
          const d = await pedir<{ agora: string; contatos: ContatoWpp[]; mensagens: MensagemWpp[]; presencas?: Record<string, string> }>(sessao, `mudancas?desde=${encodeURIComponent(desde)}`)
          desde = d.agora
          aoMudar({ tipo: 'presenca', item: d.presencas ?? {} })
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
  let geral = false
  return {
    ...base,
    exemplo: false,
    perfil: PERFIL_DO_ASSESSOR,
    async estado() { return { ...(await base.estado()), assessorPausadoGeral: geral, conta: { marca: 'globalfly', parceiro: null, numero: '+5511914801613', nomeVerificado: 'Assessor GF', qualidade: null, limite: null, situacao: 'conectado', erro: null, ultimoAvisoEm: null, conectadoEm: null, phoneNumberId: null, wabaId: null, appId: null } } },
    async pausarGeral(sim) { geral = sim },
    async encaminhar(_id, _m, destinos) { await new Promise((r) => setTimeout(r, 500)); return destinos.length },
    async apagar() { await new Promise((r) => setTimeout(r, 300)) },
    async editar() { await new Promise((r) => setTimeout(r, 300)) },
    async postarStatus() { await new Promise((r) => setTimeout(r, 700)) },
    async bloquear() { await new Promise((r) => setTimeout(r, 300)) },
    async enviarFigurinha() { await new Promise((r) => setTimeout(r, 400)) },
    async enviarLocalizacao() { await new Promise((r) => setTimeout(r, 400)) },
    async enviarContato() { await new Promise((r) => setTimeout(r, 400)) },
    async fotoDoContato(id) { return id.endsWith('1') ? null : `https://i.pravatar.cc/240?u=${id}` },
    async fichaCompleta(id) {
      await new Promise((r) => setTimeout(r, 500))
      const c = (await base.contatos()).find((x) => x.id === id)
      if (id.endsWith('1')) return { ficha: null, fotoWhatsapp: null, talvez: [{ nome: 'Rafael Costa', email: 'rafael@exemplo.com' }] }
      const hoje = Date.now(), dia = 86_400_000, iso = (d: number) => new Date(hoje - d * dia).toISOString()
      return {
        fotoWhatsapp: `https://i.pravatar.cc/240?u=${id}`, talvez: [],
        ficha: {
          pessoa: { userId: 'u-' + id, nome: c?.nome ?? 'Cliente', email: 'cliente@exemplo.com', telefone: '(11) 98765-4321', cidade: 'Joinville', uf: 'SC', nascimento: '1991-04-12', fotoPlataforma: null, parceiro: 'v', parceiroNome: 'Victor Cordeiro', criadoEm: iso(41), vistoEm: iso(0.001), online: true, status: 'ativo', validade: null, subplano: 'black', whatsappConfirmadoEm: iso(2) },
          movimentos: [
            { quando: iso(1.2), tipo: 'saque', valor: 320, saldoDepois: 1284.6, conta: 'ROT90001234' },
            { quando: iso(6), tipo: 'deposito', valor: 500, saldoDepois: 1604.6, conta: 'ROT90001234' },
            { quando: iso(19), tipo: 'deposito', valor: 700, saldoDepois: 1180.2, conta: 'ROT90001234' },
            { quando: iso(38), tipo: 'deposito', valor: 300, saldoDepois: 300, conta: 'ROT90001234' },
          ],
          compartilhamento: { equipe: false, plano: 'black', percentual: 0.05, cotacao: 5.34, emAberto: 0, meses: [
            { mes: new Date().toISOString().slice(0, 8) + '01', fechado: false, resultado: 104.6, operacoes: 212, valorUsd: 5.23, valorBrl: 27.93, planoNoMes: 'black', percentualNoMes: 0.05, fatura: null },
            { mes: new Date(hoje - 31 * dia).toISOString().slice(0, 8) + '01', fechado: true, resultado: 52.3, operacoes: 140, valorUsd: 5.23, valorBrl: 28.1, planoNoMes: 'gold', percentualNoMes: 0.1, fatura: { numero: 12, situacao: 'paga', valorBrl: 28.1, valorUsd: 5.23, vencimento: new Date().toISOString().slice(0, 8) + '01', pagaEm: iso(20) } },
          ] },
          dinheiro: { saldoReal: 1284.6, saldoDemo: 9820, contaReal: 'ROT90001234', contaDemo: 'DOT90005678', saldoLidoEm: iso(0.003), depositos: 1500, saques: 320, qtdDepositos: 3, qtdSaques: 1, ultimoDeposito: iso(6), markupReal: 84.32, markupMes: 31.1 },
          resultado: {
            real: { total: 104.6, ia: 122.4, manual: -17.8, operacoes: 1840, ganhas: 1210, perdidas: 630, sessoes: 46 },
            demo: { total: -412.5, ia: -380, manual: -32.5, operacoes: 9200, ganhas: 5900, perdidas: 3300, sessoes: 120 },
            porIa: [{ nome: 'GF Raptor', real: 140.2, demo: -120, sessoes: 30 }, { nome: 'GF Falcon', real: -22.5, demo: -260, sessoes: 12 }, { nome: 'GF Legacy', real: 4.7, demo: 0, sessoes: 4 }],
            dias30: Array.from({ length: 30 }, (_, i) => ({ dia: new Date(hoje - (29 - i) * dia).toISOString().slice(0, 10), real: Math.round((Math.sin(i * 1.7) * 30 + (i % 4 === 0 ? 0 : 6)) * 100) / 100, demo: Math.round(Math.cos(i) * 80) })),
            primeiraOperacao: iso(39), ultimaOperacao: iso(0.02),
          },
          agora: [{ ia: 'GF Raptor', demo: false, resultado: 3.2, operacoes: 12, desde: iso(0.02) }],
          aulas: { total: 31, vistas: 22, concluidas: 17, minutos: 214, ultima: iso(1), ultimaTitulo: 'Gestão de banca na prática', faltam: ['Psicologia do trader', 'Recuperação inteligente', 'Lendo o mercado em 30 s'] },
          lives: { plataforma: 3, plataformaTotal: 5, minutos: 96, externasOnline: 18, externasTotal: 31, ultima: iso(1) },
          acessos: { total: 612, diasAtivos: 33, horas: 88.4, dispositivo: 'celular', ultimos7: 6 },
          compras: [{ quando: iso(20), produto: 'GF Member Black', valor: 997, origem: 'Cakto', situacao: 'aprovada' }],
          produtos: [{ nome: 'GF Member Black', desde: iso(20), ate: iso(-345), ativo: true, origem: 'cakto' }],
          faturas: [{ mes: '2026-10', valor: 52.3, situacao: 'paga' }],
          suporte: { conversas: 2, abertas: 0, ultima: iso(9) },
          assessor: { mensagens: 34, desde: iso(2), iasLigadas: 5 },
          linhaDoTempo: [
            { quando: iso(0.001), tipo: 'acesso', texto: 'Último acesso na plataforma' }, { quando: iso(1), tipo: 'live', texto: 'Assistiu uma live na plataforma' },
            { quando: iso(2), tipo: 'whatsapp', texto: 'Confirmou o WhatsApp do Assessor' }, { quando: iso(6), tipo: 'deposito', texto: 'Depósito · US$ 500,00' },
            { quando: iso(20), tipo: 'compra', texto: 'GF Member Black · R$ 997,00 · aprovada' }, { quando: iso(39), tipo: 'operacao', texto: 'Primeira operação' }, { quando: iso(41), tipo: 'cadastro', texto: 'Criou a conta na GlobalFly' },
          ],
        },
      }
    },
    async sugerirResposta() { await new Promise((r) => setTimeout(r, 900)); return 'Oi! Pra ligar a *GF Raptor* é só me dizer a conta (demo ou real), a entrada, a meta e o limite de perda. Quer que eu ligue na demo com entrada de US$ 1?' },
    async ficha(id) { const f = await base.ficha(id); return f ? { ...f, extras: [{ rotulo: 'Operando agora', valor: 'GF Raptor · demo · +US$ 3,20 em 12 op.', tom: 'ok' }, { rotulo: 'Hoje na real', valor: '−US$ 4,00 em 1 sessão' }, { rotulo: 'Saldo real', valor: 'ROT92075216 · US$ 0,00', tom: 'alerta' }, { rotulo: 'WhatsApp', valor: 'Confirmado no perfil', tom: 'ok' }] } : f },
    async contatos() {
      const l = await base.contatos()
      return l.map((c, i) => ({ ...c, iaPausada: pausas.get(c.id) ?? i === 1 }))
    },
    async mensagens(id, antes) {
      let l = await base.mensagens(id, antes)
      // laboratório com ?historico: 300 mensagens antigas, para testar a rolagem e a carga por páginas
      if (typeof location !== 'undefined' && location.search.includes('historico')) {
        const ini = new Date(l[0]?.criadoEm ?? Date.now()).getTime()
        const velhas: MensagemWpp[] = Array.from({ length: 300 }, (_, i) => ({ ...l[0], id: `h-${id}-${i}`, wamid: null, direcao: i % 3 ? 'entrada' : 'saida', tipo: 'texto', midia: null, citando: null, reacao: null, reacaoEquipe: null, status: 'lida',
          texto: `Mensagem antiga nº ${i + 1}${i % 7 === 0 ? ' — um texto mais comprido para variar a altura das bolhas e ver se a rolagem continua no lugar certo quando carregar mais' : ''}`,
          criadoEm: new Date(ini - (300 - i) * 37 * 60_000).toISOString() } as MensagemWpp))
        const tudo = [...velhas, ...l.filter((m) => !antes || m.criadoEm < antes)]
        l = antes ? tudo.filter((m) => m.criadoEm < antes).slice(-60) : [...velhas.slice(-Math.max(0, 60 - l.length)), ...l]
        await new Promise((r) => setTimeout(r, 350))
      }
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
