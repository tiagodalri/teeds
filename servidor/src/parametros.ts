import './ambiente'
import { diferencas, mesclar, parametrosPadrao, validar, type ParametrosDoRobo } from '../../src/core/deriv/parametros'
import type { ParametrosVigentes } from '../../src/core/deriv/engine'
import { marcaPorId } from '../../src/marca/marcas'
import {
  apagarLinhaDeParametros, gravarAuditoriaAdmin, gravarLinhaDeParametros, lerHistoricoDeParametros,
  lerLinhasDeParametros, nomeDoUsuario, supabaseConfigurado, type LinhaParametrosBanco,
} from './supabase'

/**
 * A memória viva dos parâmetros dos robôs.
 *
 * O painel de controle publica parâmetros por marca e por robô (loss
 * virtual, escada, teto…). O motor precisa deles a cada sessão que liga, e
 * — desde 22/09/2026 — as sessões em andamento recebem a versão nova na
 * hora. Ir ao banco a cada play custaria uma ida à Supabase por robô; ir
 * só no boot deixaria o servidor cego a uma publicação. Então:
 *
 *  - no boot e a cada 60 s, a tabela inteira é lida para um Map (são poucas
 *    linhas: uma por robô por marca);
 *  - quem escreve é SÓ este servidor (RLS: cliente e admin não gravam), e
 *    cada escrita atualiza o Map na hora (write-through) — o processo é
 *    único (systemd teeds-login), então não há outra memória para avisar;
 *  - sem banco no boot, começa vazio (= padrão do código) e avisa; refresh
 *    que falha mantém o último Map — uma publicação nunca é "esquecida"
 *    por instabilidade.
 *
 * Linha inválida no banco (escrita à mão, formato futuro) nunca chega ao
 * motor: `vigente()` cai no padrão e registra o motivo.
 */

export interface Linha {
  versao: number
  parametros: unknown
  testeDemo: unknown | null
  rascunho: unknown | null
  rascunhoEm: string | null
  ultimaAcao: string
  observacao: string | null
  simulacao: unknown | null
  publicadoEm: string
  atualizadoEm: string
  atualizadoPor: string | null
}

const memoria = new Map<string, Map<string, Linha>>()
let carregadaEm = 0

const daLinha = (l: LinhaParametrosBanco): Linha => ({
  versao: Number(l.versao), parametros: l.parametros, testeDemo: l.teste_demo ?? null, rascunho: l.rascunho ?? null,
  rascunhoEm: l.rascunho_em ?? null, ultimaAcao: String(l.ultima_acao ?? 'publicou'), observacao: l.observacao ?? null,
  simulacao: l.simulacao ?? null, publicadoEm: String(l.publicado_em ?? ''), atualizadoEm: String(l.atualizado_em ?? ''),
  atualizadoPor: l.atualizado_por ?? null,
})

/** Lê a tabela inteira. Falhou? Mantém o que tinha. */
export async function carregarParametros(): Promise<void> {
  if (!supabaseConfigurado()) return
  try {
    const linhas = await lerLinhasDeParametros()
    const nova = new Map<string, Map<string, Linha>>()
    for (const l of linhas) {
      const marca = String(l.marca)
      if (!nova.has(marca)) nova.set(marca, new Map())
      nova.get(marca)!.set(String(l.robo_id), daLinha(l))
    }
    memoria.clear()
    for (const [m, robos] of nova) memoria.set(m, robos)
    carregadaEm = Date.now()
  } catch (e) {
    console.error(`[parametros] não consegui ler robos_parametros (${(e as Error).message}); segue com ${memoria.size ? 'a memória anterior' : 'o padrão do código'}.`)
  }
}

export function ligarAtualizacaoDeParametros(intervaloMs = 60_000): () => void {
  const relogio = setInterval(() => { void carregarParametros() }, intervaloMs)
  relogio.unref?.()
  return () => clearInterval(relogio)
}

/** Quando a memória foi lida pela última vez (0 = nunca). */
export const parametrosLidosEm = () => carregadaEm

export function linhaDe(marca: string, roboId: string): Linha | null {
  return memoria.get(marcaPorId(marca).id)?.get(roboId) ?? null
}

/** O robô pertence à marca? Senão, nem vale olhar o banco. */
export function conferirRoboDaMarca(marca: string, roboId: string): void {
  if (!marcaPorId(marca).robos.includes(roboId)) throw erroDeValidacao(['Este robô não pertence a esta plataforma.'])
}

/**
 * Os parâmetros que valem AGORA para uma sessão deste robô nesta marca.
 * Conta demo usa a versão em teste quando há uma; conta real, sempre a
 * publicada. Sem linha (ou linha inválida) = padrão do código.
 */
export function vigente(marca: string, roboId: string, demo: boolean): ParametrosVigentes {
  const padrao = parametrosPadrao(roboId)
  const linha = linhaDe(marca, roboId)
  if (!linha) return { parametros: padrao, versao: null, testeDemo: false }
  const emTeste = demo && linha.testeDemo != null
  const bruto = emTeste ? linha.testeDemo : linha.parametros
  const p = mesclar(padrao, bruto)
  const erros = validar(p, roboId)
  if (erros.length) {
    console.error(`[parametros] ${marca}/${roboId} v${linha.versao}${emTeste ? ' (teste)' : ''} inválida no banco — usando o padrão: ${erros.join(' · ')}`)
    return { parametros: padrao, versao: null, testeDemo: false }
  }
  return { parametros: p, versao: linha.versao, testeDemo: emTeste }
}

/** A versão em teste mesclada, ou null quando não há teste. */
export function emTesteNoDemo(marca: string, roboId: string): ParametrosDoRobo | null {
  const linha = linhaDe(marca, roboId)
  if (!linha || linha.testeDemo == null) return null
  const p = mesclar(parametrosPadrao(roboId), linha.testeDemo)
  return validar(p, roboId).length ? null : p
}

/* ------------------------------------------------------------------ *
 * Escritas. Todas: validam, gravam, atualizam a memória e auditam.
 * ------------------------------------------------------------------ */

export class ErroDeValidacao extends Error {
  constructor(public erros: string[]) { super(erros[0] ?? 'Parâmetros inválidos.') }
}
const erroDeValidacao = (erros: string[]) => new ErroDeValidacao(erros)

/** O objeto completo e validado, ou um erro com a lista inteira para a tela. */
function normalizar(roboId: string, bruto: unknown): ParametrosDoRobo {
  const p = mesclar(parametrosPadrao(roboId), bruto)
  const erros = validar(p, roboId)
  if (erros.length) throw erroDeValidacao(erros)
  return p
}

function guardarNaMemoria(marca: string, roboId: string, l: LinhaParametrosBanco): Linha {
  const m = marcaPorId(marca).id
  if (!memoria.has(m)) memoria.set(m, new Map())
  const linha = daLinha(l)
  memoria.get(m)!.set(roboId, linha)
  return linha
}

async function auditar(marca: string, quem: string, roboId: string, acao: string, detalhes: Record<string, unknown>) {
  try {
    await gravarAuditoriaAdmin({ marca: marcaPorId(marca).id, adminId: quem, acao: 'robo_parametros', detalhes: { robo_id: roboId, acao, ...detalhes } })
  } catch (e) {
    console.warn(`[parametros] auditoria não gravada (${acao} ${marca}/${roboId}): ${(e as Error).message}`)
  }
}

/**
 * Guarda o rascunho (o que o admin está editando). Nunca chega ao motor.
 * Robô ainda sem linha: cria a linha com o padrão publicado (v1 = padrão),
 * o jeito mais simples de o rascunho viver na nuvem.
 */
export async function salvarRascunho(marca: string, roboId: string, rascunho: unknown, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const existente = linhaDe(marca, roboId)
  // `null` = "Descartar rascunho": limpa a coluna sem tocar no publicado.
  if (rascunho === null) {
    if (!existente) throw erroDeValidacao(['Este robô não tem rascunho para descartar.'])
    const limpa = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, true, { rascunho: null, rascunho_em: null, rascunho_por: null })
    return guardarNaMemoria(marca, roboId, limpa)
  }
  const p = normalizar(roboId, rascunho)
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, existente !== null, {
    rascunho: p, rascunho_em: new Date().toISOString(), rascunho_por: quem,
    ...(existente ? {} : { parametros: parametrosPadrao(roboId), ultima_acao: 'publicou', observacao: 'linha criada ao salvar o rascunho (parâmetros = padrão)', atualizado_por: quem }),
  })
  return guardarNaMemoria(marca, roboId, gravada)
}

export async function publicar(marca: string, roboId: string, parametros: unknown, observacao: string, simulacao: unknown, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const p = normalizar(roboId, parametros)
  const antes = linhaDe(marca, roboId)
  const anterior = antes ? mesclar(parametrosPadrao(roboId), antes.parametros) : parametrosPadrao(roboId)
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, antes !== null, {
    parametros: p, rascunho: null, rascunho_em: null, rascunho_por: null, ultima_acao: 'publicou', observacao, simulacao: simulacao ?? null, atualizado_por: quem,
  })
  const linha = guardarNaMemoria(marca, roboId, gravada)
  await auditar(marca, quem, roboId, 'publicou', { de_versao: antes?.versao ?? null, para_versao: linha.versao, observacao, diff: diferencas(p, anterior) })
  return linha
}

export async function testarNoDemo(marca: string, roboId: string, parametros: unknown, observacao: string, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const p = normalizar(roboId, parametros)
  const antes = linhaDe(marca, roboId)
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, antes !== null, {
    teste_demo: p, rascunho: null, rascunho_em: null, rascunho_por: null, ultima_acao: 'testou_demo', observacao, atualizado_por: quem,
    ...(antes ? {} : { parametros: parametrosPadrao(roboId) }),
  })
  const linha = guardarNaMemoria(marca, roboId, gravada)
  await auditar(marca, quem, roboId, 'testou_demo', { versao: linha.versao, observacao, diff: diferencas(p, mesclar(parametrosPadrao(roboId), linha.parametros)) })
  return linha
}

export async function promoverDemo(marca: string, roboId: string, observacao: string, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const antes = linhaDe(marca, roboId)
  if (!antes || antes.testeDemo == null) throw erroDeValidacao(['Não há versão em teste no demo para promover.'])
  const p = normalizar(roboId, antes.testeDemo)
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, true, {
    parametros: p, teste_demo: null, ultima_acao: 'promoveu_demo', observacao, atualizado_por: quem,
  })
  const linha = guardarNaMemoria(marca, roboId, gravada)
  await auditar(marca, quem, roboId, 'promoveu_demo', { de_versao: antes.versao, para_versao: linha.versao, observacao })
  return linha
}

export async function descartarTeste(marca: string, roboId: string, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const antes = linhaDe(marca, roboId)
  if (!antes) throw erroDeValidacao(['Este robô não tem nada em teste.'])
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, true, { teste_demo: null, ultima_acao: 'descartou_demo', atualizado_por: quem })
  const linha = guardarNaMemoria(marca, roboId, gravada)
  await auditar(marca, quem, roboId, 'descartou_demo', { versao: linha.versao })
  return linha
}

export async function restaurarVersao(marca: string, roboId: string, versao: number, quem: string): Promise<Linha> {
  conferirRoboDaMarca(marca, roboId)
  const passado = (await lerHistoricoDeParametros(marcaPorId(marca).id, roboId, 200)).find((h) => Number(h.versao) === versao && h.acao !== 'restaurou_padrao')
  if (!passado) throw erroDeValidacao([`A versão ${versao} não existe no histórico deste robô.`])
  const p = normalizar(roboId, passado.parametros)
  const antes = linhaDe(marca, roboId)
  const gravada = await gravarLinhaDeParametros(marcaPorId(marca).id, roboId, antes !== null, {
    parametros: p, rascunho: null, rascunho_em: null, rascunho_por: null, ultima_acao: 'restaurou_versao', observacao: `Voltou para a versão ${versao}`, atualizado_por: quem,
  })
  const linha = guardarNaMemoria(marca, roboId, gravada)
  await auditar(marca, quem, roboId, 'restaurou_versao', { de_versao: antes?.versao ?? null, para_versao: linha.versao, restaurada: versao })
  return linha
}

/** Apaga a linha: o robô volta ao padrão do código (o gatilho do banco registra no histórico). */
export async function restaurarPadrao(marca: string, roboId: string, quem: string): Promise<void> {
  conferirRoboDaMarca(marca, roboId)
  const antes = linhaDe(marca, roboId)
  if (!antes) return
  await apagarLinhaDeParametros(marcaPorId(marca).id, roboId)
  memoria.get(marcaPorId(marca).id)?.delete(roboId)
  await auditar(marca, quem, roboId, 'restaurou_padrao', { de_versao: antes.versao })
}

export interface ItemHistorico {
  versao: number; acao: string; observacao: string | null; alteradoEm: string
  alteradoPor: { id: string | null; nome: string | null }
  parametros: unknown; simulacao: unknown | null
  diff: Array<{ campo: string; de: string; para: string }>
}

export async function historico(marca: string, roboId: string, limite = 50): Promise<ItemHistorico[]> {
  conferirRoboDaMarca(marca, roboId)
  const linhas = await lerHistoricoDeParametros(marcaPorId(marca).id, roboId, limite)
  const nomes = new Map<string, string | null>()
  const saida: ItemHistorico[] = []
  for (const h of linhas) {
    const quem = h.alterado_por ?? null
    if (quem && !nomes.has(quem)) nomes.set(quem, await nomeDoUsuario(quem).catch(() => null))
    const restaurouPadrao = h.acao === 'restaurou_padrao'
    const para = restaurouPadrao ? parametrosPadrao(roboId) : mesclar(parametrosPadrao(roboId), h.parametros)
    const de = h.parametros_anteriores ? mesclar(parametrosPadrao(roboId), h.parametros_anteriores) : parametrosPadrao(roboId)
    saida.push({
      versao: Number(h.versao), acao: String(h.acao), observacao: h.observacao ?? null, alteradoEm: String(h.alterado_em ?? ''),
      alteradoPor: { id: quem, nome: quem ? nomes.get(quem) ?? null : null },
      parametros: para, simulacao: h.simulacao ?? null,
      diff: diferencas(para, de).map((d) => ({ campo: d.campo, de: d.de, para: d.para })),
    })
  }
  return saida
}
