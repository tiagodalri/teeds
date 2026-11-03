/**
 * O público de um anúncio no Estúdio (03/11/2026, Tiago: "está bem cru... cadê os interesses, cadê o
 * aparelho, iOS, Android, iPhone 15, 16, 17, cadê veicular no Insta ou no Face... isso precisa ser
 * uma central de inteligência, com o poder do Gerenciador mas com a nossa cara").
 *
 * Três jeitos de montar:
 *   * 'padrao'      Advantage+: a Meta encontra quem se cadastra (só local, idade mínima e exclusões);
 *   * 'detalhado'   você escolhe tudo: local (estado, cidade com raio), idade, gênero, interesses,
 *                   comportamentos, exclusões, idioma, aparelho (sistema, modelo, só Wi-Fi) e onde aparece;
 *   * 'inteligente' públicos do próprio pixel: semelhantes a quem se cadastrou ou remarketing de quem
 *                   visitou e não se cadastrou (nenhum dado pessoal é enviado: a Meta monta pelo pixel).
 * Interesses, lugares e aparelhos guardam o nome; o número da Meta (id) vem da busca ao vivo (com a
 * chave) ou é procurado pela função meta-estudio na hora de criar. O que não for encontrado vira aviso.
 */

export type Modo = 'padrao' | 'detalhado' | 'inteligente'
export interface Local { tipo: 'estado' | 'cidade'; nome: string; chave?: string; raio?: number }
export interface Interesse { tipo: 'interesse' | 'comportamento'; nome: string; id?: string; tamanho?: [number, number]; caminho?: string }
export interface Posicionamentos { modo: 'auto' | 'manual'; instagram: string[]; facebook: string[]; messenger: boolean; audienceNetwork: boolean; aparelhos: Array<'mobile' | 'desktop'> }
export interface Publico {
  /** 'personalizado' é o nome antigo de 'detalhado' (rascunhos de antes de 03/11/2026) */
  modo: Modo | 'personalizado'
  idadeMin: number; idadeMax: number; genero: 'todos' | 'homens' | 'mulheres'
  locais?: Local[]
  interesses?: Interesse[]
  excluirInteresses?: Interesse[]
  /** só quem usa o Facebook/Instagram em português */
  portugues?: boolean
  sistema?: 'todos' | 'ios' | 'android'
  modelos?: string[]
  soWifi?: boolean
  posicionamentos?: Posicionamentos
  inteligente?: { tipo: 'semelhantes' | 'remarketing'; percentual: number; dias: number }
  excluirCadastrados?: boolean
}

export const POSICIONAMENTO_AUTO: Posicionamentos = { modo: 'auto', instagram: ['stream', 'story', 'reels', 'explore'], facebook: ['feed', 'story', 'facebook_reels'], messenger: false, audienceNetwork: false, aparelhos: ['mobile', 'desktop'] }
export const PUBLICO_PADRAO: Publico = { modo: 'padrao', idadeMin: 18, idadeMax: 65, genero: 'todos', locais: [], interesses: [], excluirInteresses: [], sistema: 'todos', modelos: [], posicionamentos: POSICIONAMENTO_AUTO, excluirCadastrados: true }
/** Completa um público antigo (ou parcial) com os campos novos. */
export const publicoCompleto = (p?: Partial<Publico>): Publico => {
  const x = { ...PUBLICO_PADRAO, ...(p ?? {}) } as Publico
  if (x.modo === 'personalizado') x.modo = 'detalhado'
  return { ...x, posicionamentos: { ...POSICIONAMENTO_AUTO, ...(p?.posicionamentos ?? {}) } }
}

export const INSTAGRAM: Array<{ id: string; nome: string }> = [
  { id: 'stream', nome: 'Feed' }, { id: 'story', nome: 'Stories' }, { id: 'reels', nome: 'Reels' },
  { id: 'explore', nome: 'Explorar' }, { id: 'explore_home', nome: 'Explorar (início)' }, { id: 'profile_feed', nome: 'Feed do perfil' },
]
export const FACEBOOK: Array<{ id: string; nome: string }> = [
  { id: 'feed', nome: 'Feed' }, { id: 'story', nome: 'Stories' }, { id: 'facebook_reels', nome: 'Reels' },
  { id: 'marketplace', nome: 'Marketplace' }, { id: 'video_feeds', nome: 'Vídeos' }, { id: 'search', nome: 'Resultados da busca' },
  { id: 'instream_video', nome: 'No meio de vídeos' },
]

export const ESTADOS = ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso',
  'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul',
  'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins']
export const CIDADES_GRANDES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Curitiba', 'Porto Alegre', 'Salvador', 'Recife', 'Fortaleza', 'Goiânia', 'Campinas', 'Florianópolis', 'Manaus', 'Belém', 'Vitória']

/** Sugestões da GF (pelo nome; a Meta devolve o id na busca ou na hora de criar). */
export const SUGESTOES: Array<{ grupo: string; itens: Interesse[] }> = [
  { grupo: 'Mercado financeiro', itens: ['Day trading', 'Forex', 'Mercado de ações', 'Bolsa de valores', 'Investimento', 'Análise técnica', 'Mercado financeiro', 'Trader'].map((nome) => ({ tipo: 'interesse' as const, nome })) },
  { grupo: 'Cripto e tecnologia', itens: ['Criptomoeda', 'Bitcoin', 'Inteligência artificial', 'Tecnologia', 'Fintech'].map((nome) => ({ tipo: 'interesse' as const, nome })) },
  { grupo: 'Dinheiro e negócios', itens: ['Finanças pessoais', 'Educação financeira', 'Empreendedorismo', 'Pequenas empresas', 'Independência financeira', 'Renda passiva'].map((nome) => ({ tipo: 'interesse' as const, nome })) },
  { grupo: 'Marcas e ferramentas', itens: ['TradingView', 'MetaTrader', 'XP Investimentos', 'Binance', 'Nubank', 'Investing.com'].map((nome) => ({ tipo: 'interesse' as const, nome })) },
  { grupo: 'Comportamentos', itens: ['Usuários de dispositivos iOS', 'Usuários de dispositivos Android', 'Administradores de página de empresa', 'Interessados em tecnologia'].map((nome) => ({ tipo: 'comportamento' as const, nome })) },
]

/** Os aparelhos mais pedidos, pelo nome que a Meta usa (o servidor confere na lista dela). */
export const MODELOS: Array<{ marca: 'Apple' | 'Samsung' | 'Motorola' | 'Xiaomi'; nomes: string[] }> = [
  { marca: 'Apple', nomes: ['iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17', 'iPhone Air', 'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16', 'iPhone 16e', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14', 'iPhone 13 Pro Max', 'iPhone 13'] },
  { marca: 'Samsung', nomes: ['Galaxy S25 Ultra', 'Galaxy S25+', 'Galaxy S25', 'Galaxy S24 Ultra', 'Galaxy S24', 'Galaxy S23 Ultra', 'Galaxy S23', 'Galaxy Z Fold6', 'Galaxy Z Flip6', 'Galaxy A55', 'Galaxy A35'] },
  { marca: 'Motorola', nomes: ['Motorola Edge 50 Pro', 'Motorola Edge 40', 'Moto G84', 'Moto G54'] },
  { marca: 'Xiaomi', nomes: ['Xiaomi 14', 'Redmi Note 13 Pro', 'Redmi Note 13', 'POCO X6 Pro'] },
]
/** Atalhos de aparelho: escolhem vários modelos de uma vez. */
export const ATALHOS_DE_MODELO: Array<{ nome: string; sistema: 'ios' | 'android'; modelos: string[] }> = [
  { nome: 'iPhones recentes (15 em diante)', sistema: 'ios', modelos: MODELOS[0].nomes.filter((n) => /iPhone (15|16|17|Air)/.test(n)) },
  { nome: 'iPhones Pro', sistema: 'ios', modelos: MODELOS[0].nomes.filter((n) => /Pro/.test(n)) },
  { nome: 'Galaxy linha S', sistema: 'android', modelos: MODELOS[1].nomes.filter((n) => /Galaxy S/.test(n)) },
]

const milhoes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: n >= 1e7 ? 0 : 1 })} mi` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('pt-BR')} mil` : n.toLocaleString('pt-BR'))
export const tamanhoLegivel = (t?: [number, number] | null) => (!t ? '' : t[0] === t[1] ? milhoes(t[0]) : `${milhoes(t[0])} a ${milhoes(t[1])}`)

/** O público em uma frase, para o resumo, o revisar e a lista de públicos salvos. */
export function resumoDoPublico(entrada: Partial<Publico>): string {
  const p = publicoCompleto(entrada)
  const partes: string[] = []
  const locais = p.locais ?? []
  partes.push(locais.length ? locais.map((l) => (l.tipo === 'cidade' && l.raio ? `${l.nome} (+${l.raio} km)` : l.nome)).slice(0, 4).join(', ') + (locais.length > 4 ? ` e mais ${locais.length - 4}` : '') : 'Brasil')
  if (p.modo === 'padrao') {
    partes.push(`a partir de ${p.idadeMin} anos`, 'a Meta encontra quem se cadastra (Advantage+)')
  } else {
    partes.push(`${p.idadeMin} a ${p.idadeMax}${p.idadeMax === 65 ? '+' : ''} anos`)
    if (p.genero !== 'todos') partes.push(`só ${p.genero}`)
  }
  if (p.modo === 'inteligente' && p.inteligente) partes.push(p.inteligente.tipo === 'semelhantes' ? `semelhantes a quem se cadastrou (${p.inteligente.percentual}%)` : `quem visitou a página nos últimos ${p.inteligente.dias} dias e não se cadastrou`)
  if (p.modo === 'detalhado' && p.interesses?.length) partes.push(`${p.interesses.length} ${p.interesses.length === 1 ? 'interesse' : 'interesses'}`)
  if (p.modo === 'detalhado' && p.excluirInteresses?.length) partes.push(`${p.excluirInteresses.length} excluído${p.excluirInteresses.length === 1 ? '' : 's'}`)
  if (p.modo !== 'padrao') {
    if (p.modelos?.length) partes.push(`${p.modelos.length} ${p.modelos.length === 1 ? 'modelo de celular' : 'modelos de celular'}`)
    else if (p.sistema && p.sistema !== 'todos') partes.push(p.sistema === 'ios' ? 'só iPhone' : 'só Android')
    if (p.soWifi) partes.push('só no Wi-Fi')
    if (p.portugues) partes.push('em português')
  }
  if (p.excluirCadastrados) partes.push('sem quem já se cadastrou')
  const pos = p.posicionamentos
  if (pos && pos.modo === 'manual') {
    const lugares = [pos.instagram.length ? `Instagram (${pos.instagram.length})` : '', pos.facebook.length ? `Facebook (${pos.facebook.length})` : '', pos.messenger ? 'Messenger' : '', pos.audienceNetwork ? 'Audience Network' : ''].filter(Boolean)
    partes.push(lugares.length ? `só em ${lugares.join(', ')}` : 'sem lugar escolhido')
  }
  return partes.join(' · ')
}

/** O que falta para o público valer (aparece no passo e no revisar). */
export function problemasDoPublico(entrada: Partial<Publico>): string[] {
  const p = publicoCompleto(entrada), l: string[] = []
  const pos = p.posicionamentos!
  if (pos.modo === 'manual' && !pos.instagram.length && !pos.facebook.length && !pos.messenger && !pos.audienceNetwork) l.push('Escolha pelo menos um lugar onde o anúncio aparece.')
  if (pos.modo === 'manual' && !pos.aparelhos.length) l.push('Escolha celular, computador ou os dois.')
  if (p.modo === 'padrao' && p.idadeMin > 25) l.push('No Advantage+, a idade mínima vai até 25 anos (o resto a Meta decide). Use "Eu escolho" para travar a idade.')
  if (p.modelos?.length && p.sistema === 'todos') l.push('Ao escolher modelos de celular, escolha também o sistema (iPhone ou Android).')
  if (pos.modo === 'manual' && (pos.messenger || pos.audienceNetwork) && !pos.facebook.length) l.push('Messenger e Audience Network só funcionam junto com algum lugar do Facebook.')
  return l
}
