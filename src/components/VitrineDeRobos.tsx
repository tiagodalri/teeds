import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IDENTIDADES, type Identidade } from '../core/deriv/branding'
import { descrever, digitosQueGanham, parametrosPadrao, type ParametrosDoRobo } from '../core/deriv/parametros'
import { recarregarCatalogo, useCatalogoCompleto, useCatalogoFalhou, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { MARCA } from '../marca'
import { pedirModeloDaVitrine } from './RobotSetup'
import './vitrine-robos.css'
import { LogotipoDaIA, temLogotipo } from './marca/LogotipoDaIA'
import { irParaTela, ROBOS_A_VENDA, useRobosBloqueados } from '../core/teeds/robosLiberados'

/**
 * A vitrine da tela Robôs (19/10/2026, GlobalFly): quem ainda não tem robô
 * ligado vê os modelos de cara, um cartão por robô, em vez de um quadro vazio
 * com um botão. O cartão leva a foto da aeronave que deu nome ao robô e a
 * regra de verdade da estratégia (a mesma do catálogo).
 *
 * "Por que <nome>?" (e "Ver detalhes da I.A.") abre um modal: a história da
 * aeronave e, embaixo, os detalhes da inteligência artificial (plano de voo,
 * onde ganha, quando entra, a recuperação, os perfis). O cartão fica só com o
 * resumo (19/10/2026). Os números vêm da regra viva (o painel pode mudar a
 * regra sem mexer aqui).
 *
 * "Iniciar operações" abre o preparo já no robô. Nenhum cartão liga nada: as
 * operações só começam depois da confirmação, no fim do preparo.
 */

function IconePlay() {
  return (
    <svg className="vr-play" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="11" />
      <path d="M10 8.2v7.6l6-3.8z" />
    </svg>
  )
}

/** O Göreme/Raptor troca de lado depois de uma perda: recupera nos dígitos altos (strategies.ts). */
const RECUPERA_EM: Record<string, number[]> = { goreme: [7, 8, 9] }

const lista = (ds: number[]) => ds.length > 1 ? `${ds.slice(0, -1).join(', ')} e ${ds[ds.length - 1]}` : String(ds[0] ?? '')

/**
 * "Na prática" em uma olhada (19/10/2026, pedido do Tiago: a frase era
 * longa e não dizia de cara com que dígito o robô ganha). Os dez dígitos,
 * com os que ganham acesos, e duas linhas: em quantos ganha e quando entra.
 * Tudo sai da regra viva: se o painel mudar a barreira ou o loss virtual,
 * o cartão muda junto. A frase completa continua para o leitor de tela.
 */
type Etapa = { titulo: string; texto: ReactNode }

const faixa = (ds: number[]) => (ds.length > 3 ? `${ds[0]} a ${ds[ds.length - 1]}` : lista(ds))
const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * O plano de voo da I.A. (19/10/2026, pedido do Victor e do Tiago: os selos
 * eram iguais para todos; cada robô precisa contar o próprio jeito de operar).
 * Três etapas por robô, todas verdadeiras e tiradas da regra viva: faixa de
 * dígitos, loss virtual, se segue a sequência, troca de lado (Raptor) e a
 * margem da recuperação. "A I.A." é o nome do produto no menu; nada aqui diz
 * que ela aprende, prevê ou acerta, porque não é o que o motor faz.
 */
function planoDeVoo(id: string, p: ParametrosDoRobo): Etapa[] {
  const ganham = digitosQueGanham(p.contrato)
  const fora = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !ganham.includes(d))
  const n = p.entrada.lossVirtual
  const margem = p.recuperacao.modos.conservador.margem
  const tabela = p.recuperacao.escada.tipo === 'tabela'
  const recalcula: Etapa = tabela
    ? { titulo: 'Recupera em degraus', texto: <>Se uma entrada não vem, a próxima segue a <b>escada definida</b>, degrau a degrau, buscando fechar a sequência. Se ela chegar ao seu limite de perda, a sessão para.</> }
    : { titulo: 'Recalcula na hora', texto: <>Se uma entrada não vem, a I.A. calcula a próxima pelo <b>pagamento real do contrato</b>, buscando cobrir a anterior{margem >= 0.08 ? <> com cerca de <b>{pct(margem)} sobre a entrada</b></> : ''}. Se a sequência chegar ao seu limite de perda, a sessão para.</> }

  if (RECUPERA_EM[id]) {
    const alvo = RECUPERA_EM[id]
    return [
      { titulo: 'Cobre quase o painel', texto: <>Entra em todo tick, com <b>só o {lista(fora)} contra</b>.</> },
      { titulo: 'Troca de lado na perda', texto: <>Se o {lista(fora)} aparece, a I.A. muda de contrato e mira o <b>{lista(alvo)}</b>, que pagam bem mais quando a operação é positiva.</> },
      { titulo: 'Volta à rota', texto: <>Recuperou, retorna para a cobertura ampla e segue operando.</> },
    ]
  }
  if (n > 0) {
    return [
      { titulo: 'Observa antes de entrar', texto: <>A I.A. lê cada dígito e conta quantos saem <b>fora da faixa</b>, de {faixa(fora)}.</> },
      { titulo: `Espera ${n === 1 ? '1 sinal' : `${n} sinais seguidos`}`, texto: <>Só abre a operação depois de <b>{n === 1 ? '1 dígito' : `${n} dígitos seguidos`}</b> fora da faixa, mirando o <b>{lista(ganham)}</b>.</> },
      p.entrada.sequenciaSemAnalise
        ? { titulo: 'Segue até fechar', texto: <>Entrou, acompanha a sequência até o fim, sem esperar de novo a cada entrada.</> }
        : { titulo: 'Confere a cada entrada', texto: <>Depois de cada operação, volta a esperar o sinal antes de entrar outra vez.</> },
    ]
  }
  const ponta = ganham[0] === 0 ? 'a parte baixa' : ganham[ganham.length - 1] === 9 ? 'a parte alta' : 'o meio'
  return [
    { titulo: 'Decola na hora', texto: <>Sem esperar sinal: entra direto e ocupa <b>{ponta} do painel</b>, de {faixa(ganham)}.</> },
    { titulo: 'Decide em 1 tick', texto: <>Cada operação se resolve <b>no dígito seguinte</b>; {fora.length === 1 ? `só o ${fora[0]} fica contra` : `os dígitos de ${faixa(fora)} ficam contra`}.</> },
    recalcula,
  ]
}

/** No cartão, só a rota: os três passos em uma linha, sem explicação (19/10/2026, pedido do Tiago). */
function RotaResumida({ id, parametros, aoAbrir }: { id: string; parametros: ParametrosDoRobo; aoAbrir: () => void }) {
  return (
    <div className="vr-plano">
      <span className="vr-pratica-rot"><i className="vr-ao-vivo" aria-hidden="true" />Plano de voo da I.A.</span>
      <ol className="vr-rota">
        {planoDeVoo(id, parametros).map((e, k) => <li key={k}>{e.titulo}</li>)}
      </ol>
      <button type="button" className="vr-detalhes" onClick={aoAbrir}>Ver detalhes da I.A. <span aria-hidden="true">›</span></button>
    </div>
  )
}

function NaPratica({ id, parametros, frase, aoAbrir }: { id: string; parametros: ParametrosDoRobo; frase: string; aoAbrir: () => void }) {
  const ganham = digitosQueGanham(parametros.contrato)
  return (
    <div className="vr-pratica" role="group" aria-label={`Na prática: ${frase}`}>
      <b className="vr-pratica-rot" aria-hidden="true">Na prática</b>
      <div className="vr-digitos" aria-hidden="true">
        {Array.from({ length: 10 }, (_, d) => <span key={d} className={ganham.includes(d) ? 'ganha' : ''}>{d}</span>)}
      </div>
      <ul className="vr-fatos" aria-hidden="true">
        <li><i className="ganha" /><span>Ganha com <b>{ganham.length === 10 ? 'qualquer dígito' : faixa(ganham)}</b></span><em>{ganham.length} de 10</em></li>
      </ul>
      <RotaResumida id={id} parametros={parametros} aoAbrir={aoAbrir} />
    </div>
  )
}

/* ================================================================ o modal */

/**
 * Os detalhes da I.A., em linguagem de aluno (19/10/2026). Tudo verdadeiro e
 * tirado da regra viva; o tom é o nosso: o que a estratégia faz por você e o
 * que continua nas suas mãos. Nada de "aprende", "prevê" ou "garante".
 */
function detalhesDaIA(id: string, p: ParametrosDoRobo): Array<{ titulo: string; texto: ReactNode }> {
  const ganham = digitosQueGanham(p.contrato)
  const fora = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !ganham.includes(d))
  const n = p.entrada.lossVirtual
  const margem = p.recuperacao.modos.conservador.margem
  const agressivo = p.recuperacao.modos.agressivo
  const lista1: Array<{ titulo: string; texto: ReactNode }> = [
    { titulo: 'Onde ela ganha', texto: <>A cada operação, a I.A. mira o <b>último dígito</b> do preço do índice. Ela ganha se esse dígito for <b>{faixa(ganham)}</b>: {ganham.length} dos 10 possíveis.</> },
    n > 0
      ? { titulo: 'Quando ela entra', texto: <>A I.A. acompanha o mercado ao vivo e espera o sinal da estratégia: só entra depois de ver <b>{n === 1 ? '1 dígito' : `${n} dígitos seguidos`}</b> fora da faixa (de {faixa(fora)}). É o que o mercado chama de <b>loss virtual</b>: perdas que teriam acontecido se ela já estivesse operando, mas que não custaram nada, porque ela só observava. Fechou a sequência, ela entra{p.entrada.sequenciaSemAnalise ? ' e acompanha até o fim, sem esperar de novo a cada entrada' : ', e volta a observar antes de cada nova entrada'}.</> }
      : { titulo: 'Quando ela entra', texto: <>Sem esperar sinal. Como a faixa dela já cobre <b>{ganham.length} dos 10 dígitos</b>, a I.A. entra direto, a cada tick, enquanto a sessão estiver ligada.</> },
    { titulo: 'Quanto dura cada operação', texto: <><b>Um tick.</b> A operação se resolve no preço seguinte, em cerca de 2 segundos, e a I.A. já fica pronta para a próxima.</> },
    RECUPERA_EM[id]
      ? { titulo: 'Se uma entrada não vem', texto: <>A I.A. <b>troca de lado</b>: muda de contrato e mira o <b>{lista(RECUPERA_EM[id])}</b>, que pagam bem mais quando a operação é positiva, buscando recuperar a entrada anterior. Recuperou, volta para a cobertura ampla.</> }
      : p.recuperacao.escada.tipo === 'tabela'
        ? { titulo: 'Se uma entrada não vem', texto: <>A próxima entrada segue uma <b>escada definida</b>, degrau a degrau, buscando fechar a sequência. Se ela chegar ao seu limite de perda, a sessão para.</> }
        : { titulo: 'Se uma entrada não vem', texto: <>A I.A. <b>recalcula a próxima entrada na hora</b>, pelo pagamento real do contrato, buscando cobrir o que ficou para trás{margem >= 0.02 ? <> com cerca de <b>{pct(margem)} sobre a entrada</b></> : ''}. Se a sequência chegar ao seu limite de perda, a sessão para.</> },
    { titulo: 'Perfis de operação', texto: agressivo
      ? <><b>Conservador ou agressivo</b>, você escolhe na hora de ligar. No conservador, a recuperação busca cobrir o que ficou para trás; no agressivo, busca um ganho maior na volta. Os dois param no seu limite de perda.</>
      : <><b>Conservador.</b> A recuperação busca cobrir o que ficou para trás, sem acelerar, e para no seu limite de perda.</> },
    { titulo: 'Você no comando', texto: <>Antes de ligar, você define o <b>valor de entrada</b>, a <b>meta</b> e o <b>limite de perda</b>. A I.A. respeita os três e para sozinha quando bate a meta ou o limite.</> },
  ]
  return lista1
}

function ModalDoRobo({ i, nome, base, parametros, aoFechar, aoIniciar, trancada = false }: {
  trancada?: boolean
  i: Identidade; nome: string; base: string; parametros: ParametrosDoRobo; aoFechar: () => void; aoIniciar: () => void
}) {
  const v = (MARCA.vitrineDosRobos ?? {})[i.id]
  const fechar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fechar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    // A página de trás não rola junto (no iPhone, o "rolar através" do modal)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes }
  }, [aoFechar])
  const ganham = digitosQueGanham(parametros.contrato)
  return (
    <div className="vr-modal-fundo" onClick={aoFechar}>
      <div className="vr-modal" role="dialog" aria-modal="true" aria-labelledby="vr-modal-nome" onClick={(e) => e.stopPropagation()}>
        <button ref={fechar} type="button" className="vr-modal-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        <div className="vr-modal-rolagem">
          <header className="vr-modal-capa">
            <img src={`${base}${i.id}.webp`} alt="" />
            <div>
              <span className="vr-chamada">{v?.aeronave ?? i.chamada}</span>
              <h3 id="vr-modal-nome">{temLogotipo(i.nome) ? <LogotipoDaIA nome={i.nome} fio sobreFoto /> : nome}</h3>
              {v?.gancho && <p>{v.gancho}</p>}
            </div>
          </header>

          {v?.historia && (
            <section className="vr-modal-secao">
              <h4><span aria-hidden="true">✦</span> Por que {nome}?</h4>
              <p className="vr-modal-historia">{v.historia}</p>
              {v.credito?.includes('CC') && <small className="vr-credito">Foto: {v.credito.replace(', ', ' · ')}</small>}
            </section>
          )}

          <section className="vr-modal-secao">
            <h4><i className="vr-ao-vivo" aria-hidden="true" /> Detalhes da inteligência artificial</h4>
            <div className="vr-modal-digitos" aria-label={`Ganha com ${faixa(ganham)}`}>
              {Array.from({ length: 10 }, (_, d) => <span key={d} className={ganham.includes(d) ? 'ganha' : ''}>{d}</span>)}
            </div>
            <h5>Plano de voo</h5>
            <ol className="vr-modal-plano">
              {planoDeVoo(i.id, parametros).map((e, k) => <li key={k}><b>{e.titulo}</b><span>{e.texto}</span></li>)}
            </ol>
            <dl className="vr-modal-detalhes">
              {detalhesDaIA(i.id, parametros).map((d) => (
                <div key={d.titulo}><dt>{d.titulo}</dt><dd>{d.texto}</dd></div>
              ))}
            </dl>
          </section>
        </div>
        <footer className="vr-modal-rodape">
          <button type="button" className="vr-iniciar" onClick={aoIniciar}><IconePlay /><span>{trancada ? (ROBOS_A_VENDA[i.id]?.preco ? `Desbloquear o ${nome} · ${ROBOS_A_VENDA[i.id].preco}` : `Desbloquear o ${nome} no Marketplace`) : `Iniciar operações com o ${nome}`}</span></button>
        </footer>
      </div>
    </div>
  )
}

export function VitrineDeRobos({ onConfigurar }: { onConfigurar: () => void }) {
  const disponiveis = useRobosDisponiveis()
  const catalogo = useCatalogoCompleto()
  const falhou = useCatalogoFalhou()
  const vitrine = MARCA.vitrineDosRobos ?? {}
  const [aberto, setAberto] = useState<string | null>(null)
  // as I.A. vendidas à parte que esta pessoa ainda não tem (GlobalFly): cadeado e "Desbloquear"
  const bloqueados = useRobosBloqueados()
  const robos = IDENTIDADES.filter((i) => disponiveis === null || disponiveis.includes(i.id))
  const parametrosDe = (i: Identidade) => catalogo?.find((c) => c.id === i.id)?.parametros ?? parametrosPadrao(i.id)
  const regra = (i: Identidade) => {
    const item = catalogo?.find((c) => c.id === i.id)
    return item ? descrever(i.id, item.parametros ?? parametrosPadrao(i.id)) : i.descricao
  }
  // Sem o prefixo da marca: "GF Raptor" (ou "GlobalFly Raptor", antes de 19/10) vira "Raptor".
  const nomeCurto = (i: Identidade) => i.nome.replace(new RegExp(`^(GF|${MARCA.prosa.split(' ')[0]})\\s+`, 'i'), '')
  const iniciar = (i: Identidade) => { setAberto(null); pedirModeloDaVitrine(i.id); onConfigurar() }
  const base = `${import.meta.env.BASE_URL}robos-${MARCA.id}/`
  const doModal = robos.find((i) => i.id === aberto)

  return (
    <section className="vr" aria-labelledby="vr-titulo">
      <header className="vr-cabeca">
        <div>
          {/* Textos sugeridos pelo Victor (19/10/2026). */}
          <h3 id="vr-titulo">Escolha a sua I.A. e comece <b>agora</b>!</h3>
          <p>{robos.length ? `${robos.length} estratégias, cada uma pensada para o seu perfil, seja ele agressivo ou conservador.` : 'Estratégias pensadas para o seu perfil, seja ele agressivo ou conservador.'}</p>
        </div>
        <small>As operações só começam depois da sua confirmação.</small>
      </header>
      {/* 30/10/2026 (Victor: tela em branco): sem a lista, a vitrine diz o que houve em vez de ficar vazia */}
      {robos.length === 0 && (
        <div className="vr-sem-lista" role={falhou ? 'alert' : 'status'}>
          {falhou ? <>
            <b>Não conseguimos carregar as I.A. agora.</b>
            <span>Pode ser a internet ou o seu acesso, que venceu. Tente de novo; se continuar, saia e entre na sua conta.</span>
            <button type="button" onClick={recarregarCatalogo}>Tentar de novo</button>
          </> : catalogo === null ? <span>Carregando as I.A.…</span> : <span>Nenhuma I.A. disponível no momento.</span>}
        </div>
      )}
      <div className="vr-grade" role="list">
        {robos.map((i) => {
          const v = vitrine[i.id]
          const nome = nomeCurto(i)
          const trancada = bloqueados.has(i.id)
          return (
            <article key={i.id} className={`vr-cartao ${trancada ? 'vr-trancada' : ''}`} role="listitem">
              <div className="vr-foto">
                <img src={`${base}${i.id}.webp`} srcSet={`${base}${i.id}-pequena.webp 640w, ${base}${i.id}.webp 1200w`}
                  sizes="(max-width: 700px) 82vw, (max-width: 1279px) 30vw, 20vw" alt="" loading="lazy" decoding="async" width="1200" height="750" />
                <span className="vr-foto-nome"><b>{temLogotipo(i.nome) ? <LogotipoDaIA nome={i.nome} fio sobreFoto /> : nome}</b></span>
                {trancada && <span className="vr-cadeado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3" /></svg>Exclusiva</span>}
                <button type="button" className="vr-porque" aria-haspopup="dialog" onClick={() => setAberto(i.id)}>
                  <span aria-hidden="true">✦</span> Por que {nome}?
                </button>
              </div>

              <div className="vr-corpo">
                <span className="vr-chamada">{v?.aeronave ?? i.chamada}</span>
                {v?.gancho && <p className="vr-gancho">{v.gancho}</p>}
                <NaPratica id={i.id} parametros={parametrosDe(i)} frase={regra(i)} aoAbrir={() => setAberto(i.id)} />
                {trancada ? (
                  <button type="button" className="vr-iniciar vr-desbloquear" onClick={() => irParaTela('marketplace')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0" /></svg><span>{ROBOS_A_VENDA[i.id]?.preco ? `Desbloquear · ${ROBOS_A_VENDA[i.id].preco}` : 'Desbloquear no Marketplace'}</span>
                  </button>
                ) : (
                  <button type="button" className="vr-iniciar" onClick={() => iniciar(i)}>
                    <IconePlay /><span>Iniciar operações</span>
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {doModal && (
        <ModalDoRobo i={doModal} nome={nomeCurto(doModal)} base={base} parametros={parametrosDe(doModal)} trancada={bloqueados.has(doModal.id)}
          aoFechar={() => setAberto(null)} aoIniciar={() => (bloqueados.has(doModal.id) ? irParaTela('marketplace') : iniciar(doModal))} />
      )}
    </section>
  )
}
