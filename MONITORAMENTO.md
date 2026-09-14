# Monitoramento operacional ao vivo (espelho administrativo)

Documento técnico da funcionalidade. Estado em 14/09/2026: **implementada e
provada localmente; migração aplicada em produção com autorização em 14/09/2026; sites não publicados e servidor não
reiniciado nesta etapa.** As seções 18 a 20 dizem exatamente o que falta para valer em
produção.

## 1. Arquitetura

```
motor (servidor Node)                Supabase (Postgres + Realtime)             painel admin (React, lazy chunk)
──────────────────────               ───────────────────────────────            ──────────────────────────────
MotorTeeds.escutar(estado)           sessoes_robos_ao_vivo  (foto, 1 linha/sessão)   listarEspelhos()  ── REST (snapshot)
  └─ PublicadorEspelho.aoEstado()    pulsos_robos_ao_vivo   (pulso, 1 linha/sessão)  assinarMudancas() ── WebSocket Phoenix
       ├─ evento  → INSERT           eventos_robos_ao_vivo  (append-only, seq)       aplicarMensagem() ── a ÚNICA regra de ordem
       ├─ foto    → UPSERT           auditoria_monitoramento_admin                    RobotLive (a cabine do cliente, sem handlers)
       └─ pulso   → UPSERT (≤1/2 s)  RLS: só admin da marca lê                        auditar() antes de abrir cabine/replay
```

O motor não sabe que o espelho existe: `sessoes.ts` só chama `espelho.aoEstado(e)` dentro de `motor.escutar` e `espelho.encerrar()` na parada. `aoEstado` devolve na hora (sem `await`, sem I/O no caminho do robô). Nada é capturado da tela do cliente: o espelho é reconstruído exclusivamente do `EstadoMotor` que o servidor já produz.

Código: `src/core/teeds/espelho.ts` (puro; DTO, deltas, ordem, saúde, replay), `servidor/src/espelho.ts` (publicador), `servidor/src/supabase.ts` (escritores), `src/core/teeds/realtime.ts` (cliente Phoenix mínimo), `src/core/teeds/monitoramento.ts` (leitura + auditoria), `src/components/MonitoramentoPanel.tsx` (painel), migração `supabase/migracoes/20260914213000_teeds_espelho_operacional_ao_vivo.sql`.

## 2. Camadas de dados

| Camada | Tipo | Onde vive | Conteúdo |
|---|---|---|---|
| Estado interno | `EstadoMotor` | servidor | tudo o que o motor usa para decidir; nunca sai |
| DTO | `EstadoEspelho` | banco/rede | só o que a cabine desenha: contadores, fase, contrato aberto, 30 dígitos, 120 pontos da curva, 30 operações, 20 registros, telemetria da estratégia. Sem token, sem objeto bruto, sem memória da estratégia |
| Pulso | `PulsoEspelho` | banco/rede | fase, dígitos, ticks, texto de espera, condição, dígito atual, telemetria (≈700 B) |
| Evento | `EventoEspelho` | banco (permanente) | `seq`, `tipo`, `delta` (só o que mudou; listas incrementais `historicoNovas`/`registrosNovos`; a curva é derivada), `config` na abertura |
| Cabine | `paraEstadoMotor(dto)` | painel | o formato que `RobotLive` consome |

## 3. Tipos de evento e o que é permanente

`abertura`, `compra`, `liquidacao`, `entrada` (próximo valor), `fase` (aguardando/enviando/operando/recuperando/parado), `estrategia` (troca de fase/estratégia do The Palm), `falha` (recusa da Deriv), `conexao`, `parada`, `foto` (foto completa periódica a cada 5 min e no encerramento). Tick **não** é evento — viaja no pulso.

`EVENTOS_PERMANENTES` = todos menos `conexao`. Permanentes nunca são coalescidos, podados nem descartados pelo publicador.

## 4. Regra de ordem (uma só): `decidir()` / `aplicarMensagem()`

Por sessão, cada mensagem carrega `seq` (a sequência do publicador) e uma origem: `foto`, `evento`, `pulso`, `lista` (reconciliação REST).

- `seq` menor que a última aceita → **antiga**, ignorada.
- mesma `seq`: `pulso` → só campos efêmeros (fita, análise, dígito atual), nunca contadores, e a origem registrada continua sendo a do evento/foto; `foto`/`lista` sobre `evento`/`pulso` → aceita (mais completa); `foto` sobre `foto` e `evento` sobre qualquer coisa → **repetida** (idempotente).
- `seq` maior: **nova**. Se saltou números e é `evento` (delta) → **lacuna**: o painel pede a foto pela REST em vez de aplicar delta sobre estado desconhecido.
- sessão encerrada: nenhum `pulso` é aceito; `lista`/`foto` da mesma `seq` dizendo "rodando" não reabre.
- sessão desconhecida: pede a foto. Sequências são por sessão; uma não interfere na outra.

Provas: `servidor/src/teste-espelho.ts`, bloco B1 (10 casos).

## 5. Publicador: entrega e retentativas

- Uma escrita em voo por sessão; fila própria por sessão (isolamento).
- Ordem de escrita: eventos (em ordem, um a um, cada um só sai da fila depois de confirmado) → foto mais recente → pulso mais recente.
- Falha de evento: o item fica na frente da fila com a mesma `seq`; espera **backoff exponencial 500 ms·2ⁿ (teto 30 s) com jitter 50–150 %**; `23505`/duplicate = sucesso (idempotente pela unicidade `(sessao_id, seq)`).
- Falha de foto: volta a pendente se nenhuma mais nova chegou; falha de pulso: não retenta (o próximo batimento traz um mais novo).
- Pressão de memória: acima de 5 000 itens, poda **só** `conexao`; permanentes continuam entrando (memória antes de perda) e a pressão é registrada.
- `encerrar()`: para o batimento, enfileira a foto final (permanente), drena até esvaziar ou até **120 s**; estourado, registra sessão, `seq` inicial pendente e quantidade. Devolve `Promise`; a parada da sessão não espera por ela.
- Medidas expostas em `medidas` (estados, eventos, fotos, pulsos, pulsosIdenticos, coalescidos, tentativas, falhas, podados, pressao, drenagemEstourada, pendentesAoEstourar).

Provas: bloco B2 (10 casos, escritores falsos com relógio e espera injetados).

## 6. Frequência de gravação

| Fonte | Frequência | Regra |
|---|---|---|
| Evento | imediato | só mudanças operacionais |
| Foto | junto com cada evento (coalescida: só a mais recente) + `foto` periódica a cada 5 min | |
| Pulso | **≤ 1 a cada 2 s por sessão** (`LIMITES.pulsoMs`) | só se a assinatura do conteúdo mudou; presença renovada a cada 10 s mesmo sem mudança |

Ticks do intervalo chegam em lote no pulso (a fita inteira). Não há mais microcoalescência de 200 ms para pulso — o requisito de "≤ 1 por 2 s" prevaleceu.

### Medição de laboratório (`npm run espelho-carga`, escritores falsos, 1 tick/s, compra a cada 6 ticks)

Rodar `SESSOES=N DURACAO_MS=ms npm run espelho-carga` em `servidor/`. Os números do último laboratório estão na saída do comando e no relatório de entrega; a extrapolação linear para 10/100/1000 robôs sai impressa. O que **não** foi medido: latência do PostgREST real, CPU do Realtime da Supabase, custo de `REPLICA IDENTITY FULL` sob carga, limites de conexões concorrentes do plano. Estimativas de 1 000 robôs exigem teste em homologação antes de valer.

## 7. Saúde do sinal e latência

- **Idade da atualização**: `agora − recebidoEm`, pelo relógio **local** do painel. Faixas: ao vivo ≤ 2,5 s; atenção ≤ 6 s; desatualizado acima; encerrada. Mostrada como "atualizado há X,X s".
- **Ida e volta do canal (RTT)**: medida pelo `ref` do heartbeat do WebSocket (mediana das últimas 20, arredondada a 50 ms). É a única medida de latência de rede exibida.
- **Desvio de relógio**: mediana de `recebidoEm − emitidoEm`; só informativo ("relógio do servidor ≈ −2 s"), nunca usado para saúde. Desvio de ±2 s não altera a saúde (prova B4.6).
- Não é exibida precisão em milissegundos que o método não sustente.

## 8. Replay

- Fonte: `eventos_robos_ao_vivo` (retenção 30 dias), carregado por páginas de 500 com `AbortController` (troca de sessão cancela).
- Reconstrução: começa na `abertura` ou na primeira `foto`; deltas incrementais; lacunas contadas e mostradas, nunca preenchidas; a próxima foto realinha.
- Integridade: completo / carregando / lacunas / indisponível / em andamento.
- Controles: reproduzir/pausar (Espaço), reiniciar (Home), fim (End), evento anterior/próximo (← →), operação anterior/próxima, ir para o instante (campo de hora), linha do tempo com marcadores (compra, ganho, perda, fase, estratégia, erro, parada).
- Velocidades 0,25× · 0,5× · 1× · 2× · 4×. Inatividade > 8 s entre eventos é saltada em 1,2 s com aviso "inatividade de N s saltada".
- Descrição dos eventos lê `historicoNovas` (corrigido): ganho/perda/empate, valor, dígitos entrada → saída, acumulado, horário.

## 9. Auditoria (fail-closed)

Eventos registrados pela RPC `teeds_auditar_monitoramento`: abrir/fechar painel, abrir/fechar cabine ao vivo, abrir/fechar replay, busca (`buscou`, com atraso de 1,5 s e sem o termo), tentativa negada (`negado`, via `teeds_auditar_negado`, limitada a 1/min).

- Cabine e replay **não abrem** se o registro de abertura falhar (mensagem "Não foi possível registrar a auditoria deste acesso"). Não há `catch` vazio: falhas de fechamento vão para `console.error`.
- O banco valida: quem chama é admin da marca; sessão e cliente pertencem à marca; sessão e cliente combinam.

## 10. Segurança do banco (migração)

- FKs compostas: `sessoes_robos_ao_vivo(sessao_id, marca, user_id) → sessoes_robos(id, marca, user_id)`; pulsos e eventos `(sessao_id, marca) → (id, marca)`. Exige as unicidades novas `sessoes_robos(id, marca)` e `(id, marca, user_id)`.
- RLS: só `SELECT`, só `authenticated`, só `teeds_sou_admin_da(marca)`. Nenhuma política de escrita; `REVOKE` explícito de insert/update/delete/truncate para `anon` e `authenticated`.
- Funções `SECURITY DEFINER` com `SET search_path = public`; `REVOKE ALL FROM public, anon`; `GRANT EXECUTE` mínimo (`authenticated` para auditar; `service_role` para limpar).
- Índices: `(marca, atualizada_em desc)` nas fotos/pulsos; `(sessao_id, seq)` único; `(marca, criado_em desc)` e `(criado_em)` nos eventos; auditoria por marca, admin, cliente, sessão.
- Retenção: eventos 30 d, fotos/pulsos de sessões encerradas 30 d, auditoria 365 d (`teeds_limpar_espelho`, diária, chamada pelo servidor).
- Crescimento: com o perfil de laboratório, cada robô-dia gera da ordem de 10³ eventos (~300 B) + 1 foto viva; 100 robôs × 30 dias ≈ 3 milhões de linhas de eventos (~1 GB com índices). Acima disso, particionar `eventos_robos_ao_vivo` por mês.

## 11. Testes SQL

`supabase/testes/monitoramento-autorizacao.sql`: fixtures próprias (4 usuários, 2 admins, 2 sessões), tudo em `BEGIN … ROLLBACK`, cada prova falha com exceção, ~35 provas (anon, cliente, admin Teeds, admin OMNI, service_role, integridade relacional, inventário de políticas e grants). Rodar **em homologação, depois da migração**:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/testes/monitoramento-autorizacao.sql
```

**Não foi executado** contra o banco de produção nem contra nenhum banco: não há migração aplicada.

## 12. Cliente Realtime

`assinarMudancas`: Phoenix vsn 1.0.0; `phx_join` com `postgres_changes` + `access_token`; "ao vivo" só após `phx_reply ok`; heartbeat 25 s com `ref` (RTT); silêncio > 65 s religa; backoff 1 s·2ⁿ (teto 30 s) com jitter ±50 %; token expirado vira estado `token-expirado` (sem loop); `access_token` para renovar; `phx_leave` no fechar; dedupe por (tabela, commit_timestamp, sessao_id, seq, id); mensagens de socket antigo descartadas; StrictMode-safe. Ao reconectar, o painel recarrega a lista **antes** de exibir "ao vivo".

Provas: `servidor/src/teste-realtime.ts` (30 casos) com transporte simulado. **A compatibilidade com o servidor Realtime real da Supabase não está provada** — exige ambiente com a migração aplicada.

## 13. Painel administrativo

Mosaico (compacto/confortável/lista), filtros (operando/encerradas/todas, período 1 h–3 dias, demo/real, robô, resultado), ordenações (atualização, risco, pior resultado, mais operações, início, nome), "Mostrar mais" em lotes de 60 (+ `content-visibility: auto`), selo **"Somente visualização"**, estados: carregando, vazio, sem permissão (registra tentativa), Supabase indisponível (tentar de novo), erro, reconectando, sessão expirada, desatualizado (por cartão), encerrada, lacuna, histórico indisponível. A cabine usa `RobotLive` **sem** handlers: a barra de ações fica vazia — a regra CSS que a escondia foi removida. Foco volta ao elemento de origem ao fechar; Esc fecha; `aria-live`/`role=status|alert` nos estados.

## 14. Desempenho no painel

- Cartão memoizado por `(sessão, ficha, saúde, disposição)`; a saúde é calculada uma vez por segundo num `Map` e passada como prop — o relógio não redesenha o mosaico.
- Sem `JSON.stringify` no caminho quente (`delta` compara campo a campo).
- Assinatura única por painel; `fechar()` no desmontar; timers limpos; `AbortController` no replay.

## 15. The Palm

`telemetria(ctx)` expõe fase virtual/real, estratégia anterior, motivo da troca, contrato/barreira, contadores. Prova de determinismo: mesma sequência de decisões com e sem telemetria (B12.1). O motor chama a telemetria dentro de `telemetriaSegura()` (try/catch): se lançar, o campo fica nulo, o robô segue e o erro vai ao registro técnico uma vez (B12.8). Sem `await` no caminho.

## 16. Não regressão do cliente

- Nenhum arquivo do fluxo do cliente ganhou requisição, indicador ou menu: `WorkspaceNav` só renderiza o item dentro de `{admin && …}`; `App.tsx` só monta o painel com `admin === true` e via `lazy()`; o chunk `MonitoramentoPanel.js` só é baixado ao abrir a tela.
- `servidor.ts` remove `estrategia` do estado enviado ao cliente (`enxuto()`).
- Tamanhos do bundle e comparação com o commit anterior: no relatório de entrega (seção "Verificações").

## 17. Limitações conhecidas

1. Compatibilidade real com o Realtime da Supabase não provada (só transporte simulado).
2. Testes SQL não executados (sem banco com a migração).
3. Números de carga são de laboratório, sem rede.
4. O Realtime entrega a linha de `sessoes_robos_ao_vivo` sem a mãe (`sessoes_robos`): sessões novas são completadas por uma leitura REST.
5. Retenção de 30 dias exige monitorar o crescimento antes de escalar acima de ~100 robôs.

## 18. Como aplicar (pendente de autorização)

Atualização 14/09/2026: migração 20260914213000 aplicada pelo SQL Editor no projeto wonxykovfvfnuhzpqsle e registrada em supabase_migrations.schema_migrations. Execução em transação, lock_timeout de 3 s e statement_timeout de 30 s. Conferência posterior: quatro tabelas com RLS ativa e uma política SELECT para admin da marca em cada uma; INSERT negado a authenticated e permitido a service_role; as três tabelas operacionais incluídas no Realtime. Isso valida a configuração, não substitui os testes de isolamento com usuários nem a integração WebSocket. Não foram criados usuários de teste, enviadas ordens ou executada a limpeza de retenção. Exportação do histórico para o repositório e validação ponta a ponta ainda pendentes.

1. Aplicar a migração `20260914213000_teeds_espelho_operacional_ao_vivo.sql` (rollback comentado no fim do arquivo).
2. Rodar os testes SQL em homologação.
3. Exportar o esquema (`scripts/exportar-banco.sh`).
4. Publicar o servidor (`servidor/`), reiniciar; conferir o log "Espelho operacional: ligado".
5. Publicar Teeds e OMNI.
6. Abrir o painel como admin de cada marca e confirmar: canal "ao vivo", RTT, uma cabine, um replay, auditoria gravada.

## 19. Rollback

Site: republicar o commit anterior. Servidor: `ESPELHO_DESLIGADO=1`, seguido de reinício controlado, impede novos publicadores e desliga a faxina. Não altera sessões já existentes em um processo em execução. O publicador só existe quando há sessão gravada e o Supabase configurado. Sem tabelas, haverá erros e retentativas; não ativar antes da migração. A drenagem após encerramento é limitada a 120 s; durante a sessão, a fila de eventos permanentes pode crescer. Banco: bloco de rollback no fim da migração.

## 20. Comandos

```bash
npm run separacao                      # trava de separação + provas (marcas, motor, espelho, realtime) + builds
cd servidor && npm run espelho         # provas do espelho
cd servidor && npm run realtime        # provas do cliente Realtime (transporte simulado)
cd servidor && npm run espelho-carga   # laboratório de carga (SESSOES=, DURACAO_MS=)
```
