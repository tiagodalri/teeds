/** Cargo administrativo não é um plano de cliente. */
export const PLANOS_CLIENTE = [{id:'essencial',nome:'Sem simulador'},{id:'pro',nome:'Com simulador'}] as const
export const planoClienteValido = (id:string) => PLANOS_CLIENTE.some(p=>p.id===id)
