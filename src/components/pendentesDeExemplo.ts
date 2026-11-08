/*
  Só o laboratório (?tela=pendentes): cadastros de mentira no tamanho do lançamento (~640), com parceiro,
  questionário, temperatura, produtos e recadastro variados, para testar os filtros sem ler o banco.
  Os nomes e contatos são inventados.
*/
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Tatiana', 'Vinícius']
const SOBRENOMES = ['Almeida', 'Barbosa', 'Costa', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Henriques', 'Lima', 'Moraes', 'Nogueira', 'Prado', 'Queiroz', 'Rocha', 'Teixeira']
const PRODUTOS = ['stark', 'n_compartilhamento', 'fast', 'n_sala_b3', 'b3', 'outro: Mentoria antiga']
const TEMPERATURAS = ['quente', 'morno', 'frio', null]

// sempre os mesmos números, para a tela não mudar a cada recarga
const aleatorio = (i: number, k: number) => { const x = Math.sin(i * 9301 + k * 49297) * 233280; return x - Math.floor(x) }

export function pendentesDeExemplo(status: string) {
  const quantos = status === 'pendente' ? 639 : status === 'processando' ? 1 : status === 'aprovado' ? 37 : 7
  const agora = Date.now()
  return Array.from({ length: quantos }, (_, i) => {
    const nome = `${NOMES[i % NOMES.length]} ${SOBRENOMES[Math.floor(aleatorio(i, 1) * SOBRENOMES.length)]}`
    const r = aleatorio(i, 2)
    const parceiro = r < 0.49 ? 'n' : r < 0.97 ? 'v' : r < 0.975 ? 'd' : null
    // mais gente nos últimos dias, como no lançamento
    const horas = Math.floor(Math.pow(aleatorio(i, 3), 2.2) * 24 * 9)
    const quando = new Date(agora - horas * 3600e3 - i * 1000).toISOString()
    return {
      id: `${status}-${i}`, nome, email: `${nome.toLowerCase().replace(/[^a-z]+/g, '.')}.${i}@exemplo.com`, telefone: `(11) 9${String(80000000 + i * 37).slice(0, 8)}`,
      status, criado_em: quando, ultima_inscricao_em: quando, email_enviado_em: status === 'aprovado' ? quando : null,
      recadastro: aleatorio(i, 4) < 0.08, parceiro,
    }
  }).sort((a, b) => b.ultima_inscricao_em.localeCompare(a.ultima_inscricao_em))
}

export function respostasDeExemplo(lista: Array<{ email: string }>) {
  const m = new Map<string, { exCliente: boolean | null; produtos: string[]; em: string | null; tempo: number | null; temperatura: string | null }>()
  lista.forEach((p, i) => {
    const r = aleatorio(i, 5)
    if (r < 0.13) return // não respondeu
    const ex = r < 0.49
    const produtos = ex ? PRODUTOS.filter((_, k) => aleatorio(i, 10 + k) < [0.3, 0.2, 0.15, 0.12, 0.08, 0.15][k]) : []
    m.set(p.email.toLowerCase(), {
      exCliente: ex, produtos, em: new Date(Date.now() - i * 60e3).toISOString(),
      tempo: Math.round(20 + aleatorio(i, 6) * 400), temperatura: TEMPERATURAS[Math.floor(aleatorio(i, 7) * TEMPERATURAS.length)],
    })
  })
  return m
}
