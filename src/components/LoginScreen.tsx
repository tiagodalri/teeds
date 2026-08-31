import { AFILIADO } from '../core/deriv/config'
import { Brand } from './Brand'

interface Props {
  entrando: boolean
  onEntrar: () => void
  erro?: string | null
}

/** Um argumento por linha, do que a plataforma faz de concreto. */
const PILARES = [
  {
    titulo: 'Robôs que operam por você',
    texto: 'Ligue o AG7, defina os freios e acompanhe cada entrada ao vivo — entrada, dígito, resultado, tudo na tela.',
  },
  {
    titulo: 'Vários ao mesmo tempo',
    texto: 'Rode até quatro robôs lado a lado, cada um no seu índice e com os seus próprios limites.',
  },
  {
    titulo: 'Sua conta, seu dinheiro',
    texto: 'A Teeds opera pela API da Deriv com a sua própria conta. Comece na conta demo, com dinheiro fictício.',
  },
]

export function LoginScreen({ entrando, onEntrar, erro }: Props) {
  return (
    <div className="entrada">
      <div className="entrada-caixa">
        <div className="entrada-marca">
          <Brand tamanho={44} />
        </div>

        <h1>Opere na Deriv com robôs seus.</h1>
        <p className="entrada-linha">
          Plataforma de operações automatizadas em índices sintéticos.
          Entre com a sua conta da Deriv — a Teeds nunca guarda a sua senha.
        </p>

        <div className="entrada-botoes">
          <button className="entrada-btn" onClick={onEntrar} disabled={entrando}>
            {entrando ? 'abrindo a Deriv…' : 'Entrar com a Deriv'}
          </button>
          <a className="entrada-btn secundario" href={AFILIADO} target="_blank" rel="noopener noreferrer">
            Ainda não tenho conta
          </a>
        </div>

        <p className="entrada-nota">
          Abrir conta é grátis e leva alguns minutos. Depois é só voltar aqui e entrar.
        </p>

        {erro && <div className="entrada-erro">{erro}</div>}

        <ul className="entrada-pilares">
          {PILARES.map((p) => (
            <li key={p.titulo}>
              <b>{p.titulo}</b>
              <span>{p.texto}</span>
            </li>
          ))}
        </ul>

        <p className="entrada-rodape">
          Negociar envolve risco de perda. Opere só o que você pode perder,
          e comece pela conta demo.
        </p>
      </div>
    </div>
  )
}
