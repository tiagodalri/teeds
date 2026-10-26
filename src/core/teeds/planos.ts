import { MARCA } from '../../marca'

/** Cargo administrativo não é um plano de cliente. */
const BASE = [{ id: 'essencial', nome: 'Sem simulador' }, { id: 'pro', nome: 'Com simulador' }]
/*
  Plano GF Member (o id continua 'treino'; era "Treino de influenciadores"
  até 20/10/2026): quem assiste os ensaios da sala de treino. Só existe na
  GlobalFly (o banco também só o oferece a ela: planos.marcas). Um membro
  não vê as mensagens dos outros membros no chat (core/live/treino.ts).
*/
const TREINO = { id: 'treino', nome: 'GF Member' }
/** Os planos que uma marca oferece (o servidor atende as três marcas e passa a do cadastro). */
export const planosDaMarca = (m: { aoVivo?: boolean }): ReadonlyArray<{ id: string; nome: string }> =>
  m.aoVivo ? [...BASE, TREINO] : BASE
export const PLANOS_CLIENTE = planosDaMarca(MARCA)
/*
  26/10/2026: os planos passaram a ser configurados no painel (Administração >
  Planos, tabela planos_da_marca). Quem confere se o plano existe NA MARCA é o
  banco (gatilho teeds_proteger_plano); aqui só se recusa o que nem tem cara
  de id. As listas acima ficam como reserva dos nomes, antes de o banco responder.
*/
/** Sem marca, vale a deste site; o servidor sempre passa a marca do cadastro. */
export const planoClienteValido = (id: string, m: { aoVivo?: boolean } = MARCA) =>
  planosDaMarca(m).some((p) => p.id === id) || /^[a-z0-9][a-z0-9-]{1,39}$/.test(id)

const nomesDoBanco = new Map<string, string>()
/** Guarda os nomes que vieram do banco (listarPlanos chama ao carregar). */
export function lembrarNomesDosPlanos(lista: ReadonlyArray<{ id: string; nome: string }>): void {
  for (const p of lista) nomesDoBanco.set(p.id, p.nome)
}
/** O nome do plano como está configurado no painel; sem resposta do banco, o nome de reserva. */
export const nomeDoPlano = (id: string): string =>
  nomesDoBanco.get(id) ?? planosDaMarca(MARCA).find((p) => p.id === id)?.nome ?? id
