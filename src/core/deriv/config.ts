/**
 * Teeds - configuracao de conexao com a Deriv
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
  /** App ID da Teeds, registrado no dashboard da Deriv. */
  appId: import.meta.env?.VITE_TEEDS_APP_ID ?? '',
} as const

/** Limites publicados pela Deriv, que a Teeds respeita por conta propria. */
export const LIMITS = {
  maxRequestsPerSecond: 100,
  maxSubscriptions: 100,
  maxConnections: 5,
  pingIntervalMs: 30_000,
} as const
