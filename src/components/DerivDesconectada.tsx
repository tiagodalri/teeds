import { afiliadoDaDeriv } from '../core/rotas'
import { DerivLogo, IconeElo } from './DerivMarca'
import { MARCA } from '../marca'
import { useState } from 'react'
import './deriv-desconectada.css'
import { emAppInstalado, voltasPerdidas } from '../core/deriv/auth'

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
/** Celular ou tablet: lá não existe Ctrl+Shift+N, a aba anônima é pelo menu. */
const emToque = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function DerivDesconectada({ acao, entrando, onConectar, compacto = false }: Props) {
  const voltas = voltasPerdidas()
  const voltaPerdida = voltas > 0
  // Na terceira volta perdida seguida, repetir o mesmo botão é o círculo de
  // novo (16/10/2026, cliente da OMNI). Aí o cartão ensina o que funciona.
  const presa = voltas >= 3
  const [copiado, setCopiado] = useState(false)
  const endereco = MARCA.redirectUri
  const copiar = () => {
    navigator.clipboard?.writeText(endereco).then(() => setCopiado(true), () => setCopiado(false))
  }
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
      {/* A plataforma está refazendo a ligação sozinha (ver retomarSePrecisar em useAccount). */}
      {entrando && voltaPerdida && (
        <p className="sem-deriv-janela" role="status">
          Concluindo a ligação com a Deriv… Ela já reconhece você, então a volta
          acontece em segundos, sem pedir a senha de novo.
        </p>
      )}
      {/* Só no computador a Deriv abre em janela à parte (ver startLogin). */}
      {entrando && !voltaPerdida && !emToque() && (
        <p className="sem-deriv-janela" role="status">
          A Deriv abriu em outra janela. Entre por lá. Se depois do login ela
          mostrar o painel da Deriv, é só voltar para esta aba: a {MARCA.prosa}
          termina a conexão sozinha.
        </p>
      )}
      {presa ? (
        <div className="sem-deriv-presa">
          <p>
            A Deriv não devolveu você para a {MARCA.prosa} de novo. Neste navegador a
            página de login dela está se perdendo, o que costuma vir de uma extensão
            (como bloqueador de anúncios) ou de dados antigos da Deriv guardados aqui.
          </p>
          <p><b>O jeito que resolve agora:</b></p>
          <ol>
            <li>
              {emAppInstalado()
                // no app instalado não existe aba anônima: o caminho é o navegador do aparelho
                ? <>Abra o <b>navegador do celular</b> (Safari ou Chrome) em uma <b>aba anônima</b>.</>
                : emToque()
                ? <>Abra uma <b>aba anônima</b> pelo menu do navegador.</>
                : <>Abra uma <b>janela anônima</b>: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> no Windows, ou <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> no Mac.</>}
            </li>
            <li>Entre em <b>{endereco.replace(/^https?:\/\//, '').replace(/\/$/, '')}</b> por ela, com o seu e-mail e senha da {MARCA.prosa}.</li>
            <li>Toque em Conectar e entre na Deriv. Lá ela volta certinho.</li>
          </ol>
          <p className="sem-deriv-nota">
            Para usar nesta janela de sempre: apague os dados do site deriv.com
            (cadeado ao lado do endereço › Cookies e dados do site) ou desligue as
            extensões, e tente de novo.
          </p>
        </div>
      ) : (
        <p>
          {voltaPerdida
            ? <>A Deriv já confirmou a sua conta. Toque abaixo para terminar:
                a conexão acontece aqui mesmo, em segundos.</>
            // no cartão compacto (dentro de um painel) só a frase da tela: a explicação longa fica para o cartão grande
            : compacto ? acao
            : <>{acao} Você está na {MARCA.prosa}, mas o dinheiro fica na corretora — e é
                preciso ligar as duas.</>}
        </p>
      )}
      <div className="sem-deriv-acoes">
        <button className="btn-deriv" onClick={onConectar} disabled={entrando}>
          <IconeElo />
          {entrando
            ? 'Abrindo…'
            : presa
              ? <>Tentar de novo aqui</>
              : voltaPerdida
              ? <>Concluir a ligação com a <DerivLogo altura={13} cor="#fff" /></>
              : <>Conectar minha <DerivLogo altura={13} cor="#fff" /></>}
        </button>
        {presa && (
          <button type="button" className="sem-deriv-copiar" onClick={copiar}>
            {copiado ? 'Endereço copiado' : 'Copiar o endereço'}
          </button>
        )}
        {!voltaPerdida && (
          <a href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>
        )}
      </div>
    </div>
  )
}
