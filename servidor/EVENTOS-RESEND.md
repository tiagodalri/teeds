# Acompanhamento de e-mails

O painel administrativo consulta a lista do Resend e complementa cada envio com eventos assinados de entrega, abertura e clique. Contagens referem-se aos registros carregados, não ao total da conta. A atualização automática ocorre a cada 30 segundos enquanto a aba está visível; carregar mais pausa a atualização para preservar a consulta ao histórico.

## Ativação

- Migração aplicada: `20260930174704_teeds_eventos_resend_restritos`. Não reaplicar o arquivo de preparo `sql/eventos-resend.sql`.
- No servidor, executar `node --env-file=.env configurar-eventos-resend.mjs`. Configura o webhook e grava o segredo exclusivamente no `.env` do servidor.
- Publicar/reiniciar o serviço sem interromper robôs ativos, então executar o mesmo comando com `--ativar`.
- Endpoint: `/gancho/resend-eventos`. Autenticação por assinatura Svix sobre o corpo cru; limite de 64 KiB e janela de cinco minutos. Respostas 503 provocam retentativa do provedor.

## Segurança e precisão

### Estado conferido em 30/09/2026

Webhook criado e habilitado para as duas marcas; teste HTTP confirmou assinatura válida (200, remetente de fixture ignorado sem gravação) e ausência de assinatura (401). Consultas reais do painel retornaram registros sem conteúdo sensível e sem erro no histórico de eventos. As duas publicações responderam com o novo painel.

**Ativação de rastreamento ainda não confirmada:** a API do Resend respondeu HTTP 200 às atualizações, mas as leituras seguintes continuaram devolvendo `open_tracking=false` e `click_tracking=false` em ambos os domínios. Não considerar ativado pelo simples sucesso do PATCH. Conferir em Resend → Domains → domínio → Configuration e ativar Open Tracking / Click Tracking. O painel consulta o estado novamente (cache de até cinco minutos). A interface de navegador automatizada estava indisponível durante esta conferência. Nenhum disparo de teste foi enviado a clientes.

- Um evento é deduplicado pelo `svix-id`; reentregas não aumentam a contagem.
- Persistência guarda apenas ID, marca, tipo e horários. Não guarda corpo, senha, token, IP, destinatário ou URL clicada.
- Marcas são determinadas pelo remetente configurado, não por um parâmetro enviado pelo navegador.
- Banco e view não são acessíveis por visitantes/clientes. Somente o servidor, após conferir a permissão administrativa, consulta os resumos.
- A view usa `security_invoker`. Eventos fora de ordem preservam primeira e última ocorrência cronológica.
- Abertura/clique são sinais técnicos e podem vir de aplicativos ou verificadores. Não comprovam leitura humana. Ausência de evento não significa ausência de leitura.
- Não há retroatividade para mensagens enviadas com rastreamento desativado. O status antigo pode existir sem horários/contagens. A lista de mensagens permanece limitada à retenção do Resend.
- Se o banco de eventos estiver indisponível, o painel conserva o status do Resend e informa a limitação, sem inventar resultados.

## Testes

`teste-eventos-resend.ts`: assinaturas, adulteração, dados mínimos, erros recuperáveis e sinais sem inferência de leitura.

`teste-admin-emails.ts`: separação de marcas, paginação assinada, cache e credenciais.

`PGLITE_MODULE=/caminho/pglite/dist/index.js node servidor/teste-eventos-banco.mjs`: contagens, ordem temporal e permissões em banco isolado.

`preview/emails.html`: fixture visual com consulta interceptada, sem dados reais.
