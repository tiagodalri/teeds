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
export const PLANOS_CLIENTE: ReadonlyArray<{ id: string; nome: string }> =
  MARCA.aoVivo ? [...BASE, TREINO] : BASE
export const planoClienteValido = (id: string) => PLANOS_CLIENTE.some((p) => p.id === id)
