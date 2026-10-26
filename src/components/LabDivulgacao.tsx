import { DivulgacaoPanel } from './DivulgacaoPanel'
import type { MeusLinks } from '../core/teeds/parceiro'
import type { SessaoTeeds } from '../core/teeds/conta'

/** Laboratório: a página Divulgação (?tela=divulgacao; &geral=1 como admin geral). Salvar não grava nada. */
const links = [
  { id: 'a', titulo: 'Comunidade no WhatsApp', url: 'https://chat.whatsapp.com/CPBJlfpTpZy7u2N5VF9Drq', descricao: 'O grupo oficial.', ordem: 30 },
  { id: 'b', titulo: 'Abrir conta na Deriv', url: 'https://t.deriv.link?t=AYTXZHG2MTKA', descricao: 'Para quem ainda não tem conta na corretora.', ordem: 40 },
]
export default function LabDivulgacao() {
  const geral = new URLSearchParams(location.search).has('geral')
  const dados: MeusLinks = geral
    ? { geral: true, parceiros: [
        { codigo: 'n', nome: 'Parceiro Exemplo', email: null, derivAppId: null, appLiberado: false, links },
        { codigo: 'v', nome: 'Outro Parceiro', email: 'parceiro@exemplo.com', derivAppId: 'AbC123exemplo', appLiberado: false, links },
      ] }
    : { geral: false, parceiros: [{ codigo: 'n', nome: 'Parceiro Exemplo', email: null, derivAppId: null, appLiberado: false, links }] }
  const sessao = { token: 'lab', usuario: { id: 'lab' } } as unknown as SessaoTeeds
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}><DivulgacaoPanel sessao={sessao} inicial={dados} /></div>
}
