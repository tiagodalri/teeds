/**
 * A tela de quem já entrou mas ainda não foi liberado.
 *
 * Desde 30/09/2026 a conta de acesso nasce no cadastro: a senha provisória
 * precisa chegar por e-mail na hora, e para isso a conta tem de existir. A
 * consequência é que a pessoa consegue entrar antes de alguém aprovar — e
 * o que ela encontra aqui é esta tela, dizendo com todas as letras o que
 * falta e o que vai acontecer.
 *
 * Quem decide se é aqui ou lá dentro é o banco: a ficha nasce 'pendente' e
 * só a aprovação a torna 'ativo'. Um gatilho impede a própria pessoa de
 * mexer nesse campo, então esconder o menu não é a tranca — é só a cortesia
 * de não mostrar portas que não abrem.
 */
import { useState } from 'react'
import { Brand } from './Brand'
import { DerivLogo, IconeSaida } from './DerivMarca'
import { MARCA } from '../marca'

export function CadastroEmAnalise({ email, nome, aoConferir, aoSair }: {
  email: string
  nome?: string | null
  /** Relê a situação no banco. Devolve true quando já foi liberado. */
  aoConferir: () => Promise<boolean>
  aoSair: () => void
}) {
  const [conferindo, setConferindo] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0]

  async function conferir() {
    if (conferindo) return
    setConferindo(true); setRecado(null)
    try {
      const liberado = await aoConferir()
      if (!liberado) setRecado('Ainda em análise. Assim que for aprovado, você recebe o e-mail de liberação.')
    } finally { setConferindo(false) }
  }

  return (
    <div className="entrada" data-modo="espera">
      <div className="entrada-aurora" aria-hidden="true" />
      <div className="entrada-grade" aria-hidden="true" />

      <div className="entrada-caixa">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={46} /></div>
          <div className="entrada-opera">
            <span>opera com</span>
            <DerivLogo altura={15} />
          </div>
        </header>

        <div className="entrada-cabecalho">
          <h1>{primeiroNome ? `${primeiroNome}, seu cadastro está em análise.` : 'Seu cadastro está em análise.'}</h1>
          <p className="entrada-linha">
            Recebemos o seu cadastro na {MARCA.prosa} e a nossa equipe está conferindo.
            Assim que for aprovado, chega um e-mail em <b>{email}</b> avisando que o acesso está liberado.
          </p>
        </div>

        <ol className="espera-passos">
          <li className="feito"><i aria-hidden>✓</i><span><b>Cadastro recebido</b><small>Seus dados chegaram e a sua senha de acesso já foi enviada por e-mail.</small></span></li>
          <li className="agora"><i aria-hidden>●</i><span><b>Em análise</b><small>Nossa equipe confere os cadastros um a um. É a etapa em que você está.</small></span></li>
          <li><i aria-hidden>○</i><span><b>Acesso liberado</b><small>Você recebe o e-mail de aprovação, cria a sua própria senha e a plataforma abre inteira, com os robôs.</small></span></li>
        </ol>

        {recado && <p className="entrada-mini" role="status">{recado}</p>}

        <button className="entrada-btn" type="button" onClick={() => void conferir()} disabled={conferindo}>
          {conferindo ? 'conferindo…' : 'Já fui aprovado — conferir agora'}
        </button>

        <p className="entrada-mini">
          Nada a fazer por enquanto. Se quiser adiantar, já pode abrir a sua conta na corretora —
          ela é sua, e é lá que o seu dinheiro fica.
        </p>

        <div className="entrada-corretora">
          <div className="corretora-topo">
            <DerivLogo altura={22} />
            <span className="corretora-selo">corretora oficial</span>
          </div>
          <b>Abra sua conta gratuitamente.</b>
          <p>
            Seu dinheiro fica na corretora Deriv. Conecte sua conta à {MARCA.prosa}
            {' '}para operar pela plataforma.
          </p>
          <a className="btn-deriv" href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">
            <span>Abrir conta na Deriv</span>
            <IconeSaida />
          </a>
        </div>

        <div className="entrada-troca">
          <button type="button" onClick={aoSair}>Sair desta conta</button>
        </div>
      </div>
    </div>
  )
}
