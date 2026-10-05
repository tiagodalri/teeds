/**
 * O caminho do Marketplace ate o checkout da Kiwify.
 *
 * O Simulador de Treinamento (R$ 497) e' vendido fora da plataforma. Quando o
 * pagamento e' aprovado, a Kiwify avisa o nosso gancho (`servidor/src/kiwify.ts`)
 * e o acesso e' ligado sozinho na conta do cliente.
 *
 * E AQUI ESTA O DETALHE QUE FAZ TUDO FUNCIONAR: o gancho acha o cliente pelo
 * E-MAIL, com `lower(email)` na tabela `clientes`. Se a pessoa digitar outro
 * e-mail no checkout — o do trabalho, o do marido, um com erro de digitacao —
 * a compra entra como `sem-cadastro` e NINGUEM e' liberado; alguem tem de
 * resolver a mao depois. Por isso o link leva o e-mail da sessao ja preenchido:
 * nao e' comodidade, e' o que mantem a liberacao automatica de pe.
 *
 * Nome e telefone vao junto so para poupar digitacao.
 *
 * Por enquanto SO A TEEDS vende por aqui. Na OMNI o botao continua registrando
 * interesse para a equipe concluir a venda — e' por isso que o mapa e' por
 * marca, e nao uma constante solta.
 */
import { MARCA } from '../../marca'

/** Checkout externo de cada produto, por marca. Sem entrada = sem checkout. */
const CHECKOUTS: Record<string, Record<string, string>> = {
  teeds: {
    'simulador-treino': 'https://pay.kiwify.com.br/HNyDBOf',
  },
}

export interface CompradorDoCheckout {
  email?: string | null
  nome?: string | null
  telefone?: string | null
}

/** Este produto tem checkout proprio nesta marca? */
export function temCheckout(produtoId: string, marca: string = MARCA.id): boolean {
  return Boolean(CHECKOUTS[marca]?.[produtoId])
}

/**
 * So os digitos do telefone, sem o +55 que o campo da Kiwify ja coloca.
 *
 * O cadastro guarda telefone em formatos variados ('(47) 99999-8888',
 * '+55 47 99999-8888', '5547999998888'). Mandar o 55 junto faria a Kiwify
 * exibir '5547999998888' num campo que ja mostra a bandeira do Brasil.
 */
function telefoneLimpo(valor?: string | null): string {
  const digitos = (valor ?? '').replace(/\D+/g, '')
  if (!digitos) return ''
  const semPais = digitos.startsWith('55') && digitos.length > 11 ? digitos.slice(2) : digitos
  // Celular tem 11, fixo 10. Mais que isso e' lixo e vai atrapalhar a validacao.
  return semPais.length === 10 || semPais.length === 11 ? semPais : ''
}

/**
 * O endereco do checkout com o que ja sabemos do comprador.
 *
 * Devolve `null` quando o produto nao vende por aqui — quem chama usa isso
 * para decidir entre abrir o checkout e registrar interesse.
 */
export function linkDoCheckout(
  produtoId: string,
  comprador?: CompradorDoCheckout | null,
  marca: string = MARCA.id,
): string | null {
  const base = CHECKOUTS[marca]?.[produtoId]
  if (!base) return null

  const url = new URL(base)
  const email = (comprador?.email ?? '').trim().toLowerCase()
  const nome = (comprador?.nome ?? '').trim()
  const telefone = telefoneLimpo(comprador?.telefone)

  if (email) url.searchParams.set('email', email)
  if (nome) url.searchParams.set('name', nome)
  if (telefone) url.searchParams.set('phone', telefone)
  return url.toString()
}
