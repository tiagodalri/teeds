// Fixture local: sem autenticação, conexão ou envio de ordens.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RobotLinha } from '../src/components/RobotResumo'
import { RobotLive } from '../src/components/RobotLive'
import { usePreferenciaColuna } from '../src/core/teeds/preferenciaColuna'
import '../src/styles/app.css'
import '../src/styles/tema.css'
import '../src/components/robot-workspace.css'
import '../src/styles/ux-refinements.css'
const config = {valorInicial:.35,valorAoVencer:.35,fatorGale:.05,galeApos:3,valorMaximo:0,takeProfit:10,stopLoss:10,maxOperacoes:0}
const estado: any = {rodando:false,emOperacao:false,operacoes:1,vitorias:1,derrotas:0,perdasSeguidas:0,resultado:.67,movimentado:.35,valorAtual:.35,aguardando:'',motivoParada:null,registros:[],digitos:[],curva:[0,.67],condicao:null,ultimoLucro:.67,emCurso:null,ticksAnalisados:0,latenciaMedia:0,falha:null,historico:[{n:1,contractId:1,valor:.35,entrada:123,saida:123,digitoEntrada:3,digitoSaida:3,lucro:.67,payout:1.02,ganhou:true,quando:Date.now(),esperou:1,contractType:'DIGITOVER'}]}
function Preview() {
  const [admin,setAdmin] = useState(true)
  const [aberta,setAberta] = useState(false)
  const [acoes,setAcoes] = useState(0)
  const [mostrar,alterar] = usePreferenciaColuna('fixture',admin)
  return <div>
    <button onClick={()=>setAdmin(!admin)}>Trocar perfil</button>
    {admin && <button onClick={()=>alterar(!mostrar)}>Alternar coluna</button>}
    <output>{acoes}</output>
    <RobotLinha estado={estado} config={config} moeda="USD" nome="Teste" cor="#ddbb66" numero="#1" inicio={null} demo aberta={aberta} onAbrir={()=>setAberta(v=>!v)} onLigarDeNovo={()=>setAcoes(v=>v+1)} />
    <RobotLive estado={estado} config={config} moeda="USD" nomeEstrategia="Teste" ativo="Volatility 75 Index" titulo="Teste" regra="Teste" ganhaCom={()=>true} mostrarMarkup={admin && mostrar} />
  </div>
}
createRoot(document.getElementById('root')!).render(<Preview />)
