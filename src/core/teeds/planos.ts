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
/** Sem marca, vale a deste site; o servidor sempre passa a marca do cadastro. */
export const planoClienteValido = (id: string, m: { aoVivo?: boolean } = MARCA) => planosDaMarca(m).some((p) => p.id === id)
