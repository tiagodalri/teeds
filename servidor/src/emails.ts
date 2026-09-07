/**
 * Os e-mails de acesso — um desenho, duas marcas.
 *
 * Quem se cadastra na OMNI não pode receber um e-mail da Teeds. Parece
 * detalhe, mas é o primeiro contato: um e-mail com marca desconhecida
 * pedindo para clicar num link é exatamente o que ensinam a não clicar.
 *
 * Por que UM molde e não dois arquivos: dois arquivos começam iguais e
 * terminam diferentes. Alguém conserta um texto num, esquece no outro, e
 * seis meses depois a OMNI está pedindo confirmação com palavras que a
 * Teeds já corrigiu. Aqui a estrutura é uma só e a identidade vem da tabela
 * de marcas — trocar a cor da OMNI é trocar uma linha, e uma marca nova no
 * futuro nasce pronta.
 *
 * As regras do meio: e-mail não tem CSS externo nem folha de estilo, cada
 * programa recorta o que não entende, e o Outlook ainda desenha com um
 * motor de 2007. Por isso tudo aqui é tabela e estilo colado no elemento —
 * feio de ler, mas é o que chega inteiro na caixa de entrada.
 */
import type { Marca } from '../../src/marca/marcas'

export type TipoDeEmail = 'confirmar' | 'magico' | 'senha' | 'convite' | 'trocar-email'

export interface EmailPronto {
  assunto: string
  html: string
  /** A versão em texto puro. Vai junto: quem só aceita texto ainda lê, e
   *  um e-mail sem ela tem mais chance de cair no lixo eletrônico. */
  texto: string
}

interface Conteudo {
  assunto: string
  titulo: string
  /** O trecho que aparece na lista da caixa de entrada, antes de abrir. */
  espia: string
  corpo: string
  botao: string
  aviso: string
}

/** O que cada e-mail diz. Só texto — a aparência é a mesma para todos. */
function conteudo(tipo: TipoDeEmail, prosa: string): Conteudo {
  switch (tipo) {
    case 'confirmar':
      return {
        assunto: `Confirme o seu e-mail · ${prosa}`,
        titulo: 'Confirme o seu e-mail',
        espia: `Falta um clique para a sua conta ${prosa} ficar pronta.`,
        corpo: `Sua conta na ${prosa} foi criada. Confirme este endereço para poder entrar — depois é só conectar a sua conta da Deriv e começar.`,
        botao: 'Confirmar meu e-mail',
        aviso: 'Se não foi você que criou esta conta, pode ignorar este e-mail. Nada acontece sem essa confirmação.',
      }
    case 'magico':
      return {
        assunto: `Seu link de entrada · ${prosa}`,
        titulo: 'Entre sem digitar senha',
        espia: `Seu link de entrada na ${prosa} está aqui.`,
        corpo: `Use o botão abaixo para entrar na ${prosa}. O link vale por uma hora e funciona uma vez só.`,
        botao: `Entrar na ${prosa}`,
        aviso: 'Se você não pediu este link, pode ignorar. Ele não dá acesso a mais nada.',
      }
    case 'senha':
      return {
        assunto: `Redefinir a sua senha · ${prosa}`,
        titulo: 'Escolha uma nova senha',
        espia: 'Um link para você criar uma senha nova.',
        corpo: `Alguém pediu para redefinir a senha desta conta na ${prosa}. Se foi você, use o botão abaixo. O link vale por uma hora.`,
        botao: 'Definir nova senha',
        aviso: 'Se não foi você, ignore este e-mail — a sua senha atual continua valendo.',
      }
    case 'convite':
      return {
        assunto: `Seu acesso à ${prosa} está pronto`,
        titulo: 'Você foi convidado',
        espia: `Criaram um acesso para você na ${prosa}.`,
        corpo: `Criaram um acesso para você na ${prosa}. Use o botão abaixo para definir a sua senha e entrar pela primeira vez.`,
        botao: 'Ativar meu acesso',
        aviso: 'Se você não esperava este convite, pode ignorar este e-mail.',
      }
    case 'trocar-email':
      return {
        assunto: `Confirme o seu novo e-mail · ${prosa}`,
        titulo: 'Confirme o novo endereço',
        espia: 'Confirme para a troca de e-mail valer.',
        corpo: `Você pediu para trocar o e-mail da sua conta na ${prosa}. Confirme este endereço para a troca valer.`,
        botao: 'Confirmar novo e-mail',
        aviso: 'Se não foi você, ignore este e-mail — o endereço antigo continua valendo.',
      }
  }
}

/** O emblema precisa de endereço absoluto: e-mail não tem "pasta do site". */
function emblemaDe(marca: Marca): string {
  return new URL(marca.emblema, marca.redirectUri).toString()
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Impede que um texto nosso quebre o HTML se um dia virar dado de fora. */
function seguro(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarEmail(marca: Marca, tipo: TipoDeEmail, url: string): EmailPronto {
  const c = conteudo(tipo, marca.prosa)
  const e = marca.email
  const endereco = seguro(url)

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${seguro(c.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${e.fundo};">

<!-- o trecho que aparece na caixa de entrada, antes de abrir -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${seguro(c.espia)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${e.fundo};padding:32px 16px;">
  <tr><td align="center">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;
                  box-shadow:0 1px 3px rgba(16,24,40,.08);">

      <!-- faixa da marca -->
      <tr>
        <td align="center" bgcolor="${e.faixa}" style="background:${e.faixa};padding:30px 32px 26px;">
          ${e.chapaDoEmblema ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
            <td bgcolor="${e.chapaDoEmblema}" style="background:${e.chapaDoEmblema};border-radius:16px;padding:11px;">
              <img src="${emblemaDe(marca)}" width="46" height="46" alt="${seguro(marca.prosa)}"
                   style="display:block;border:0;">
            </td></tr></table>` : `<img src="${emblemaDe(marca)}" width="54" height="54" alt="${seguro(marca.prosa)}"
               style="display:block;border:0;margin:0 auto;">`}
          <div style="font-family:${e.fonteDoLetreiro};font-size:17px;letter-spacing:.26em;
                      color:${e.letreiro};margin-top:14px;padding-left:.26em;">${seguro(marca.nome)}</div>
        </td>
      </tr>

      <!-- conteudo -->
      <tr>
        <td style="padding:30px 32px 6px;font-family:${SANS};">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:650;
                     letter-spacing:-.02em;color:#1a2233;">${seguro(c.titulo)}</h1>
          <p style="margin:0 0 22px;font-size:14.5px;line-height:1.65;color:#4a5568;">${seguro(c.corpo)}</p>
        </td>
      </tr>

      <!-- botao -->
      <tr>
        <td style="padding:0 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td align="center" bgcolor="${e.botao}" style="background:${e.botao};border-radius:11px;">
                <a href="${endereco}"
                   style="display:block;padding:15px 24px;font-family:${SANS};font-size:15px;
                          font-weight:600;color:${e.tintaDoBotao};text-decoration:none;">${seguro(c.botao)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- link avulso, para quando o botao nao funciona -->
      <tr>
        <td style="padding:16px 32px 0;font-family:${SANS};">
          <p style="margin:0;font-size:11.5px;line-height:1.6;color:#7a8699;">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br>
            <span style="color:${e.faixa};word-break:break-all;">${endereco}</span>
          </p>
        </td>
      </tr>

      <!-- aviso -->
      <tr>
        <td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${e.fundo};border-radius:10px;">
            <tr>
              <td style="padding:13px 15px;font-family:${SANS};font-size:12.5px;
                         line-height:1.6;color:#4a5568;">${seguro(c.aviso)}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- rodape -->
      <tr>
        <td style="padding:26px 32px 30px;font-family:${SANS};">
          <div style="border-top:1px solid #e8ecf2;padding-top:20px;">
            <p style="margin:0;font-size:11px;line-height:1.6;color:#7a8699;">${seguro(e.rodape)}</p>
          </div>
        </td>
      </tr>
    </table>

    <div style="max-width:520px;margin:16px auto 0;font-family:${SANS};
                font-size:11px;line-height:1.6;color:#8b95a6;text-align:center;">
      Você recebeu este e-mail porque alguém usou este endereço na ${seguro(marca.prosa)}.
    </div>

  </td></tr>
</table>
</body>
</html>`

  const texto = [
    marca.nome,
    '',
    c.titulo,
    '',
    c.corpo,
    '',
    url,
    '',
    c.aviso,
    '',
    '—',
    e.rodape,
  ].join('\n')

  return { assunto: c.assunto, html, texto }
}
