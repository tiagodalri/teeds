/*
  Link curto da Divulgação (27/11/2026). Victor: "está horrível esse link para mandar
  para a galera no direct, está muito grande". O link marcado era
  globalflytrade.com/v?utm_source=instagram&utm_medium=bio&utm_campaign=cadastro-planos.

  Agora cada combinação de rede + lugar do post (+ plano) tem um endereço curto de
  verdade, montado no build (vite.config.ts) como página estática:
    globalflytrade.com/v/ib        Instagram, link da bio
    globalflytrade.com/v/id-black  Instagram, direct, direto no Black
  A página curta só encaminha para o mesmo destino do link longo, com as MESMAS
  marcações utm (a central de rastreio, o clique do parceiro e o cadastro leem igual).
  Este arquivo não importa nada: o vite.config usa as mesmas tabelas.
*/

export const CAMPANHA_DO_CADASTRO = 'cadastro-planos'

/** rede = utm_source; letra = 1ª letra do código curto */
export const REDES_DO_LINK = [
  { id: 'instagram', nome: 'Instagram', letra: 'i' },
  { id: 'whatsapp', nome: 'WhatsApp', letra: 'w' },
  { id: 'youtube', nome: 'YouTube', letra: 'y' },
  { id: 'tiktok', nome: 'TikTok', letra: 't' },
  { id: 'telegram', nome: 'Telegram', letra: 'g' },
] as const

/** lugar do post = utm_medium; letra = 2ª letra do código curto */
export const FORMATOS_DO_LINK = [
  { id: 'bio', nome: 'Link da bio', letra: 'b' },
  { id: 'stories', nome: 'Stories', letra: 's' },
  { id: 'post', nome: 'Post ou Reels', letra: 'p' },
  { id: 'direct', nome: 'Direct ou conversa', letra: 'd' },
  { id: 'grupo', nome: 'Grupo ou comunidade', letra: 'g' },
] as const

/** planos com link próprio ("Direto no Gold"); vão no fim do código: /v/id-gold */
export const PLANOS_DO_LINK = ['gold', 'black', 'prestige'] as const

export type CodigoCurto = { codigo: string; utm: Record<string, string>; plano: string | null }

/** Código curto de uma combinação (sem a barra do parceiro), ou null se não houver. */
export function codigoCurto(rede: string, formato: string, plano: string | null = null): string | null {
  const r = REDES_DO_LINK.find((x) => x.id === rede)
  const f = FORMATOS_DO_LINK.find((x) => x.id === formato)
  if (!r || !f) return null
  if (plano && !(PLANOS_DO_LINK as readonly string[]).includes(plano)) return null
  return `${r.letra}${f.letra}${plano ? `-${plano}` : ''}`
}

/** Marcações que o link longo levava; as mesmas que a página curta põe no destino. */
export function marcacoes(rede: string, formato: string, plano: string | null = null): Record<string, string> {
  const m: Record<string, string> = { utm_source: rede, utm_medium: formato, utm_campaign: CAMPANHA_DO_CADASTRO }
  if (plano) m.utm_content = `plano-${plano}`
  return m
}

/** Todas as combinações, para o build gerar uma página por código. */
export function todosOsCodigosCurtos(): CodigoCurto[] {
  const lista: CodigoCurto[] = []
  for (const r of REDES_DO_LINK) for (const f of FORMATOS_DO_LINK) for (const plano of [null, ...PLANOS_DO_LINK]) {
    lista.push({ codigo: codigoCurto(r.id, f.id, plano)!, utm: marcacoes(r.id, f.id, plano), plano })
  }
  return lista
}

/*
  Super Live (27/11/2026, Tiago: "o link da superlive também, vários canais, tudo trackeado,
  interligado com a Divulgação, no formato curto"). Os links de cada canal já existem na Central
  de rastreio (rastreio_links sl-<nome>-<canal>) e o painel da Super Live (Administração › Leads)
  conta por eles. O curto /v/sl-direct só abre /v/superlive/?o=sl-victor-direct: o mesmo código.
*/
export const CANAIS_DA_SUPERLIVE = [
  { id: 'stories', nome: 'Stories' },
  { id: 'bio', nome: 'Bio do Instagram' },
  { id: 'direct', nome: 'Direct do Instagram' },
  { id: 'manychat', nome: 'ManyChat' },
  { id: 'telegram', nome: 'Telegram' },
  { id: 'comunidade', nome: 'Comunidade do WhatsApp' },
  { id: 'whatsapp', nome: 'WhatsApp direto' },
] as const

/** Nome do parceiro nos códigos da Central (sl-victor-…); parceiro fora daqui não tem links da Super Live. */
const NOME_NOS_CODIGOS: Record<string, string> = { v: 'victor', n: 'naor' }

export function temLinksDaSuperLive(parceiro: string): boolean { return parceiro in NOME_NOS_CODIGOS }

/** Código curto (sl-direct) e o ?o= da Central (sl-victor-direct) de cada canal. */
export function linksDaSuperLive(parceiro: string): Array<{ curto: string; o: string; canal: string; nome: string }> {
  const nome = NOME_NOS_CODIGOS[parceiro]
  if (!nome) return []
  return CANAIS_DA_SUPERLIVE.map((c) => ({ curto: `sl-${c.id}`, o: `sl-${nome}-${c.id}`, canal: c.id, nome: c.nome }))
}
