import { DerivLogo, IconeElo } from './DerivMarca'
import { MARCA } from '../marca'
import { loginPendente } from '../core/deriv/auth'

interface Props {
  /** O que a pessoa estava tentando fazer, para o texto falar disso. */
  acao: string
  entrando: boolean
  onConectar: () => void
  /** Compacto cabe dentro de um painel; solto ocupa a tela. */
  compacto?: boolean
}

/**
 * Estado de "logado na Teeds, sem corretora conectada".
 *
 * A plataforma abre sem a Deriv — gráfico, dígitos e ativos são dados
 * públicos. O que falta é a conta onde o dinheiro fica.
 */
/*
  QUANDO A VOLTA DA CORRETORA SE PERDE (07/10/2026).

  No celular acontece de a pessoa entrar na Deriv e a página não voltar para a
  plataforma — a Deriv guarda o endereço de volta no `sessionStorage` da aba, e
  no celular o login costuma terminar em outra aba (ver `core/deriv/auth.ts`).

  Ela então reabre a plataforma e vê este mesmo convite, idêntico, como se nada
  tivesse acontecido. Era o que fazia o círculo: repetir o passo que já tinha
  sido dado, sem uma palavra de explicação.

  Se existe um login começado nos últimos 15 minutos, dizemos isso. E a boa
  notícia é concreta: a Deriv já reconhece a pessoa, então tocar de novo volta
  direto, sem pedir senha outra vez.
*/
export function DerivDesconectada({ acao, entrando, onConectar, compacto = false }: Props) {
  const voltaPerdida = loginPendente()
  return (
    <div className={`sem-deriv ${compacto ? 'compacto' : ''}`}>
      <div className="sem-deriv-icone" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="34" height="34" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 24 L11 29 a6 6 0 0 1-8-8 l5-5" />
          <path d="M24 16 l5-5 a6 6 0 0 1 8 8 l-5 5" />
          <path d="M15 25 l10-10" strokeDasharray="3 4" />
        </svg>
      </div>
      <b>
        {voltaPerdida
          ? <>Falta um passo para ligar a <span className="deriv-inline"><DerivLogo altura={17} /></span></>
          : <>Conecte a sua conta da <span className="deriv-inline"><DerivLogo altura={17} /></span></>}
      </b>
      <p>
        {voltaPerdida
          ? <>Você entrou na corretora, mas a página não voltou para a {MARCA.prosa}.
              Toque abaixo para concluir: a Deriv já reconhece você e não vai
              pedir a senha de novo.</>
          : <>{acao} Você está na {MARCA.prosa}, mas o dinheiro fica na corretora — e é
              preciso ligar as duas.</>}
      </p>
      <div className="sem-deriv-acoes">
        <button className="btn-deriv" onClick={onConectar} disabled={entrando}>
          <IconeElo />
          {entrando
            ? 'Abrindo…'
            : voltaPerdida
              ? <>Concluir a ligação com a <DerivLogo altura={13} cor="#fff" /></>
              : <>Conectar minha <DerivLogo altura={13} cor="#fff" /></>}
        </button>
        {!voltaPerdida && (
          <a href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>
        )}
      </div>
    </div>
  )
}
