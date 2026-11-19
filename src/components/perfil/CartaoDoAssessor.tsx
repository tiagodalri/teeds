import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { formatarTelefone } from '../../core/teeds/conta'
import {
  codigoDoAssessor, desvincularAssessor, estadoDoAssessor, linkDeConfirmar, linkDoAssessor, numeroBonito, type EstadoDoAssessor,
} from '../../core/teeds/assessorWhatsapp'

/*
  Meu perfil › WhatsApp do Assessor (19/11/2026). Confirma que o telefone do perfil é da pessoa: ela toca em
  "Confirmar no WhatsApp", o WhatsApp abre com "Confirmar GF 123456" para o assessor e ela só aperta enviar.
  Daí em diante o assessor age na conta dela pelo WhatsApp. Só aparece para quem o servidor liberou.
*/

const BALAO = 'M12 3.5a8.5 8.5 0 00-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1012 3.5zM8.6 9.2c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.4.5c-.1.1-.2.3 0 .5.4.7 1.4 1.8 2.6 2.3.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.4 0 .3-.1 1-.6 1.4-.5.4-1.3.6-2.3.3a8.6 8.6 0 01-4.8-4.3c-.5-1-.6-2.1-.4-2.9z'

export function CartaoDoAssessor({ sessao, telefoneSalvo }: { sessao: SessaoTeeds; telefoneSalvo: string }) {
  const [estado, setEstado] = useState<EstadoDoAssessor | null>(null)
  const [codigo, setCodigo] = useState<{ codigo: string; numero: string } | null>(null)
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  const ler = () => estadoDoAssessor(sessao).then((e) => { if (vivo.current) setEstado(e) }).catch(() => { /* sem servidor: o cartão não aparece */ })
  // o telefone salvo mudou: a confirmação pode ter caído
  useEffect(() => { setCodigo(null); void ler() }, [sessao.token, telefoneSalvo]) // eslint-disable-line react-hooks/exhaustive-deps

  // esperando a mensagem: confere a cada 4 s até confirmar
  useEffect(() => {
    if (!codigo || estado?.confirmado) return
    const t = setInterval(() => { void ler() }, 4000)
    return () => clearInterval(t)
  }, [codigo, estado?.confirmado]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estado?.confirmado) setCodigo(null) }, [estado?.confirmado])

  if (!estado?.liberado) return null

  async function gerar() {
    setIndo(true); setErro(null)
    try {
      const r = await codigoDoAssessor(sessao)
      if (r.codigo && r.numeroAssessor) setCodigo({ codigo: r.codigo, numero: r.numeroAssessor })
    } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  async function desligar() {
    setIndo(true); setErro(null)
    try { await desvincularAssessor(sessao); await ler() } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }

  const semTelefone = !estado.telefone
  return (
    <section className="mp-cartao mp-assessor">
      <h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d={BALAO} /></svg>WhatsApp do Assessor</h2>

      {estado.confirmado ? (
        <>
          <div className="mp-atual mp-assessor-ok">
            <span>Número confirmado</span>
            <b>{numeroBonito(estado.numeroConfirmado) || formatarTelefone(estado.telefone ?? '')}</b>
          </div>
          <p className="mp-nota">Pelo WhatsApp, o Assessor GF vê o seu saldo, liga e para as suas I.A. e te avisa como foi cada sessão. Pode mandar áudio.</p>
          <div className="mp-assessor-acoes">
            {estado.numeroAssessor && <a className="mp-btn ouro" href={linkDoAssessor(estado.numeroAssessor)} target="_blank" rel="noreferrer">Conversar com o Assessor</a>}
            <button type="button" className="mp-btn" disabled={indo} onClick={desligar}>Desconectar este número</button>
          </div>
        </>
      ) : semTelefone ? (
        <p className="mp-nota">Coloque o seu WhatsApp com DDD no campo <b>Telefone</b>, em Dados pessoais, e salve. Depois é só confirmar aqui.</p>
      ) : !estado.conectado ? (
        <p className="mp-nota">O WhatsApp do assessor está sendo conectado. Assim que ficar pronto, o botão de confirmar aparece aqui.</p>
      ) : codigo ? (
        <>
          <p className="mp-nota">Toque no botão: o WhatsApp abre com a mensagem pronta para o assessor. É só enviar, do número <b>{formatarTelefone(estado.telefone ?? '')}</b>.</p>
          <div className="mp-atual"><span>Mensagem</span><b>Confirmar GF {codigo.codigo}</b></div>
          <a className="mp-btn ouro" href={linkDeConfirmar(codigo.numero, codigo.codigo)} target="_blank" rel="noreferrer">Abrir o WhatsApp e enviar</a>
          <p className="mp-nota mp-assessor-espera"><i aria-hidden="true" />Esperando a sua mensagem. O código vale 30 minutos.</p>
        </>
      ) : (
        <>
          <p className="mp-nota">Confirme que o número <b>{formatarTelefone(estado.telefone ?? '')}</b> é seu para falar com o Assessor GF pelo WhatsApp: saldo, I.A. e resultados, tudo por mensagem.</p>
          <button type="button" className="mp-btn ouro" disabled={indo} onClick={gerar}>{indo ? 'Gerando…' : 'Confirmar no WhatsApp'}</button>
        </>
      )}
      {erro && <p className="mp-recado erro" role="alert">{erro}</p>}
    </section>
  )
}
