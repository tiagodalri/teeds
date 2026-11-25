/** A ficha completa do cliente na lateral do chat do Assessor (25/11/2026). Igual a servidor/src/ficha-cliente.ts. */
export interface FichaCompleta {
  pessoa: {
    userId: string; nome: string | null; email: string | null; telefone: string | null; cidade: string | null; uf: string | null
    nascimento: string | null; fotoPlataforma: string | null; parceiro: string | null; parceiroNome: string | null
    criadoEm: string | null; vistoEm: string | null; online: boolean; status: string | null; validade: string | null
    subplano: string; whatsappConfirmadoEm: string | null
  }
  dinheiro: {
    saldoReal: number | null; saldoDemo: number | null; contaReal: string | null; contaDemo: string | null; saldoLidoEm: string | null
    depositos: number; saques: number; qtdDepositos: number; qtdSaques: number; ultimoDeposito: string | null
    markupReal: number; markupMes: number
  }
  resultado: {
    real: LadoDoResultado; demo: LadoDoResultado
    porIa: Array<{ nome: string; real: number; demo: number; sessoes: number }>
    dias30: Array<{ dia: string; real: number; demo: number }>
    primeiraOperacao: string | null; ultimaOperacao: string | null
  }
  agora: Array<{ ia: string; demo: boolean; resultado: number; operacoes: number; desde: string }>
  aulas: { total: number; vistas: number; concluidas: number; minutos: number; ultima: string | null; ultimaTitulo: string | null; faltam: string[] }
  lives: { plataforma: number; plataformaTotal: number; minutos: number; externasOnline: number; externasTotal: number; ultima: string | null }
  acessos: { total: number; diasAtivos: number; horas: number; dispositivo: string | null; ultimos7: number }
  compras: Array<{ quando: string; produto: string; valor: number | null; origem: string; situacao: string }>
  produtos: Array<{ nome: string; desde: string | null; ate: string | null; ativo: boolean; origem: string | null }>
  faturas: Array<{ mes: string; valor: number; situacao: string }>
  /** 25/11/2026 (podem faltar num servidor antigo) */
  movimentos?: Array<{ quando: string; tipo: 'deposito' | 'saque'; valor: number; saldoDepois: number | null; conta: string | null }>
  compartilhamento?: {
    equipe: boolean; plano: string; percentual: number; cotacao: number | null
    meses: Array<{ mes: string; fechado: boolean; resultado: number; operacoes: number; valorUsd: number; valorBrl: number | null; planoNoMes: string; percentualNoMes: number
      fatura: { numero: number | null; situacao: string; valorBrl: number | null; valorUsd: number | null; vencimento: string | null; pagaEm: string | null } | null }>
    emAberto: number
  }
  suporte: { conversas: number; abertas: number; ultima: string | null }
  assessor: { mensagens: number; desde: string | null; iasLigadas: number }
  linhaDoTempo: Array<{ quando: string; tipo: string; texto: string }>
}
export interface LadoDoResultado { total: number; ia: number; manual: number; operacoes: number; ganhas: number; perdidas: number; sessoes: number }
export interface FichaDoContato { ficha: FichaCompleta | null; fotoWhatsapp: string | null; talvez: Array<{ nome: string | null; email: string | null }> }
