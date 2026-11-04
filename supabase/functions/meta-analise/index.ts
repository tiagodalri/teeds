// Administração › Anúncios › Visão geral: a leitura da I.A. (04/11/2026, Tiago: "um panorama interpretado
// pela I.A... um plano de ação estrategicamente pensado... um botão Otimizar campanhas: um modal com todas
// as alterações e o porquê; aprovo, confirmo, e aí você faz as mudanças no Gerenciador").
//
// POST { acao, marca, parceiro, ... } com o token do admin geral:
//   ultima   { de, ate }             a última análise deste período (ou nenhuma) e se há chave da I.A.
//   analisar { de, ate, forcar? }    lê os números (painel da Meta, funil e jornada do banco, período anterior),
//                                    manda para a Claude e guarda em anuncios_analises. Roda em segundo plano:
//                                    responde { id, situacao: 'analisando' } e a tela pergunta de novo (ultima).
//   aplicar  { id, escolhidas }      aplica na Meta as mudanças que o admin aprovou, uma a uma, com a chave
//                                    da conta (META_ADS_<MARCA>_<PARCEIRO>), e anota tudo em anuncios_historico.
//
// O que a I.A. pode propor (e só isso): orçamento de um conjunto, pausar/ligar campanha, conjunto ou anúncio,
// duplicar um conjunto campeão com outro orçamento, e um conjunto novo com o público ajustado (idade, gênero,
// estados, onde aparece) a partir de um que já roda. Tudo conferido aqui antes de ir: só campanhas "GF |",
// orçamento entre R$ 6 e R$ 5.000 e no máximo o dobro (ou a metade) do atual, e o orçamento tem de ser o
// mesmo que a I.A. viu (se alguém mudou no Gerenciador no meio, a mudança é pulada e avisada).
//
// A chave da I.A. fica no segredo ANTHROPIC_API_KEY das funções (Supabase › Edge Functions › Secrets).

import Anthropic from 'npm:@anthropic-ai/sdk'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CHAVE_IA = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODELO = 'claude-opus-5-5'
const GRAPH = 'https://graph.facebook.com/v24.0'
const PREFIXO = 'GF |'
const MAX_DIA = 5000
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CONTAS: Record<string, Record<string, { conta: string; pixel: string }>> = {
  globalfly: { n: { conta: '977357031377237', pixel: '1625935188283999' }, v: { conta: '854985874324156', pixel: '2208036990064467' } },
}
const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init, headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
async function contaDe(marca: string, parceiro: string) {
  const base = CONTAS[marca]?.[parceiro]
  if (!base) return null
  const r = await rest(`config_servicos?chave=eq.META_CONTA_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
  const linha = r.ok ? (await r.json())[0] : null
  try { return linha?.valor ? { ...base, ...JSON.parse(linha.valor) } : base } catch { return base }
}

class ErroDaMeta extends Error { constructor(msg: string, public codigo: number) { super(msg) } }
const mensagem = (d: any, status: number) => d?.error?.error_user_msg || d?.error?.error_user_title || d?.error?.message || `HTTP ${status}`
async function ler(chave: string, caminho: string, params: Record<string, string> = {}) {
  const r = await fetch(`${GRAPH}/${caminho}?${new URLSearchParams({ ...params, access_token: chave })}`)
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new ErroDaMeta(mensagem(d, r.status), d?.error?.code ?? r.status)
  return d
}
async function gravar(chave: string, caminho: string, params: Record<string, unknown>) {
  const q = new URLSearchParams({ access_token: chave })
  for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  const r = await fetch(`${GRAPH}/${caminho}`, { method: 'POST', body: q })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new ErroDaMeta(mensagem(d, r.status), d?.error?.code ?? r.status)
  return d
}
/** A campanha (ou a do conjunto/anúncio) é da GlobalFly? Só nessas a I.A. mexe. */
async function daGf(chave: string, tipo: string, id: string): Promise<{ nome: string; campanha: string }> {
  if (!/^\d{5,30}$/.test(id)) throw new Error('Identificador inválido.')
  const d = await ler(chave, id, { fields: tipo === 'campanha' ? 'name' : 'name,campaign{name}' })
  const campanha = tipo === 'campanha' ? d.name : d.campaign?.name
  if (!String(campanha ?? '').includes(PREFIXO)) throw new Error('Esse item não é de uma campanha da GlobalFly ("GF |"). Por segurança, a I.A. não mexe nele.')
  return { nome: d.name ?? '', campanha }
}

/* ------------------------------------------------------------------ o que a I.A. recebe */

const n = (v: unknown) => Number(v ?? 0) || 0
const r2 = (v: number) => Math.round(v * 100) / 100
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const custo = (gasto: number, q: number) => (q > 0 ? r2(gasto / q) : null)
/** O período anterior do mesmo tamanho (igual à tela). */
function anterior(de: string, ate: string) {
  const d0 = new Date(`${de}T12:00:00Z`), d1 = new Date(`${ate}T12:00:00Z`)
  const dias = Math.round((+d1 - +d0) / 864e5) + 1
  const a1 = new Date(d0); a1.setUTCDate(a1.getUTCDate() - 1)
  const a0 = new Date(a1); a0.setUTCDate(a0.getUTCDate() - dias + 1)
  return { de: a0.toISOString().slice(0, 10), ate: a1.toISOString().slice(0, 10) }
}
const resumoM = (m: any) => ({
  investido: r2(n(m?.gasto)), impressoes: n(m?.impressoes), alcance: n(m?.alcance), frequencia: r2(n(m?.frequencia)),
  cliquesLink: n(m?.cliquesLink), ctrLink: r2(n(m?.ctrLink)), cpc: r2(n(m?.cpcLink)), cpm: r2(n(m?.cpm)),
  chegaramNaPagina: n(m?.lpv), cadastros: n(m?.cadastros), custoPorCadastro: custo(n(m?.gasto), n(m?.cadastros)),
  conversaoPagina: n(m?.lpv) ? r2((n(m?.cadastros) / n(m?.lpv)) * 100) : null,
  video3s: n(m?.video3s), thruplay: n(m?.thruplay),
})

async function montarEntrada(cab: Record<string, string>, marca: string, parceiro: string, de: string, ate: string) {
  const funcao = async (corpo: Record<string, unknown>) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-ads`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ marca, parceiro, ...corpo }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(String(d?.erro || `A Meta não respondeu (${r.status}).`))
    return d
  }
  const rpc = async (nome: string, corpo: Record<string, unknown>) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro, ...corpo }) })
    if (!r.ok) throw new Error(`O banco não respondeu (${nome}, ${r.status}).`)
    return r.json()
  }
  const ant = anterior(de, ate)
  const [painel, painelAntes, funil, jornada] = await Promise.all([
    funcao({ acao: 'painel', de, ate }),
    funcao({ acao: 'painel', de: ant.de, ate: ant.ate }).catch(() => null),
    rpc('teeds_meta_funil', { p_de: de, p_ate: ate }).catch(() => null),
    rpc('teeds_jornada_completa', { p_de: de, p_ate: ate }).catch(() => null),
  ])
  if (painel?.semChave) throw new Error('Conecte a chave da conta de anúncios antes: a I.A. lê os números da Meta por ela.')
  if (painel?.chaveInvalida) throw new Error('A Meta recusou a chave da conta de anúncios. Cole uma nova na aba Anúncios.')
  if (!painel?.total) throw new Error('Não consegui ler os números da Meta agora.')

  // a jornada de cada anúncio (quem a plataforma acompanha pessoa a pessoa até o depósito)
  const porAd = new Map<string, { acompanhados: number; questionario: number; plataforma: number; contaReal: number; depositantes: number; depositadoUSD: number; markupUSD: number }>()
  for (const p of (jornada?.pessoas ?? []) as any[]) {
    if (p.canal !== 'anuncio-meta' || !p.anuncio) continue
    const x = porAd.get(p.anuncio) ?? { acompanhados: 0, questionario: 0, plataforma: 0, contaReal: 0, depositantes: 0, depositadoUSD: 0, markupUSD: 0 }
    x.acompanhados++; if (p.questionario_em) x.questionario++; if (p.acessos > 0 || p.primeiro_acesso) x.plataforma++; if (p.deriv_real_em) x.contaReal++
    if (n(p.depositado) > 0) { x.depositantes++; x.depositadoUSD = r2(x.depositadoUSD + n(p.depositado)) }
    x.markupUSD = r2(x.markupUSD + n(p.markup))
    porAd.set(p.anuncio, x)
  }
  const camp = new Map((painel.campanhas as any[]).map((c) => [c.id, c.nome]))
  const conj = new Map((painel.conjuntos as any[]).map((c) => [c.id, c]))
  const ativo = (s: string) => /ACTIVE|IN_PROCESS|PENDING|WITH_ISSUES/.test(s)
  const conjuntos = (painel.conjuntos as any[]).map((c) => ({
    id: c.id, nome: c.nome, status: c.status, campanha: camp.get(c.campanhaId) ?? c.campanhaId, orcamentoDia: r2(n(c.orcDia)),
    orcamentoNaCampanha: !n(c.orcDia) && n((painel.campanhas as any[]).find((x) => x.id === c.campanhaId)?.orcDia) > 0,
    publico: c.publico, otimizaPara: c.otimizacao, ...resumoM(c.m),
  }))
  const anuncios = (painel.anuncios as any[]).map((a) => ({
    id: a.id, nome: a.nome, status: a.status, conjunto: conj.get(a.conjuntoId)?.nome ?? a.conjuntoId, conjuntoId: a.conjuntoId,
    criativo: a.criativo.tipo, titulo: a.criativo.titulo, qualidade: a.ranking.qualidade || 'sem-dados', conversao: a.ranking.conversao || 'sem-dados',
    comMarcacao: a.criativo.marcacoes == null || /utm_content=\{\{ad\.id\}\}/.test(a.criativo.marcacoes), ...resumoM(a.m),
    jornada: porAd.get(a.id) ?? null,
  }))
  const quebra = (l: any[], nome: (q: any) => string) => l.slice(0, 12).map((q) => ({ grupo: nome(q), ...resumoM(q) }))
  const totalDia = r2(conjuntos.filter((c) => ativo(c.status) && !c.orcamentoNaCampanha).reduce((s, c) => s + c.orcamentoDia, 0)
    + (painel.campanhas as any[]).filter((c) => ativo(c.status)).reduce((s, c) => s + n(c.orcDia), 0))
  return {
    periodo: { de, ate, dias: painel.porDia.length }, hoje: new Date().toISOString().slice(0, 10), moeda: painel.conta.moeda,
    conta: { nome: painel.conta.nome, orcamentoTotalPorDia: totalDia },
    total: resumoM(painel.total),
    periodoAnterior: painelAntes?.total ? { de: ant.de, ate: ant.ate, ...resumoM(painelAntes.total) } : null,
    porDia: (painel.porDia as any[]).map((d) => ({ dia: d.dia, investido: r2(n(d.gasto)), cadastros: n(d.cadastros), custoPorCadastro: custo(n(d.gasto), n(d.cadastros)) })),
    campanhas: (painel.campanhas as any[]).map((c) => ({ id: c.id, nome: c.nome, status: c.status, objetivo: c.objetivo, orcamentoDia: r2(n(c.orcDia)), ...resumoM(c.m) })),
    conjuntos, anuncios,
    publico: {
      idadeGenero: quebra(painel.quebras.idadeGenero, (q) => `${q.age} · ${q.gender === 'male' ? 'homens' : q.gender === 'female' ? 'mulheres' : 'outros'}`),
      ondeApareceu: quebra(painel.quebras.posicionamento, (q) => `${q.publisher_platform} · ${q.platform_position}`),
      aparelho: quebra(painel.quebras.aparelho, (q) => String(q.device_platform)),
      estados: quebra(painel.quebras.regiao, (q) => String(q.region)),
    },
    plataforma: funil ? {
      cadastrosDoParceiroNoPeriodo: n(funil.total?.cadastros), acompanhadosDeAnuncio: n(funil.anuncio?.cadastros),
      questionario: n(funil.anuncio?.questionario), notificacoes: n(funil.anuncio?.notificacoes),
      comecaramOCadastro: n(funil.passosAnuncio?.comecou) || null,
    } : null,
  }
}

/* ------------------------------------------------------------------ a I.A. */

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['resumo', 'panorama', 'plano', 'mudancas', 'alerta'],
  properties: {
    resumo: { type: 'string', description: 'O cenário em 2 a 4 frases, com números. É a primeira coisa que o Tiago lê.' },
    panorama: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['tipo', 'titulo', 'texto'],
        properties: { tipo: { type: 'string', enum: ['bom', 'atencao', 'critico', 'info'] }, titulo: { type: 'string' }, texto: { type: 'string', description: 'Uma ou duas frases com os números e a diferença (R$, %, vezes).' } },
      },
    },
    plano: {
      type: 'array', maxItems: 7,
      items: {
        type: 'object', additionalProperties: false, required: ['titulo', 'porque', 'impacto', 'quando'],
        properties: { titulo: { type: 'string' }, porque: { type: 'string' }, impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] }, quando: { type: 'string', enum: ['agora', 'esta-semana', 'depois-da-live'] } },
      },
    },
    mudancas: {
      type: 'array', maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'tipo', 'alvoTipo', 'alvoId', 'alvoNome', 'nome', 'diarioDe', 'diarioPara', 'ligar', 'publico', 'porque', 'risco'],
        properties: {
          id: { type: 'string', description: 'm1, m2, m3…' },
          tipo: { type: 'string', enum: ['orcamento', 'pausar', 'ligar', 'duplicar', 'novo_publico'] },
          alvoTipo: { type: 'string', enum: ['campanha', 'conjunto', 'anuncio'] },
          alvoId: { type: 'string', description: 'O id exatamente como veio nos dados.' },
          alvoNome: { type: 'string' },
          nome: { type: 'string', description: 'Só em duplicar e novo_publico: o nome do conjunto novo (sem o prefixo GF |). Vazio nos outros.' },
          diarioDe: { type: 'number', description: 'Orçamento por dia de hoje do conjunto (orcamento, duplicar, novo_publico). 0 quando não se aplica.' },
          diarioPara: { type: 'number', description: 'Orçamento por dia proposto (orcamento: o novo valor; duplicar/novo_publico: o do conjunto novo). 0 quando não se aplica.' },
          ligar: { type: 'boolean', description: 'duplicar/novo_publico: o conjunto novo já nasce ligado? Nos outros, false.' },
          publico: {
            type: 'object', additionalProperties: false, required: ['idadeMin', 'idadeMax', 'genero', 'estados', 'ondeAparece'],
            description: 'Só em novo_publico. Nos outros, zeros e listas vazias.',
            properties: {
              idadeMin: { type: 'integer' }, idadeMax: { type: 'integer' },
              genero: { type: 'string', enum: ['todos', 'homens', 'mulheres'] },
              estados: { type: 'array', items: { type: 'string' }, description: 'Nomes dos estados exatamente como vieram nos dados. Vazio = Brasil inteiro.' },
              ondeAparece: { type: 'array', items: { type: 'string', enum: ['instagram_reels', 'instagram_stories', 'instagram_feed', 'facebook_feed', 'facebook_reels'] }, description: 'Vazio = onde a Meta quiser.' },
            },
          },
          porque: { type: 'string', description: 'O motivo com os números que sustentam a decisão.' },
          risco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
        },
      },
    },
    alerta: { type: 'string', description: 'Um aviso que o Tiago precisa ler antes de aprovar (ou vazio).' },
  },
}

// o que a I.A. nunca escreve (a mesma lista de scripts/conferir-textos.mjs)
const PROIBIDAS = 'robô, aposta, apostar, sorte, chute, jogar, garantido, garante, lucro certo' // texto-ok: é a lista do que NÃO pode
function instrucoes(entrada: any) {
  const totalDia = entrada.conta.orcamentoTotalPorDia
  return `Você é a gestora de tráfego sênior da GlobalFly e escreve para o Tiago, o dono, que vai ler isso no painel e decidir em um minuto.

CONTEXTO
- A GlobalFly é uma plataforma de I.A. que opera no mercado financeiro (corretora Deriv) junto com o cliente. As campanhas (conta "${entrada.conta.nome}", moeda ${entrada.moeda}) levam ao cadastro gratuito para a live de lançamento de 09/11/2026, às 20h. Depois da live, quem se cadastrou vira GF Member.
- O número que manda é o CUSTO POR CADASTRO da Meta (o mesmo do Gerenciador). Em segundo lugar, a qualidade: "jornada" de cada anúncio mostra, das pessoas que a plataforma acompanha pessoa a pessoa, quantas responderam o questionário, entraram na plataforma, conectaram conta real e depositaram (USD). Depósito e markup valem ouro: um anúncio que traz cadastros mais caros mas que depositam pode ser melhor.
- Hoje é ${entrada.hoje}. O período analisado é ${entrada.periodo.de} a ${entrada.periodo.ate} (${entrada.periodo.dias} dia(s)). Há também o período anterior do mesmo tamanho, quando existe.
- Orçamento total por dia da conta hoje: ${brl(totalDia)}.
- Nomes dos conjuntos: "Quente" = público morno/quente (quem já conhece o Naor); "Aberto 20+" = público frio, 20 anos ou mais; "Dup" = duplicata; "Perfil IG" = quem visitou o perfil do Naor no Instagram. NB1…NB5 são criativos diferentes do Naor.

COMO ESCREVER
- Português do Brasil, direto, frases curtas, sempre com os números (R$, %, vezes). Nada de rodeio nem de elogio vazio. Cada ponto do panorama diz O QUE está acontecendo e POR QUÊ, comparando (tal conjunto custa R$ X por cadastro contra R$ Y do outro, 2,1 vezes mais).
- Chame a plataforma de "a I.A." (feminino). Nunca use as palavras: ${PROIBIDAS}.
- Fale em "cadastros" (não "leads", não "conversões"). "Conjunto" é o conjunto de anúncios (público); "anúncio" é o criativo dentro dele.

COMO DECIDIR (regras duras)
- Amostra: não conclua nada sobre um anúncio ou conjunto com menos de 300 impressões ou menos de R$ 15 investidos. Não declare vencedor ou perdedor com menos de 5 cadastros; com 5 a 9, diga que é cedo. Diferenças abaixo de 20% no custo por cadastro são empate.
- O que está "sem-dados" na qualidade da Meta ainda não tem 500 impressões.
- Um anúncio sem marcação (comMarcacao=false) conta cadastros pela Meta normalmente; só não tem jornada.
- Mudanças permitidas e SÓ estas (qualquer outra ideia vai no plano, como texto):
  1. orcamento: mudar o orçamento por dia de um CONJUNTO (alvoTipo=conjunto). Entre R$ 6 e R$ ${MAX_DIA}. Nunca mais que o dobro nem menos que a metade do atual numa mudança. Conjunto com orcamentoNaCampanha=true não pode (o orçamento é da campanha).
  2. pausar / ligar: uma campanha, um conjunto ou um anúncio. Pausar só com motivo claro e amostra suficiente. Não pause tudo de um conjunto nem deixe a campanha sem anúncio ligado.
  3. duplicar: um CONJUNTO campeão (alvoTipo=conjunto) ganha uma cópia igual com outro orçamento (diarioPara), para escalar sem mexer no original. ligar=true para nascer ligada.
  4. novo_publico: a partir de um CONJUNTO que roda (alvoTipo=conjunto), um conjunto novo com os MESMOS anúncios e o público ajustado pelos dados de "publico" (idade, gênero, estados, onde apareceu). Use quando os dados mostram um grupo convertendo bem mais barato que a média. idadeMin ≥ 18, idadeMax ≤ 65.
- O orçamento total por dia da conta depois das mudanças não pode passar de ${brl(Math.round(totalDia * 1.5))} (1,5 vez o de hoje). Se for cortar, corte onde o cadastro está caro; se for subir, suba onde está barato e com volume.
- Proponha no máximo 8 mudanças, as que mais movem o custo por cadastro. Menos é mais: se a conta está saudável, diga isso e proponha pouco ou nada.
- alvoId e alvoNome têm de ser EXATAMENTE os dos dados. diarioDe tem de ser o orcamentoDia que veio nos dados.
- Risco: baixo = ajuste de orçamento pequeno ou pausar algo claramente ruim; medio = duplicar ou subir bastante; alto = público novo ou mexer em quem traz a maior parte dos cadastros.

ENTREGA
- resumo: 2 a 4 frases: investido, cadastros, custo por cadastro, a comparação com o período anterior e a conclusão principal.
- panorama: 4 a 8 pontos, do mais importante ao menos. Comece pelo que explica a diferença de desempenho entre conjuntos/anúncios (criativo, público, posicionamento, frequência, página).
- plano: 3 a 7 ações, em ordem de impacto, cada uma com o porquê. As que podem ser feitas daqui viram também uma mudança em "mudancas"; as outras (novo criativo, teste de página, etc.) ficam só no plano.
- mudancas: as alterações concretas, com o porquê numérico de cada uma.
- alerta: só se houver algo que ele precisa saber antes de aprovar (ex.: a Meta reanalisa anúncios de conjunto novo; hoje é o último dia antes da live). Senão, vazio.`
}

async function analisar(id: string, cab: Record<string, string>, marca: string, parceiro: string, de: string, ate: string) {
  const mudar = (campos: Record<string, unknown>) => rest(`anuncios_analises?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) })
  try {
    const entrada = await montarEntrada(cab, marca, parceiro, de, ate)
    await mudar({ entrada })
    const cliente = new Anthropic({ apiKey: CHAVE_IA })
    const resposta = await cliente.messages.create({
      model: MODELO, max_tokens: 16000,
      system: instrucoes(entrada),
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: `Os números do período, em JSON:\n${JSON.stringify(entrada)}\n\nEscreva a leitura e o plano no formato pedido.` }],
    } as any)
    if (resposta.stop_reason === 'refusal') throw new Error('A I.A. não quis analisar este pedido. Tente de novo em instantes.')
    if (resposta.stop_reason === 'max_tokens') throw new Error('A resposta da I.A. veio cortada. Tente de novo.')
    const texto = resposta.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('')
    const dados = JSON.parse(texto)
    const { validas, avisos } = conferir(dados.mudancas ?? [], entrada)
    dados.mudancas = validas
    if (avisos.length) dados.alerta = [dados.alerta, ...avisos].filter(Boolean).join(' ')
    await mudar({ situacao: 'pronta', dados, modelo: resposta.model, pronta_em: new Date().toISOString(), uso: { entrada: resposta.usage?.input_tokens, saida: resposta.usage?.output_tokens } })
  } catch (e) {
    await mudar({ situacao: 'erro', erro: (e as Error).message.slice(0, 600) })
  }
}

/** As mudanças da I.A. passam pelas mesmas regras que valem na hora de aplicar: o que não passa sai, com aviso. */
function conferir(lista: any[], entrada: any): { validas: any[]; avisos: string[] } {
  const avisos: string[] = [], validas: any[] = []
  const conj = new Map(entrada.conjuntos.map((c: any) => [c.id, c])), camp = new Map(entrada.campanhas.map((c: any) => [c.id, c])), ads = new Map(entrada.anuncios.map((a: any) => [a.id, a]))
  let totalDia = entrada.conta.orcamentoTotalPorDia
  const teto = entrada.conta.orcamentoTotalPorDia * 1.5 + 0.01
  for (const m of lista) {
    const alvo = m.alvoTipo === 'conjunto' ? conj.get(m.alvoId) : m.alvoTipo === 'campanha' ? camp.get(m.alvoId) : ads.get(m.alvoId)
    if (!alvo) { avisos.push(`Uma mudança foi descartada: o ${m.alvoTipo} "${m.alvoNome}" não está nos dados.`); continue }
    m.alvoNome = (alvo as any).nome
    if (['orcamento', 'duplicar', 'novo_publico'].includes(m.tipo)) {
      if (m.alvoTipo !== 'conjunto') { avisos.push(`"${m.alvoNome}": ${m.tipo} só vale para conjunto; descartada.`); continue }
      const c = alvo as any
      if (c.orcamentoNaCampanha) { avisos.push(`"${c.nome}" usa o orçamento da campanha: mude pela campanha, no Gerenciador.`); continue }
      m.diarioDe = c.orcamentoDia
      const v = Number(m.diarioPara)
      if (!(v >= 6 && v <= MAX_DIA)) { avisos.push(`"${c.nome}": orçamento ${brl(v || 0)} fora de R$ 6 a R$ ${MAX_DIA}; descartada.`); continue }
      if (m.tipo === 'orcamento') {
        if (c.orcamentoDia > 0 && (v > c.orcamentoDia * 2 + 0.01 || v < c.orcamentoDia / 2 - 0.01)) { avisos.push(`"${c.nome}": de ${brl(c.orcamentoDia)} para ${brl(v)} passa do dobro ou da metade; descartada.`); continue }
        if (Math.abs(v - c.orcamentoDia) < 0.5) continue
        totalDia += v - c.orcamentoDia
      } else {
        totalDia += v
        if (m.tipo === 'novo_publico') {
          const p = m.publico ?? {}
          p.idadeMin = Math.min(65, Math.max(18, Number(p.idadeMin) || 18)); p.idadeMax = Math.min(65, Math.max(p.idadeMin, Number(p.idadeMax) || 65))
          p.estados = (p.estados ?? []).filter((e: string) => entrada.publico.estados.some((x: any) => x.grupo === e))
          m.publico = p
        }
      }
      if (totalDia > teto) { avisos.push(`"${c.nome}": com essa mudança o total por dia passaria de ${brl(entrada.conta.orcamentoTotalPorDia * 1.5)}; descartada.`); totalDia -= m.tipo === 'orcamento' ? v - c.orcamentoDia : v; continue }
    } else if (m.tipo === 'pausar' || m.tipo === 'ligar') {
      const ativo = /ACTIVE|IN_PROCESS|PENDING|WITH_ISSUES/.test((alvo as any).status)
      if (m.tipo === 'pausar' && !ativo) continue
      if (m.tipo === 'ligar' && ativo) continue
      // a tela mostra o antes → depois do orçamento da conta: o conjunto pausado/ligado leva o dele
      m.diarioDe = m.alvoTipo === 'conjunto' ? n((alvo as any).orcamentoDia) : 0; m.diarioPara = 0
      if (m.tipo === 'pausar' && m.alvoTipo === 'conjunto') totalDia -= (alvo as any).orcamentoDia
      if (m.tipo === 'ligar' && m.alvoTipo === 'conjunto') totalDia += (alvo as any).orcamentoDia
    } else { continue }
    validas.push(m)
  }
  return { validas, avisos }
}

/* ------------------------------------------------------------------ aplicar na Meta */

const POSICOES: Record<string, [string, string]> = {
  instagram_reels: ['instagram', 'reels'], instagram_stories: ['instagram', 'story'], instagram_feed: ['instagram', 'stream'],
  facebook_feed: ['facebook', 'feed'], facebook_reels: ['facebook', 'facebook_reels'],
}
async function chaveDoEstado(chave: string, nome: string): Promise<string | null> {
  const d = await ler(chave, 'search', { type: 'adgeolocation', location_types: JSON.stringify(['region']), country_code: 'BR', q: nome, limit: '5' }).catch(() => ({ data: [] }))
  const x = (d.data ?? []).find((r: any) => String(r.name).toLowerCase() === nome.toLowerCase()) ?? (d.data ?? [])[0]
  return x ? String(x.key) : null
}
/** Liga (ou pausa) um conjunto e os anúncios dele. */
async function statusDoConjunto(chave: string, id: string, status: 'ACTIVE' | 'PAUSED') {
  await gravar(chave, id, { status })
  const ads = await ler(chave, `${id}/ads`, { fields: 'id', limit: '50' })
  for (const a of ads.data ?? []) await gravar(chave, String(a.id), { status })
}
/** Uma cópia do conjunto (e dos anúncios dele), pausada, com outro orçamento; com público novo quando pedido. */
async function copiarConjunto(chave: string, act: string, origem: string, nome: string, diario: number, publico: any | null): Promise<string> {
  const campos = 'campaign_id,targeting,optimization_goal,billing_event,bid_strategy,bid_amount,promoted_object,attribution_spec,regional_regulated_categories,regional_regulation_identities,destination_type'
  const o = await ler(chave, origem, { fields: campos })
  let targeting = o.targeting ?? {}
  if (publico) {
    targeting = { ...targeting, age_min: publico.idadeMin, age_max: publico.idadeMax }
    if (publico.genero === 'homens') targeting.genders = [1]; else if (publico.genero === 'mulheres') targeting.genders = [2]; else delete targeting.genders
    if (publico.estados?.length) {
      const chaves = (await Promise.all(publico.estados.map((e: string) => chaveDoEstado(chave, e)))).filter(Boolean)
      if (chaves.length) targeting.geo_locations = { regions: chaves.map((key) => ({ key })), location_types: ['home', 'recent'] }
    }
    if (publico.ondeAparece?.length) {
      const plat = new Set<string>(), ig: string[] = [], fb: string[] = []
      for (const p of publico.ondeAparece) { const x = POSICOES[p]; if (!x) continue; plat.add(x[0]); (x[0] === 'instagram' ? ig : fb).push(x[1]) }
      targeting.publisher_platforms = [...plat]
      if (ig.length) targeting.instagram_positions = ig; else delete targeting.instagram_positions
      if (fb.length) targeting.facebook_positions = fb; else delete targeting.facebook_positions
      delete targeting.messenger_positions; delete targeting.audience_network_positions
    }
  }
  const novo = await gravar(chave, `${act}/adsets`, {
    name: `${PREFIXO} ${nome}`.slice(0, 200), campaign_id: o.campaign_id, status: 'PAUSED', daily_budget: Math.round(diario * 100),
    billing_event: o.billing_event ?? 'IMPRESSIONS', optimization_goal: o.optimization_goal ?? 'OFFSITE_CONVERSIONS', bid_strategy: o.bid_strategy ?? 'LOWEST_COST_WITHOUT_CAP',
    bid_amount: o.bid_amount, promoted_object: o.promoted_object, attribution_spec: o.attribution_spec, destination_type: o.destination_type, targeting,
    regional_regulated_categories: o.regional_regulated_categories, regional_regulation_identities: o.regional_regulation_identities,
  })
  const id = String(novo.id)
  const ads = await ler(chave, `${origem}/ads`, { fields: 'id,name,effective_status,creative{id}', limit: '50' })
  for (const a of ads.data ?? []) {
    if (!/ACTIVE|PENDING|IN_PROCESS|WITH_ISSUES/.test(a.effective_status) || !a.creative?.id) continue
    await gravar(chave, `${act}/ads`, { name: a.name, adset_id: id, creative: { creative_id: a.creative.id }, status: 'PAUSED' })
  }
  return id
}

async function aplicarUma(chave: string, act: string, m: any): Promise<{ ok: boolean; mensagem: string; criadoId?: string }> {
  const tipoGf = m.alvoTipo === 'campanha' ? 'campanha' : m.alvoTipo === 'anuncio' ? 'anuncio' : 'conjunto'
  await daGf(chave, tipoGf, String(m.alvoId))
  if (m.tipo === 'orcamento') {
    const atual = n((await ler(chave, String(m.alvoId), { fields: 'daily_budget' })).daily_budget) / 100
    if (!atual) throw new Error('Esse conjunto usa o orçamento da campanha: mude no Gerenciador.')
    if (Math.abs(atual - n(m.diarioDe)) > 0.5) throw new Error(`O orçamento mudou desde a análise (${brl(atual)} agora, ${brl(n(m.diarioDe))} na análise). Analise de novo.`)
    const v = n(m.diarioPara)
    if (!(v >= 6 && v <= MAX_DIA) || v > atual * 2 + 0.01 || v < atual / 2 - 0.01) throw new Error('Orçamento fora do permitido.')
    await gravar(chave, String(m.alvoId), { daily_budget: Math.round(v * 100) })
    return { ok: true, mensagem: `${brl(atual)} → ${brl(v)} por dia` }
  }
  if (m.tipo === 'pausar' || m.tipo === 'ligar') {
    const status = m.tipo === 'ligar' ? 'ACTIVE' : 'PAUSED'
    await gravar(chave, String(m.alvoId), { status })
    return { ok: true, mensagem: m.tipo === 'ligar' ? 'Ligado' : 'Pausado' }
  }
  if (m.tipo === 'duplicar' || m.tipo === 'novo_publico') {
    const v = n(m.diarioPara)
    if (!(v >= 6 && v <= MAX_DIA)) throw new Error('Orçamento fora do permitido.')
    const nome = String(m.nome || `${m.alvoNome.replace(/^GF \| /, '')} · ${m.tipo === 'duplicar' ? 'escala' : 'público I.A.'}`)
    const id = await copiarConjunto(chave, act, String(m.alvoId), nome, v, m.tipo === 'novo_publico' ? m.publico : null)
    if (m.ligar) await statusDoConjunto(chave, id, 'ACTIVE')
    return { ok: true, mensagem: `Conjunto "${PREFIXO} ${nome}" criado com ${brl(v)} por dia${m.ligar ? ', ligado' : ', pausado'}`, criadoId: id }
  }
  throw new Error('Mudança desconhecida.')
}

/* ------------------------------------------------------------------ o servidor */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, any>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? ''), parceiro = String(d.parceiro ?? ''), acao = String(d.acao ?? '')
  const cfg = await contaDe(marca, parceiro)
  if (!cfg) return json({ erro: 'Esse parceiro não tem conta de anúncios ligada.' }, 400)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const cab = { apikey, Authorization: `Bearer ${token}` }
  const [quem, usuario] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_geral_da`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca }) }),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: cab }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!quem.ok || (await quem.json()) !== true) return json({ erro: 'Só o administrador geral usa a I.A. dos anúncios.' }, 403)
  const meta = usuario?.user_metadata ?? {}
  const nomeDeQuem = String(meta.nome || meta.full_name || meta.name || String(usuario?.email ?? '').split('@')[0].split('+')[0] || 'Admin')

  const data = /^\d{4}-\d{2}-\d{2}$/
  const de = String(d.de ?? ''), ate = String(d.ate ?? '')
  const paraTela = (a: any) => a && ({ id: a.id, situacao: a.situacao, dados: a.dados, erro: a.erro, criadoEm: a.criado_em, prontaEm: a.pronta_em, aplicadoEm: a.aplicado_em, resultado: a.resultado, quem: a.quem_nome, modelo: a.modelo, de: a.de, ate: a.ate })

  try {
    if (acao === 'ultima') {
      if (!data.test(de) || !data.test(ate)) return json({ erro: 'Período inválido.' }, 400)
      const r = await rest(`anuncios_analises?marca=eq.${marca}&parceiro=eq.${parceiro}&de=eq.${de}&ate=eq.${ate}&order=criado_em.desc&limit=1`)
      const a = r.ok ? (await r.json())[0] : null
      return json({ temIA: !!CHAVE_IA, analise: paraTela(a) ?? null })
    }
    if (acao === 'analisar') {
      if (!data.test(de) || !data.test(ate) || de > ate) return json({ erro: 'Período inválido.' }, 400)
      if (!CHAVE_IA) return json({ semIA: true, erro: 'Falta a chave da I.A. no servidor (segredo ANTHROPIC_API_KEY das funções).' }, 409)
      // a análise pronta de até 30 minutos atrás serve, a não ser que peçam de novo
      if (!d.forcar) {
        const r = await rest(`anuncios_analises?marca=eq.${marca}&parceiro=eq.${parceiro}&de=eq.${de}&ate=eq.${ate}&situacao=in.(pronta,analisando)&criado_em=gte.${new Date(Date.now() - 30 * 60e3).toISOString()}&order=criado_em.desc&limit=1`)
        const a = r.ok ? (await r.json())[0] : null
        if (a) return json({ temIA: true, analise: paraTela(a) })
      }
      const ins = await rest('anuncios_analises?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ marca, parceiro, de, ate, situacao: 'analisando', quem: usuario?.id ?? null, quem_nome: nomeDeQuem }) })
      const linha = ins.ok ? (await ins.json())[0] : null
      if (!linha) return json({ erro: 'Não consegui guardar a análise.' }, 500)
      EdgeRuntime.waitUntil(analisar(linha.id, cab, marca, parceiro, de, ate))
      return json({ temIA: true, analise: paraTela(linha) })
    }
    if (acao === 'aplicar') {
      const id = String(d.id ?? '')
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ erro: 'Análise inválida.' }, 400)
      const r = await rest(`anuncios_analises?id=eq.${id}&marca=eq.${marca}&parceiro=eq.${parceiro}&select=*`)
      const a = r.ok ? (await r.json())[0] : null
      if (!a) return json({ erro: 'Análise não encontrada.' }, 404)
      if (!['pronta', 'parcial'].includes(a.situacao)) return json({ erro: a.situacao === 'aplicada' ? 'Essa análise já foi aplicada. Analise de novo para novas mudanças.' : 'Essa análise ainda não está pronta.' }, 400)
      const escolhidas = new Set((Array.isArray(d.escolhidas) ? d.escolhidas : []).map(String))
      const jaFeitas = new Set(((a.resultado ?? []) as any[]).filter((x) => x.ok).map((x) => String(x.id)))
      const lista = ((a.dados?.mudancas ?? []) as any[]).filter((m) => escolhidas.has(String(m.id)) && !jaFeitas.has(String(m.id)))
      if (!lista.length) return json({ erro: 'Nenhuma mudança escolhida.' }, 400)
      const c = await rest(`config_servicos?chave=eq.META_ADS_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
      const chave = c.ok ? ((await c.json())[0]?.valor as string | undefined) : undefined
      if (!chave) return json({ erro: 'Falta a chave da conta de anúncios para aplicar.' }, 409)
      const act = `act_${cfg.conta}`
      const resultado: any[] = [...((a.resultado ?? []) as any[])]
      for (const m of lista) {
        try {
          const r = await aplicarUma(chave, act, m)
          resultado.push({ id: m.id, ok: true, mensagem: r.mensagem, criadoId: r.criadoId ?? null })
          await rest('anuncios_historico', { method: 'POST', body: JSON.stringify({ marca, parceiro, quem: usuario?.id ?? null, quem_nome: nomeDeQuem, acao: `ia_${m.tipo}`, alvo_tipo: m.alvoTipo, alvo_id: String(r.criadoId ?? m.alvoId), alvo_nome: m.alvoNome, detalhe: { analise: id, de: m.diarioDe, para: m.diarioPara, porque: m.porque, criadoDe: r.criadoId ? m.alvoId : undefined } }) })
        } catch (e) {
          const msg = e instanceof ErroDaMeta ? `A Meta respondeu: ${e.message}` : (e as Error).message
          resultado.push({ id: m.id, ok: false, mensagem: msg.slice(0, 400) })
        }
      }
      const todas = ((a.dados?.mudancas ?? []) as any[]).map((m) => String(m.id))
      const feitas = new Set(resultado.filter((x) => x.ok).map((x) => String(x.id)))
      const situacao = todas.every((x) => feitas.has(x)) ? 'aplicada' : feitas.size ? 'parcial' : 'pronta'
      await rest(`anuncios_analises?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ situacao, resultado, aplicado_em: new Date().toISOString() }) })
      // o painel mostra números guardados por 5 minutos; depois de mexer, a próxima leitura tem de vir fresca
      await rest(`meta_ads_cache?chave=like.${encodeURIComponent(`${marca}:${parceiro}:`)}*`, { method: 'DELETE' })
      return json({ situacao, resultado })
    }
    return json({ erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    if (e instanceof ErroDaMeta && e.codigo === 190) return json({ chaveInvalida: true, erro: 'A Meta não aceitou a chave (venceu ou foi trocada). Cole uma nova na aba Anúncios.' }, 401)
    return json({ erro: e instanceof ErroDaMeta ? `A Meta respondeu: ${e.message}` : (e as Error).message }, 502)
  }
})
