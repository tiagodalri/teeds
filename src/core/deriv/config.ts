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
 * Ativos habilitados. Por enquanto so os indices de volatilidade
 * de 1 segundo — sao os que operam 24 horas e tem tick a cada segundo.
 */
export const ATIVOS_PERMITIDOS = [
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V',
  '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
] as const

/**
 * O ativo dos robos — fixo, decidido pela casa (02/09: Volatility 75 (1s)).
 * A pessoa NAO escolhe onde o robo opera: menos uma decisao para errar, e o
 * comportamento dos robos fica comparavel entre todos os clientes.
 * Para mudar a entrada da casa, e so trocar aqui.
 */
export const ATIVO_DOS_ROBOS = '1HZ75V'

/** Limites publicados pela Deriv, que a Teeds respeita por conta propria. */
export const LIMITS = {
  maxRequestsPerSecond: 100,
  maxSubscriptions: 100,
  maxConnections: 5,
  pingIntervalMs: 30_000,
} as const
