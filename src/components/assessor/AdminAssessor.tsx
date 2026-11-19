import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { desligarZapi, estadoDaZapi, ligarZapi, linkDoAssessor, numeroBonito, type EstadoDaZapi } from '../../core/teeds/assessorWhatsapp'
import './admin-assessor.css'

/*
  Administração › WhatsApp do Assessor (19/11/2026). Cola os três códigos da Z-API: o servidor testa, aponta o
  aviso de "mensagem recebida" para a plataforma e guarda. Os códigos vão e não voltam: a tela nunca os recebe
  de novo. Sem conexão, o QR code aparece aqui para escanear com o celular do assessor.
*/

export function AdminAssessor({ sessao }: { sessao: SessaoTeeds }) {
  const [estado, setEstado] = useState<EstadoDaZapi | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  const [trocar, setTrocar] = useState(false)
  const [campos, setCampos] = useState({ instancia: '', token: '', clientToken: '' })
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  const ler = () => estadoDaZapi(sessao).then((e) => { if (vivo.current) { setEstado(e); setErro(null) } }).catch((e) => vivo.current && setErro((e as Error).message))
  useEffect(() => { void ler() }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  // esperando o QR ser lido (ou o celular voltar): confere a cada 5 s
  useEffect(() => {
    if (!estado?.configurado || estado.conectado) return
    const t = setInterval(() => { void ler() }, 5000)
    return () => clearInterval(t)
  }, [estado?.configurado, estado?.conectado]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setIndo(true); setErro(null)
    try {
      const e = await ligarZapi(sessao, { instancia: campos.instancia.trim(), token: campos.token.trim(), clientToken: campos.clientToken.trim() })
      setEstado(e); setTrocar(false); setCampos({ instancia: '', token: '', clientToken: '' })
    } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  async function desligar() {
    if (!window.confirm('Desligar o WhatsApp do assessor da plataforma? Ele para de responder até você colar os códigos de novo.')) return
    setIndo(true); setErro(null)
    try { setEstado(await desligarZapi(sessao)) } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }

  const pedirCodigos = !estado?.configurado || trocar
  const completo = campos.instancia.trim().length >= 8 && campos.token.trim().length >= 8 && campos.clientToken.trim().length >= 8

  return (
    <div className="aas">
      <section className="aas-cartao">
        <header className="aas-cab">
          <div>
            <span className="aas-rot">Conexão</span>
            <h2>WhatsApp do Assessor GF</h2>
          </div>
          <span className={`aas-selo ${estado?.conectado ? 'ok' : estado?.configurado ? 'espera' : ''}`}>
            {!estado ? 'Conferindo…' : estado.conectado ? 'Conectado' : estado.configurado ? 'Aguardando o celular' : 'Não conectado'}
          </span>
        </header>

        {estado?.conectado && !trocar && (
          <div className="aas-ok">
            <div className="aas-numero"><span>Número do assessor</span><b>{numeroBonito(estado.numero) || 'Lendo…'}</b></div>
            {estado.celularOnline === false && <p className="aas-nota aviso">O celular do assessor está sem internet agora. As mensagens continuam chegando; abra o WhatsApp nele de vez em quando para a conexão não cair.</p>}
            <p className="aas-nota">Os clientes liberados confirmam o número em <b>Meu perfil › WhatsApp do Assessor</b> e já podem conversar. Por enquanto só a sua conta está liberada.</p>
            <div className="aas-acoes">
              {estado.numero && <a className="aas-btn ouro" href={linkDoAssessor(estado.numero)} target="_blank" rel="noreferrer">Abrir a conversa</a>}
              <button type="button" className="aas-btn" onClick={() => setTrocar(true)}>Trocar os códigos</button>
              <button type="button" className="aas-btn perigo" disabled={indo} onClick={desligar}>Desligar</button>
            </div>
          </div>
        )}

        {estado?.configurado && !estado.conectado && !trocar && (
          <div className="aas-qr">
            {estado.qr ? <img src={estado.qr} alt="QR code para conectar o WhatsApp do assessor" /> : <div className="aas-qr-vazio">O QR code aparece aqui em instantes. Se não aparecer, abra a instância no painel da Z-API.</div>}
            <ol>
              <li>No celular do assessor, abra o WhatsApp.</li>
              <li>Toque em <b>Configurações › Aparelhos conectados › Conectar aparelho</b>.</li>
              <li>Aponte a câmera para este QR code. A tela muda sozinha quando conectar.</li>
            </ol>
            <div className="aas-acoes">
              <button type="button" className="aas-btn" onClick={() => setTrocar(true)}>Trocar os códigos</button>
              <button type="button" className="aas-btn perigo" disabled={indo} onClick={desligar}>Desligar</button>
            </div>
          </div>
        )}

        {pedirCodigos && estado && (
          <form className="aas-form" onSubmit={(e) => { e.preventDefault(); if (completo) void salvar() }}>
            <p className="aas-nota">Cole os três códigos da sua instância na Z-API. A plataforma testa, configura o aviso de mensagens sozinha e guarda com segurança: depois de salvos, eles não aparecem de novo.</p>
            <label><span>ID da instância</span><input value={campos.instancia} autoComplete="off" spellCheck={false} placeholder="Em Instâncias Web, na sua instância" onChange={(e) => setCampos({ ...campos, instancia: e.target.value })} /></label>
            <label><span>Token da instância</span><input value={campos.token} autoComplete="off" spellCheck={false} placeholder="Token de integração, ao lado do nome" onChange={(e) => setCampos({ ...campos, token: e.target.value })} /></label>
            <label><span>Token de segurança da conta</span><input value={campos.clientToken} autoComplete="off" spellCheck={false} placeholder="No menu Segurança da Z-API" onChange={(e) => setCampos({ ...campos, clientToken: e.target.value })} /></label>
            <div className="aas-acoes">
              <button type="submit" className="aas-btn ouro" disabled={!completo || indo}>{indo ? 'Testando…' : 'Salvar e conectar'}</button>
              {trocar && <button type="button" className="aas-btn" onClick={() => setTrocar(false)}>Cancelar</button>}
            </div>
          </form>
        )}

        {erro && <p className="aas-erro" role="alert">{erro}</p>}
      </section>

      <section className="aas-cartao aas-como">
        <span className="aas-rot">Como funciona</span>
        <ol>
          <li><b>O cliente chama.</b> Ele manda mensagem para o número do assessor, nunca o contrário.</li>
          <li><b>O número é o login.</b> Só vale o WhatsApp confirmado no perfil: um código enviado do próprio número.</li>
          <li><b>O Assistente responde.</b> O mesmo da plataforma: saldo, ligar e parar I.A., resultados, áudio e foto.</li>
          <li><b>O fim avisa.</b> Quando a I.A. ligada pelo WhatsApp termina, o resultado chega na conversa.</li>
        </ol>
      </section>
    </div>
  )
}
