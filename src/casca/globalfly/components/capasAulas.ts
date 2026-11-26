/**
 * Capas da sala de aula da GlobalFly: pôsteres verticais (2:3), um por aula,
 * em public/aulas-globalfly/ com o id da aula como nome. Só este site recebe
 * a pasta (vite.config.ts tira aulas-<outra marca> dos outros builds).
 */
import { vitrineDoConteudo } from '../core/teeds/parceiro'
import { MARCA } from '../marca'

/** As capas com o Victor e o Naor são da GlobalFly; a outra marca da família (Legacy Pro) usa as suas. */
const DA_GF = MARCA.id === 'globalfly'

export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-globalfly/${id}.jpg`

/**
 * As capas com o Naor (09/11/2026, pedido do Tiago: "capas para as aulas do
 * Naor", fotos dele com as aeronaves das I.A.). Só quem está na vitrine /n vê;
 * os alunos do Victor e os diretos seguem com as capas acima. A vitrine é a
 * mesma regra da comunidade e do afiliado do parceiro (core/teeds/parceiro.ts).
 * Arquivos em public/aulas-globalfly/naor/ (.jpg, .webp e -mobile.webp).
 */
// 10/11/2026: 'transferir-saldo' (aula extra: depois do PIX, passar o saldo da Wallet da Deriv
// para a conta de Options em Portfólio, senão o saldo da plataforma fica zerado).
const DO_NAOR = new Set([
  'introducao', 'visao-geral', 'conta-deriv', 'primeiro-deposito', 'transferir-saldo', 'saldo-demo-real',
  'documentos', 'autenticador', 'deriv-confiavel', 'quem-e-victor-cordeiro', 'o-que-sao-as-ias',
  'robo-raptor', 'robo-gulf', 'robo-falcon', 'robo-legacy', 'robo-phenom',
  'operando-na-pratica', 'dicas', 'gerenciamento', 'gestao-na-pratica', 'day-trade',
  'erros-de-iniciante', 'meta-diaria', 'consistencia', 'paciencia', 'melhor-momento-day-trade',
  'sair-do-trabalho', 'continuar-mesmo-dando-errado', 'ganhar-e-perder', 'depoimentos',
])
/**
 * Fora do /n (alunos do Victor e diretos), 09/11/2026: as capas com o Victor, fotos
 * profissionais dele em viagem com tratamento de cinema (public/aulas-globalfly/victor/).
 * Valem por cima da capa gravada na grade (as do ChatGPT foram recusadas).
 */
/**
 * 26/11/2026: aulas que só existem no /n (core/teeds/gradeAulas.ts, AULAS_SO_DO_PARCEIRO) usam a
 * capa do Naor da aula equivalente. "Quem é Naor Bezerra?" = a capa do Naor do "Quem é..." ("A HISTÓRIA").
 */
const SO_DO_NAOR: Record<string, string> = { 'quem-e-naor-bezerra': 'quem-e-victor-cordeiro' }

export const capaEspecial = (id: string, v: string = vitrineDoConteudo()): string | null =>
  !DA_GF ? null
    : SO_DO_NAOR[id] ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/${SO_DO_NAOR[id]}.jpg`
    : !DO_NAOR.has(id) ? null
    : v === 'n' ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/${id}.jpg`
    : `${import.meta.env.BASE_URL}aulas-globalfly/victor/${id}.jpg`

/**
 * 16/11/2026: a parte da capa especial que é do PARCEIRO (Naor no /n). Ela vale por
 * cima da capa enviada no painel para todos; a do Victor (fora do /n) é a padrão
 * e perde para a enviada. Ver capaResolvida em components/aulas/CapaDaAula.tsx.
 */
export const capaDoParceiroNoCodigo = (id: string, v: string = vitrineDoConteudo()): string | null =>
  DA_GF && SO_DO_NAOR[id] ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/${SO_DO_NAOR[id]}.jpg`
    : DA_GF && v === 'n' && DO_NAOR.has(id) ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/${id}.jpg` : null

/** As artes dos Destaques com o Naor (09/11/2026), mesma regra da vitrine /n. */
const DESTAQUES_DO_NAOR = new Set(['ao-vivo', 'comunidade', 'conta', 'deposito', 'apostila'])
export const destaqueEspecial = (id: string): string | null =>
  DA_GF && vitrineDoConteudo() === 'n' && DESTAQUES_DO_NAOR.has(id) ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/destaque-${id}.webp` : null
