import { MARCA } from '../../marca'

/** Cargo administrativo não é um plano de cliente. */
const BASE = [{ id: 'essencial', nome: 'Sem simulador' }, { id: 'pro', nome: 'Com simulador' }]
/*
  Plano de treino (18/10/2026): influenciadores e equipe que ensaiam lives na
  sala simulada. Não é cliente. Só existe na GlobalFly (o banco também só o
  oferece a ela: planos.marcas).
*/
const TREINO = { id: 'treino', nome: 'Treino de influenciadores' }
export const PLANOS_CLIENTE: ReadonlyArray<{ id: string; nome: string }> =
  MARCA.aoVivo ? [...BASE, TREINO] : BASE
export const planoClienteValido = (id: string) => PLANOS_CLIENTE.some((p) => p.id === id)
