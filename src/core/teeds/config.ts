/**
 * Conexao com o Supabase, onde vivem as contas da Teeds.
 *
 * Os dois valores abaixo sao **publicos** por definicao: a chave anonima e
 * feita para ficar no frontend e so permite o que as regras (RLS) do projeto
 * permitirem. Nada de senha nem de chave `service_role` aqui — essa nunca
 * sai do painel do Supabase.
 *
 * Enquanto estiverem vazios, a Teeds abre direto na plataforma, sem exigir
 * conta — util para desenvolver sem derrubar quem ja usa.
 */
export const SUPABASE = {
  url: 'https://wonxykovfvfnuhzpqsle.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvbnh5a292ZnZmbnVoenBxc2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDU3MTgsImV4cCI6MjEwMzc4MTcxOH0' +
    '.5n9ePaGLNMOHOzitZULblGCsTj3ORJDgsWvc17V_0PU',
} as const

export function autenticacaoConfigurada(): boolean {
  return Boolean(SUPABASE.url && SUPABASE.anonKey)
}

/**
 * O servidor da Teeds — onde os robôs realmente operam.
 *
 * A tela é o visor; quem compra e vende é esta máquina, em Nova York. Por
 * isso o robô continua rodando com o notebook fechado, e por isso toda
 * operação aparece no histórico mesmo quando ninguém está olhando.
 */
export const SERVIDOR = {
  url: 'https://198-211-96-238.nip.io',
} as const
