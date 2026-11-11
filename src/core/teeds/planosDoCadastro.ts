/**
 * Os planos que o cadastro da GlobalFly mostra antes do formulário (11/11/2026, Tiago:
 * "como no ChatGPT: as opções para escolher, a gratuita, a Black e os valores").
 *
 * A fonte é a tabela `subplanos` (Admin › Planos), lida pela função pública
 * `gf_subplanos_publicos` (quem se cadastra ainda não está logado). Enquanto ela
 * não responde, ou se não existir, valem os valores abaixo, iguais aos do banco em
 * 11/11/2026: a página nunca abre vazia.
 *
 * O CHECKOUT É O DO PARCEIRO DA PESSOA. O banco liga o cliente ao parceiro do
 * primeiro toque (parceiro.ts); a venda tem de cair na Cakto desse mesmo parceiro
 * (o Naor tem conta própria). Por isso: parceiro guardado, senão a vitrine, senão
 * o checkout padrão do subplano.
 */
import { SUPABASE } from './config'
import { parceiroGuardado, vitrine } from './parceiro'

export type IdDoPlano = 'gold' | 'black' | 'prestige'

export interface PlanoDoCadastro {
  id: IdDoPlano
  nome: string
  chamada: string
  preco: number
  referencia: number | null
  /** 0,10 = 10% do lucro do mês */
  compartilhamento: number
  /** null = todas as I.A. */
  ias: string[] | null
  /** null = ilimitado */
  simuladorHoras: number | null
  salaExtra: boolean
  assessor: boolean
  lab: boolean
  checkout: string | null
  checkoutPorParceiro: Record<string, string>
}

export const IAS_DA_GF: Array<[string, string]> = [
  ['goreme', 'GF Raptor'], ['falcon', 'GF Falcon'], ['legacy', 'GF Legacy'], ['superior5', 'GF Gulf'], ['ag2', 'GF Phenom'],
]

export const PLANOS_PADRAO: PlanoDoCadastro[] = [
  { id: 'gold', nome: 'Gold', chamada: 'A entrada no GF Member. Sem custo de entrada: você só compartilha quando lucra.',
    preco: 0, referencia: 997, compartilhamento: 0.10, ias: ['goreme', 'falcon', 'legacy'], simuladorHoras: 1,
    salaExtra: false, assessor: false, lab: false, checkout: null, checkoutPorParceiro: {} },
  { id: 'black', nome: 'Black', chamada: 'Todas as I.A., 12 horas de simulador por dia e a sala extra.',
    preco: 997, referencia: 1997, compartilhamento: 0.05, ias: null, simuladorHoras: 12,
    salaExtra: true, assessor: false, lab: false,
    checkout: 'https://pay.cakto.com.br/7a8jgb7', checkoutPorParceiro: { n: 'https://pay.cakto.com.br/f2jvqbi' } },
  { id: 'prestige', nome: 'Prestige', chamada: 'Tudo liberado, sem compartilhamento, com assessor e GFT Lab.',
    preco: 1997, referencia: 2997, compartilhamento: 0, ias: null, simuladorHoras: null,
    salaExtra: true, assessor: true, lab: true,
    checkout: 'https://pay.cakto.com.br/h7d75ko', checkoutPorParceiro: { n: 'https://pay.cakto.com.br/3fnk7dt' } },
]

// a chamada do Gold no banco fala de "participação nos lucros"; no cadastro vale a frase da página
const CHAMADA_DO_CADASTRO: Partial<Record<IdDoPlano, string>> = { gold: PLANOS_PADRAO[0].chamada }

/** Lê os subplanos do banco; sem resposta, devolve os valores padrão. */
export async function carregarPlanosDoCadastro(): Promise<PlanoDoCadastro[]> {
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/gf_subplanos_publicos`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'content-type': 'application/json' },
      body: '{}',
    })
    if (!r.ok) return PLANOS_PADRAO
    const lista = await r.json() as any[]
    const planos = (Array.isArray(lista) ? lista : [])
      .filter((s) => s && (s.id === 'gold' || s.id === 'black' || s.id === 'prestige'))
      .map((s): PlanoDoCadastro => ({
        id: s.id, nome: s.nome, chamada: CHAMADA_DO_CADASTRO[s.id as IdDoPlano] ?? s.chamada ?? '',
        preco: Number(s.preco) || 0, referencia: s.preco_referencia == null ? null : Number(s.preco_referencia),
        compartilhamento: Number(s.compartilhamento) || 0, ias: s.ias ?? null,
        simuladorHoras: s.simulador_horas == null ? null : Number(s.simulador_horas),
        salaExtra: !!s.sala_extra, assessor: !!s.assessor, lab: !!s.lab,
        checkout: s.checkout_url ?? null, checkoutPorParceiro: s.checkout_por_parceiro ?? {},
      }))
    return planos.length === 3 ? planos : PLANOS_PADRAO
  } catch {
    return PLANOS_PADRAO
  }
}

/** O checkout do plano para a pessoa desta aba (o do parceiro dela, quando ele tem um). */
export function checkoutDoPlano(p: PlanoDoCadastro): string | null {
  const parceiro = parceiroGuardado() ?? vitrine()
  return (parceiro && p.checkoutPorParceiro[parceiro]) || p.checkout
}

export const temIA = (p: PlanoDoCadastro, ia: string) => p.ias == null || p.ias.includes(ia)
export const simuladorLegivel = (h: number | null) => (h == null ? 'Ilimitado' : `${h.toLocaleString('pt-BR')} h por dia`)
export const porcentagem = (x: number) => `${Math.round(x * 100)}%`
