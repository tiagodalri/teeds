/**
 * Capas da sala de aula da GlobalFly: pôsteres verticais (2:3), um por aula,
 * em public/aulas-globalfly/ com o id da aula como nome. Só este site recebe
 * a pasta (vite.config.ts tira aulas-<outra marca> dos outros builds).
 */
import { vitrine } from '../core/teeds/parceiro'

export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-globalfly/${id}.jpg`

/**
 * As capas com o Naor (09/11/2026, pedido do Tiago: "capas para as aulas do
 * Naor", fotos dele com as aeronaves das I.A.). Só quem está na vitrine /n vê;
 * os alunos do Victor e os diretos seguem com as capas acima. A vitrine é a
 * mesma regra da comunidade e do afiliado do parceiro (core/teeds/parceiro.ts).
 * Arquivos em public/aulas-globalfly/naor/ (.jpg, .webp e -mobile.webp).
 */
const DO_NAOR = new Set([
  'introducao', 'visao-geral', 'conta-deriv', 'primeiro-deposito', 'saldo-demo-real',
  'documentos', 'autenticador', 'deriv-confiavel', 'quem-e-victor-cordeiro', 'o-que-sao-as-ias',
  'robo-raptor', 'robo-gulf', 'robo-falcon', 'robo-legacy', 'robo-phenom',
  'operando-na-pratica', 'dicas', 'gerenciamento', 'gestao-na-pratica', 'day-trade',
  'erros-de-iniciante', 'meta-diaria', 'consistencia', 'paciencia', 'melhor-momento-day-trade',
  'sair-do-trabalho', 'continuar-mesmo-dando-errado', 'ganhar-e-perder', 'depoimentos',
])
export const capaEspecial = (id: string): string | null =>
  vitrine() === 'n' && DO_NAOR.has(id) ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/${id}.jpg` : null

/** As artes dos Destaques com o Naor (09/11/2026), mesma regra da vitrine /n. */
const DESTAQUES_DO_NAOR = new Set(['ao-vivo', 'comunidade', 'conta', 'deposito', 'apostila'])
export const destaqueEspecial = (id: string): string | null =>
  vitrine() === 'n' && DESTAQUES_DO_NAOR.has(id) ? `${import.meta.env.BASE_URL}aulas-globalfly/naor/destaque-${id}.webp` : null
