/**
 * Conexao com a Deriv — o que vale para qualquer marca.
 *
 * Este arquivo nao sabe que marcas existem, e nao pode saber: ele e
 * importado tanto pelo app quanto pelo servidor em Node. O que muda de
 * marca para marca (a app da Deriv, o endereco de retorno, o afiliado)
 * mora em `src/marca/marcas.ts`.
 *
 * Tres superficies de WebSocket, conforme a documentacao oficial:
 *  - public: dados de mercado, sem autenticacao
 *  - demo/real: exigem uma URL com OTP obtida via REST
 */
export const DERIV = {
  restBase: 'https://api.derivws.com',
  ws: {
    public: 'wss://api.derivws.com/trading/v1/options/ws/public',
    demo: 'wss://api.derivws.com/trading/v1/options/ws/demo',
    real: 'wss://api.derivws.com/trading/v1/options/ws/real',
  },
  oauth: {
    authorize: 'https://auth.deriv.com/oauth2/auth',
    token: 'https://auth.deriv.com/oauth2/token',
  },
  /** Escopos concedidos ao app. */
  scopes: ['trade', 'account_manage', 'application_read'],
} as const

/**
 * Ativos disponíveis. `R_75` é o Volatility 75 padrão usado pelos robôs;
 * os códigos `1HZ` permanecem disponíveis no terminal manual.
 */
export const ATIVOS_PERMITIDOS = [
  'R_75',
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V',
  '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
  // Forex e metais (16/10/2026): SÓ no Manual, só Subir/Descer. Os sete
  // pares do dólar mais ouro e prata, escolha do Tiago para começar. A Deriv
  // pede no mínimo 15 min nos pares e 5 min nos metais, não tem dígitos, e o
  // mercado fecha no fim de semana. Para pôr mais pares, é só somar aqui.
  'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxUSDCHF', 'frxNZDUSD',
  'frxXAUUSD', 'frxXAGUSD',
] as const

/**
 * Os índices de volatilidade "normais" (um tick a cada 2 s), na ordem do
 * menor para o maior. Só entram no Manual das marcas com `indicesCompletos`
 * (GlobalFly, 19/10/2026); os robôs seguem no ATIVO_DOS_ROBOS.
 */
export const INDICES_DE_VOLATILIDADE = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'] as const

/** Índice sintético (os únicos com dígitos e com robôs). Forex e metais não são. */
export const ehSintetico = (s: { market?: string } | null | undefined) => s?.market === 'synthetic_index'

/**
 * O ativo dos robos — fixo, decidido pela casa (14/09: Volatility 75 padrão).
 * A pessoa NAO escolhe onde o robo opera: menos uma decisao para errar, e o
 * comportamento dos robos fica comparavel entre todos os clientes.
 * Para mudar a entrada da casa, e so trocar aqui.
 */
export const ATIVO_DOS_ROBOS = 'R_75'

/** Limites publicados pela Deriv, que a Teeds respeita por conta propria. */
export const LIMITS = {
  maxRequestsPerSecond: 100,
  maxSubscriptions: 100,
  maxConnections: 5,
  pingIntervalMs: 30_000,
} as const
