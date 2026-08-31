/**
 * Conexao com o Supabase, onde vivem as contas da Teeds.
 *
 * Os dois valores abaixo sao **publicos** por definicao: a chave anonima e
 * feita para ficar no frontend e so permite o que as regras do projeto
 * permitirem. Nada de senha ou chave de servico aqui.
 *
 * Enquanto estiverem vazios, a Teeds abre direto na plataforma, sem exigir
 * conta — util para desenvolver sem derrubar quem ja usa.
 */
export const SUPABASE = {
  url: '',
  anonKey: '',
} as const

export function autenticacaoConfigurada(): boolean {
  return Boolean(SUPABASE.url && SUPABASE.anonKey)
}
