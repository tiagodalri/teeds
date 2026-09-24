# Proposta de redação — monitoramento operacional (Teeds e OMNI)

**Status: rascunho para revisão do Tiago. Não publicado.**

Objetivo: descrever, nos Termos de Uso e na Política de Privacidade das duas
marcas, a coleta e o uso dos dados operacionais gerados pela própria
plataforma quando um robô está ligado — o que o painel "Monitoramento ao
vivo" da administração lê. Texto único, com a marca trocada pela variável
`{MARCA}` (Teeds / OMNI).

---

## Termos de Uso — nova cláusula "Acompanhamento operacional"

**X. Acompanhamento operacional das sessões de robô.**
Ao ligar um robô, o cliente autoriza a {MARCA} a registrar e acompanhar,
inclusive em tempo real, os dados operacionais gerados pela própria
plataforma durante a sessão: robô e estratégia escolhidos, ativo, valores de
entrada, meta e limite de perda configurados, contratos comprados e
liquidados, resultados, sequências de recuperação, análises da estratégia,
estado da conexão com a corretora e horários. Esses dados são produzidos
pelo servidor que executa o robô — e não pelo navegador do cliente — e são
os mesmos que aparecem na cabine do próprio cliente.

O acompanhamento serve a: (i) suporte ao cliente; (ii) segurança e prevenção
de uso indevido; (iii) diagnóstico de falhas; (iv) auditoria interna; e
(v) melhoria do produto. Ele é feito exclusivamente por administradores da
{MARCA}, com registro de cada acesso (quem, quando e qual sessão).

O acompanhamento operacional **não** inclui, em nenhuma hipótese: captura de
tela, vídeo ou áudio; câmera ou microfone; teclado, mouse ou área de
transferência; outras abas, aplicativos ou arquivos do dispositivo; senhas,
tokens de acesso, chaves de API ou dados completos de cartão; nem conteúdo
de mensagens. A {MARCA} não executa operações na conta do cliente por meio
desse acompanhamento: o painel é somente leitura.

## Política de Privacidade — novo item em "Quais dados tratamos"

**Dados operacionais das sessões de robô.** Quando você liga um robô, o
servidor da {MARCA} registra a sessão e cada operação (valores, contratos,
resultados, análises da estratégia, estado da conexão e horários), com o
identificador da sua conta na corretora de forma mascarada nas telas
administrativas. Base legal: execução do contrato (art. 7º, V, LGPD) e
legítimo interesse para segurança e prevenção a fraudes (art. 7º, IX).
Finalidades: prestar o serviço, dar suporte, diagnosticar falhas, auditar e
melhorar o produto.

**Quem acessa.** Somente administradores da {MARCA}, cada um restrito à sua
própria plataforma. Todo acesso a uma sessão pelo painel de monitoramento
fica registrado (administrador, data e hora, sessão e cliente visualizados,
ao vivo ou histórico).

**Por quanto tempo.** O detalhe evento a evento de cada sessão é mantido por
14 dias; a foto final e o resumo da sessão, pelo prazo geral do histórico de
operações; os registros de acesso administrativo, por 12 meses.

**O que não coletamos.** Não capturamos tela, vídeo, áudio, câmera,
microfone, teclado, mouse, área de transferência, outras abas ou
aplicativos, arquivos locais, localização precisa, senhas, tokens ou chaves.
A localização aproximada usada em estatísticas vem apenas do fuso horário e
do idioma informados pelo navegador.

**Seus direitos.** Continuam os já descritos nesta Política (acesso,
correção, eliminação, portabilidade e oposição), pelo canal de atendimento
da {MARCA}.

---

## Notas para a revisão

1. Conferir com o jurídico a base legal escolhida para o legítimo interesse
   (segurança/prevenção a fraudes) e se cabe um aviso curto na tela de
   ligar o robô — o pedido atual é de **nenhuma** mudança visual no cliente,
   então a proposta é descrever apenas nos documentos.
2. Os prazos (14 dias / 12 meses) espelham a retenção implementada no banco
   (`teeds_limpar_espelho`). Se o jurídico pedir outros, a função aceita
   parâmetros.
3. A descrição vale para as duas marcas; publicar em cada domínio com o
   nome respectivo.
